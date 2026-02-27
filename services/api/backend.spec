# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the TG Focus Filter backend.

Build from services/api/ with:
    .venv\\Scripts\\pyinstaller backend.spec --distpath dist --workpath build --noconfirm

Output: dist/backend/  (--onedir bundle with backend.exe + _internal/)
"""
from PyInstaller.utils.hooks import collect_all, collect_submodules

block_cipher = None

# ── Collect large packages with dynamic imports ───────────────────────────────
# Telethon has hundreds of TL types loaded at runtime — collect everything.
tel_datas, tel_bins, tel_hidden = collect_all("telethon")

# SQLAlchemy uses dialect plugins
sqla_hidden = collect_submodules("sqlalchemy")

# uvicorn uses string-based protocol/loop loading
uvi_hidden = collect_submodules("uvicorn")

# ── Analysis ──────────────────────────────────────────────────────────────────
a = Analysis(
    ["main_frozen.py"],
    pathex=[],
    binaries=tel_bins,
    datas=tel_datas + [
        # Bundle the rules YAML — accessed via get_bundled_resource("rules/...")
        ("../../shared/rules/default_rules.yaml", "rules"),
    ],
    hiddenimports=(
        tel_hidden
        + sqla_hidden
        + uvi_hidden
        + [
            "sqlalchemy.dialects.sqlite",
            "sqlalchemy.dialects.sqlite.pysqlite",
            "pydantic_settings",
            "pydantic_settings.main",
            "dotenv",
            "yaml",
            "aiofiles",
            "websockets",
            "watchfiles",
            "httptools",
            "email.mime.text",
            "email.mime.multipart",
        ]
    ),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    # Exclude heavy packages we definitely don't use
    excludes=["tkinter", "matplotlib", "numpy", "pandas", "PIL", "PyQt5", "wx"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,          # UPX can trigger antivirus false positives
    console=True,       # Keep console output for debugging
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="backend",     # Output folder: dist/backend/
)
