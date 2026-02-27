#!/usr/bin/env bash
# dev-up.sh — start the TG Focus Filter API for local development
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT/services/api"

echo "========================================"
echo "  TG Focus Filter — dev-up"
echo "========================================"

# ── 1. Check .env ─────────────────────────────────────────────────────────
if [ ! -f "$ROOT/.env" ]; then
  echo ""
  echo "  [!] .env not found. Creating from .env.example..."
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "  [!] Fill in TG_API_ID, TG_API_HASH, TG_PHONE in .env then re-run."
  echo ""
  exit 1
fi

# ── 2. Python venv ────────────────────────────────────────────────────────
cd "$API_DIR"
if [ ! -d ".venv" ]; then
  echo ""
  echo "  [1/3] Creating Python venv..."
  python3 -m venv .venv
fi

# shellcheck source=/dev/null
source .venv/bin/activate

# ── 3. Dependencies ───────────────────────────────────────────────────────
echo "  [2/3] Installing dependencies..."
pip install -r requirements.txt -q

# ── 4. Start API ──────────────────────────────────────────────────────────
echo "  [3/3] Starting API..."
echo ""
echo "  Swagger UI : http://127.0.0.1:8787/docs"
echo "  Health     : http://127.0.0.1:8787/health"
echo ""
echo "  Press Ctrl+C to stop."
echo "========================================"

uvicorn app.main:app --reload --host 127.0.0.1 --port 8787
