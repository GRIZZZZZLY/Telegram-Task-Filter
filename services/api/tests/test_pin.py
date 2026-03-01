"""Tests for PIN authentication: service, router, and middleware."""
import json
import pytest
from unittest.mock import patch


# ── pin_service unit tests ────────────────────────────────────────────────────

class TestPinService:
    """Unit tests for pin_service functions (isolated with tmp_path)."""

    def test_is_pin_set_false_initially(self, isolate_pin_service):
        from app.services.pin_service import is_pin_set
        assert is_pin_set() is False

    def test_set_and_verify_pin(self, isolate_pin_service):
        from app.services.pin_service import is_pin_set, set_pin, verify_pin
        set_pin("1234")
        assert is_pin_set() is True
        token = verify_pin("1234")
        assert token is not None
        assert len(token) == 64  # hex(32 bytes)

    def test_wrong_pin_returns_none(self, isolate_pin_service):
        from app.services.pin_service import set_pin, verify_pin
        set_pin("1234")
        assert verify_pin("0000") is None

    def test_pin_must_be_4_to_6_digits(self, isolate_pin_service):
        from app.services.pin_service import set_pin
        with pytest.raises(ValueError):
            set_pin("123")  # too short
        with pytest.raises(ValueError):
            set_pin("1234567")  # too long
        with pytest.raises(ValueError):
            set_pin("abcd")  # not digits

    def test_verify_token(self, isolate_pin_service):
        from app.services.pin_service import set_pin, verify_pin, verify_token
        set_pin("5678")
        token = verify_pin("5678")
        assert verify_token(token) is True
        assert verify_token("bogus") is False

    def test_revoke_token(self, isolate_pin_service):
        from app.services.pin_service import set_pin, verify_pin, verify_token, revoke_token
        set_pin("1111")
        token = verify_pin("1111")
        assert verify_token(token) is True
        revoke_token(token)
        assert verify_token(token) is False

    def test_set_pin_clears_tokens(self, isolate_pin_service):
        from app.services.pin_service import set_pin, verify_pin, verify_token
        set_pin("1234")
        token = verify_pin("1234")
        assert verify_token(token) is True
        # Change PIN → old token invalidated
        set_pin("5678")
        assert verify_token(token) is False

    def test_lockout_after_max_attempts(self, isolate_pin_service):
        from app.services.pin_service import set_pin, verify_pin, get_lockout_info
        import app.services.pin_service as ps
        # Reset state
        ps._failed_attempts = 0
        ps._lockout_until = 0.0

        set_pin("9999")
        for _ in range(ps._MAX_ATTEMPTS):
            verify_pin("0000")
        info = get_lockout_info()
        assert info["locked"] is True
        assert info["remaining_seconds"] > 0
        # Even correct PIN should fail during lockout
        assert verify_pin("9999") is None

    def test_remove_pin(self, isolate_pin_service):
        from app.services.pin_service import set_pin, is_pin_set, remove_pin
        set_pin("1234")
        assert is_pin_set() is True
        remove_pin()
        assert is_pin_set() is False

    def test_pin_file_stored_in_data_dir(self, isolate_pin_service):
        from app.services.pin_service import set_pin
        set_pin("4321")
        pin_file = isolate_pin_service / "pin.json"
        assert pin_file.exists()
        data = json.loads(pin_file.read_text())
        assert "pin_hash" in data
        # Hash should NOT be the raw PIN
        assert data["pin_hash"] != "4321"


# ── Router tests ──────────────────────────────────────────────────────────────

class TestPinRouter:
    """Integration tests for /auth/pin/* endpoints."""

    def test_status_no_pin(self, client):
        res = client.get("/auth/pin/status")
        assert res.status_code == 200
        data = res.json()
        assert data["pin_set"] is False

    def test_set_pin_first_time(self, client):
        res = client.post("/auth/pin/set", json={"pin": "1234"})
        assert res.status_code == 200
        data = res.json()
        assert data["ok"] is True
        assert data["token"] is not None

    def test_verify_pin(self, client):
        client.post("/auth/pin/set", json={"pin": "1234"})
        res = client.post("/auth/pin/verify", json={"pin": "1234"})
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["token"] is not None

    def test_verify_wrong_pin(self, client):
        client.post("/auth/pin/set", json={"pin": "1234"})
        res = client.post("/auth/pin/verify", json={"pin": "0000"})
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is False
        assert data["token"] is None

    def test_change_pin_requires_current(self, client):
        client.post("/auth/pin/set", json={"pin": "1234"})
        # Try to change without current_pin
        res = client.post("/auth/pin/set", json={"pin": "5678"})
        assert res.status_code == 400

    def test_change_pin_with_current(self, client):
        client.post("/auth/pin/set", json={"pin": "1234"})
        res = client.post("/auth/pin/set", json={"pin": "5678", "current_pin": "1234"})
        assert res.status_code == 200
        assert res.json()["ok"] is True
        # Old PIN should not work
        res2 = client.post("/auth/pin/verify", json={"pin": "1234"})
        assert res2.json()["success"] is False
        # New PIN should work
        res3 = client.post("/auth/pin/verify", json={"pin": "5678"})
        assert res3.json()["success"] is True

    def test_status_after_set(self, client):
        client.post("/auth/pin/set", json={"pin": "1234"})
        res = client.get("/auth/pin/status")
        data = res.json()
        assert data["pin_set"] is True

    def test_verify_encrypts_existing_plain_session(self, client, monkeypatch, tmp_path):
        """Migration safety: successful unlock encrypts existing plaintext session."""
        from app.config import get_settings
        from app.services.pin_service import set_pin
        from app.services.session_crypto import is_encrypted

        # Route helper resolves session file via app.routers.pin.get_sessions_dir
        monkeypatch.setattr("app.routers.pin.get_sessions_dir", lambda: tmp_path)

        session_file = tmp_path / f"{get_settings().tg_session_name}.session"
        session_file.write_bytes(b"SQLite format 3\x00" + b"\x00" * 128)
        assert is_encrypted(session_file) is False

        # Simulate old state: PIN exists but session is still plaintext
        set_pin("1234")

        res = client.post("/auth/pin/verify", json={"pin": "1234"})
        assert res.status_code == 200
        assert res.json()["success"] is True
        assert is_encrypted(session_file) is True


# ── Middleware tests ──────────────────────────────────────────────────────────

class TestPinMiddleware:
    """Tests that middleware blocks/allows requests correctly."""

    def test_no_pin_set_allows_all(self, client):
        """When no PIN is configured, all endpoints should work."""
        res = client.get("/health")
        assert res.status_code == 200
        res = client.get("/tasks")
        assert res.status_code == 200

    def test_pin_set_blocks_without_token(self, client):
        """When PIN is set, requests without Bearer token should be rejected."""
        client.post("/auth/pin/set", json={"pin": "1234"})
        res = client.get("/tasks")
        assert res.status_code == 401

    def test_pin_set_allows_with_token(self, client):
        """When PIN is set, requests with valid Bearer token should work."""
        set_res = client.post("/auth/pin/set", json={"pin": "1234"})
        token = set_res.json()["token"]
        res = client.get("/tasks", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200

    def test_health_always_allowed(self, client):
        """Health endpoint should always work, even with PIN set."""
        client.post("/auth/pin/set", json={"pin": "1234"})
        res = client.get("/health")
        assert res.status_code == 200

    def test_pin_endpoints_always_allowed(self, client):
        """PIN management endpoints should work without token."""
        client.post("/auth/pin/set", json={"pin": "1234"})
        # Status should still work
        res = client.get("/auth/pin/status")
        assert res.status_code == 200
        # Verify should still work
        res = client.post("/auth/pin/verify", json={"pin": "1234"})
        assert res.status_code == 200

    def test_invalid_token_rejected(self, client):
        """Invalid Bearer token should be rejected."""
        client.post("/auth/pin/set", json={"pin": "1234"})
        res = client.get("/tasks", headers={"Authorization": "Bearer invalid_token"})
        assert res.status_code == 401

    def test_settings_blocked_without_token(self, client):
        """Settings endpoint should be blocked when PIN is set."""
        client.post("/auth/pin/set", json={"pin": "1234"})
        res = client.get("/settings")
        assert res.status_code == 401
