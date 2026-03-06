# API Service (FastAPI)

Backend for TG Focus Filter.

## Responsibilities

- task storage and lifecycle
- Telegram integration (Telethon)
- workers: listener, commit, snooze, cleanup, catch-up, reaction guard
- settings and diagnostics APIs
- websocket events for UI

---

## Local run

```powershell
cd services\api
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8787
```

Docs: `http://localhost:8787/docs`

---

## Key endpoints

- `GET /health`
- `GET /auth/status`, `POST /auth/start`, `POST /auth/verify`
- `GET /settings`, `PATCH /settings`
- `GET /tasks`
- `POST /tasks/{id}/done`
- `POST /tasks/{id}/reopen`
- `POST /tasks/{id}/snooze`
- `POST /tasks/{id}/dismiss`
- `POST /tasks/{id}/pin`
- `POST /tasks/{id}/start-work`
- `DELETE /tasks/done`, `DELETE /tasks/inbox`
- `GET /stats`
- `GET /logs`
- `WS /ws/tasks`

---

## Tests

```powershell
D:\Telegram-Task-Filter\services\api\.venv\Scripts\python.exe -m pytest services\api\tests\ -q
```
