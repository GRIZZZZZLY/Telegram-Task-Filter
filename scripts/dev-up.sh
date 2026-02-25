#!/usr/bin/env bash
set -e

echo "[dev-up] Start API: cd services/api && uvicorn app.main:app --reload --port 8787"
echo "[dev-up] Start UI:  cd apps/desktop && npm run dev"
