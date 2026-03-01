"""Tests for NTFS hardening and DPAPI encryption services.

All DPAPI calls are mocked so tests run without real Windows credentials
and remain deterministic.  NTFS tests mock subprocess to avoid touching
real filesystem permissions.
"""
import json
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


# ── NTFS service tests ────────────────────────────────────────────────────────

class TestNtfsService:
    def test_harden_skips_on_non_windows(self, tmp_path):
        from app.services.ntfs_service import harden_data_dir
        with patch("app.services.ntfs_service.os") as mock_os:
            mock_os.name = "posix"
            mock_os.environ = {}
            harden_data_dir(tmp_path)
            # subprocess should never be called

    def test_harden_skips_missing_username(self, tmp_path):
        from app.services.ntfs_service import harden_data_dir
        with patch("app.services.ntfs_service.os") as mock_os, \
             patch("app.services.ntfs_service.subprocess") as mock_sub:
            mock_os.name = "nt"
            mock_os.environ = {"USERNAME": ""}
            harden_data_dir(tmp_path)
            mock_sub.run.assert_not_called()

    def test_harden_skips_missing_directory(self, tmp_path):
        from app.services.ntfs_service import harden_data_dir
        missing = tmp_path / "does_not_exist"
        with patch("app.services.ntfs_service.os") as mock_os, \
             patch("app.services.ntfs_service.subprocess") as mock_sub:
            mock_os.name = "nt"
            mock_os.environ = {"USERNAME": "TestUser"}
            harden_data_dir(missing)
            mock_sub.run.assert_not_called()

    def test_harden_calls_icacls(self, tmp_path):
        from app.services.ntfs_service import harden_data_dir
        mock_result = MagicMock()
        mock_result.returncode = 0
        with patch("app.services.ntfs_service.os") as mock_os, \
             patch("app.services.ntfs_service.subprocess") as mock_sub:
            mock_os.name = "nt"
            mock_os.environ = {"USERNAME": "TestUser"}
            mock_sub.run.return_value = mock_result
            harden_data_dir(tmp_path)
            mock_sub.run.assert_called_once()
            args = mock_sub.run.call_args[0][0]
            assert "icacls" in args
            assert "/inheritance:r" in args
            assert any("TestUser" in a for a in args)

    def test_harden_logs_warning_on_non_zero_returncode(self, tmp_path, caplog):
        from app.services.ntfs_service import harden_data_dir
        import logging
        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stderr = "access denied"
        mock_result.stdout = ""
        with patch("app.services.ntfs_service.os") as mock_os, \
             patch("app.services.ntfs_service.subprocess") as mock_sub:
            mock_os.name = "nt"
            mock_os.environ = {"USERNAME": "TestUser"}
            mock_sub.run.return_value = mock_result
            with caplog.at_level(logging.WARNING, logger="app.services.ntfs_service"):
                harden_data_dir(tmp_path)
            assert any("non-zero" in r.message for r in caplog.records)


# ── DPAPI service tests ───────────────────────────────────────────────────────

# Helper: fake DPAPI encrypt/decrypt using XOR (deterministic, no Windows dep)
def _fake_protect(data: bytes) -> bytes:
    return bytes(b ^ 0xAA for b in data)

def _fake_unprotect(data: bytes) -> bytes:
    return bytes(b ^ 0xAA for b in data)


class TestDpapiService:

    @pytest.fixture
    def mock_dpapi(self, tmp_path, monkeypatch):
        """Patch DPAPI to use fake XOR cipher and redirect file to tmp_path."""
        import app.services.dpapi_service as svc
        monkeypatch.setattr(svc, "is_dpapi_available", lambda: True)
        monkeypatch.setattr(svc, "_protect", _fake_protect)
        monkeypatch.setattr(svc, "_unprotect", _fake_unprotect)
        monkeypatch.setattr("app.services.dpapi_service.get_data_dir", lambda: tmp_path)  # type: ignore[attr-defined]
        # Patch inside module where it's imported
        with patch("app.services.dpapi_service._dpapi_path", return_value=tmp_path / "secrets.dpapi"):
            yield tmp_path

    def test_save_and_load_roundtrip(self, mock_dpapi):
        from app.services.dpapi_service import save_secrets, load_secrets
        data = {"TG_API_ID": "12345", "TG_API_HASH": "abcdef"}
        assert save_secrets(data) is True
        loaded = load_secrets()
        assert loaded["TG_API_ID"] == "12345"
        assert loaded["TG_API_HASH"] == "abcdef"

    def test_save_merges_with_existing(self, mock_dpapi):
        from app.services.dpapi_service import save_secrets, load_secrets
        save_secrets({"KEY_A": "alpha"})
        save_secrets({"KEY_B": "beta"})
        loaded = load_secrets()
        assert loaded["KEY_A"] == "alpha"
        assert loaded["KEY_B"] == "beta"

    def test_load_returns_empty_when_file_missing(self, mock_dpapi):
        from app.services.dpapi_service import load_secrets
        loaded = load_secrets()
        assert loaded == {}

    def test_save_skips_when_dpapi_unavailable(self, tmp_path, monkeypatch):
        import app.services.dpapi_service as svc
        monkeypatch.setattr(svc, "is_dpapi_available", lambda: False)
        result = svc.save_secrets({"TG_API_ID": "x"})
        assert result is False

    def test_load_returns_empty_when_dpapi_unavailable(self, tmp_path, monkeypatch):
        import app.services.dpapi_service as svc
        monkeypatch.setattr(svc, "is_dpapi_available", lambda: False)
        loaded = svc.load_secrets()
        assert loaded == {}

    def test_inject_secrets_into_env(self, mock_dpapi, monkeypatch):
        from app.services.dpapi_service import save_secrets, inject_secrets_into_env
        save_secrets({"TG_API_ID": "99999", "TG_API_HASH": "secret_hash"})

        # Remove from env first so we can verify injection
        monkeypatch.delenv("TG_API_ID", raising=False)
        monkeypatch.delenv("TG_API_HASH", raising=False)

        inject_secrets_into_env()

        assert os.environ.get("TG_API_ID") == "99999"
        assert os.environ.get("TG_API_HASH") == "secret_hash"

    def test_inject_does_not_overwrite_existing_env(self, mock_dpapi, monkeypatch):
        from app.services.dpapi_service import save_secrets, inject_secrets_into_env
        save_secrets({"TG_API_ID": "from_dpapi"})
        monkeypatch.setenv("TG_API_ID", "already_set")

        inject_secrets_into_env()

        # setdefault semantics: existing value preserved
        assert os.environ["TG_API_ID"] == "already_set"

    def test_has_secrets_false_when_empty(self, mock_dpapi):
        from app.services.dpapi_service import has_secrets
        assert has_secrets() is False

    def test_has_secrets_true_after_save(self, mock_dpapi):
        from app.services.dpapi_service import save_secrets, has_secrets
        save_secrets({"KEY": "value"})
        assert has_secrets() is True

    def test_migrate_keys_from_env(self, mock_dpapi, tmp_path):
        from app.services.dpapi_service import migrate_keys_from_env, load_secrets

        env_file = tmp_path / ".env"
        env_file.write_text(
            'TG_API_ID="123"\nTG_API_HASH="secret"\nTG_SESSION_NAME="user"\n',
            encoding="utf-8",
        )

        result = migrate_keys_from_env(env_file, ("TG_API_ID", "TG_API_HASH"))
        assert result is True

        # Secrets are now in DPAPI
        secrets = load_secrets()
        assert secrets["TG_API_ID"] == "123"
        assert secrets["TG_API_HASH"] == "secret"

        # And removed from .env
        from dotenv import dotenv_values
        remaining = dotenv_values(str(env_file))
        assert "TG_API_ID" not in remaining
        assert "TG_API_HASH" not in remaining
        # Non-sensitive key preserved
        assert remaining.get("TG_SESSION_NAME") == "user"

    def test_migrate_skips_when_dpapi_unavailable(self, tmp_path, monkeypatch):
        import app.services.dpapi_service as svc
        monkeypatch.setattr(svc, "is_dpapi_available", lambda: False)
        env_file = tmp_path / ".env"
        env_file.write_text('TG_API_ID="123"\n', encoding="utf-8")
        result = svc.migrate_keys_from_env(env_file)
        assert result is False
        # .env unchanged
        assert "123" in env_file.read_text()

    def test_migrate_skips_keys_not_in_env(self, mock_dpapi, tmp_path):
        from app.services.dpapi_service import migrate_keys_from_env
        env_file = tmp_path / ".env"
        env_file.write_text('TG_SESSION_NAME="user"\n', encoding="utf-8")
        # No TG_API_ID / TG_API_HASH in .env → nothing to migrate
        result = migrate_keys_from_env(env_file, ("TG_API_ID", "TG_API_HASH"))
        assert result is False


# ── Integration: PIN set triggers migration ───────────────────────────────────

class TestPinSetMigration:
    def test_pin_set_calls_migrate_env_secrets(self, client, monkeypatch, tmp_path):
        """When PIN is set, _migrate_env_secrets should be called."""
        import app.routers.pin as pin_router

        called = []

        def fake_migrate():
            called.append(True)

        monkeypatch.setattr(pin_router, "_migrate_env_secrets", fake_migrate)

        res = client.post("/auth/pin/set", json={"pin": "1234"})
        assert res.status_code == 200
        assert len(called) == 1
