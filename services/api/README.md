# API Service — TG Focus Filter

FastAPI backend: хранит задачи, оценивает правила, управляет событиями.

## Быстрый старт

```bash
# из корня репозитория
cp .env.example .env        # заполни TG_API_ID, TG_API_HASH, TG_PHONE

cd services/api
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

uvicorn app.main:app --reload --host 127.0.0.1 --port 8787
```

Или через скрипт из корня: `bash scripts/dev-up.sh`

**Swagger UI:** http://127.0.0.1:8787/docs

---

## Тесты

```bash
cd services/api
pytest tests/ -v
```

---

## API endpoints

### `GET /health`
```bash
curl http://localhost:8787/health
# {"ok": true, "env": "dev"}
```

### `GET /tasks`
```bash
curl "http://localhost:8787/tasks?status=inbox&priority=high&limit=20"
```

| Параметр | Значения | Описание |
|----------|----------|----------|
| `status` | `inbox\|done\|snoozed` | фильтр по статусу |
| `priority` | `low\|medium\|high` | фильтр по приоритету |
| `thread_id` | string | фильтр по треду/топику |
| `limit` | 1–200 | размер страницы (дефолт 50) |
| `offset` | int | смещение (дефолт 0) |

### `POST /tasks/{id}/done`
```bash
curl -X POST http://localhost:8787/tasks/1/done
# 200 — закрыто | 404 — не найдено | 409 — уже закрыто
```

### `POST /tasks/{id}/reopen`
```bash
curl -X POST http://localhost:8787/tasks/1/reopen
# 200 — {"task": {...}, "reaction_removed": true, "reply_deleted": false, "warnings": []}
# 404 — не найдено | 409 — уже в inbox
```

---

## Структура

```
app/
  config.py              — pydantic-settings (читает .env из корня)
  database.py            — SQLAlchemy engine + get_db
  models.py              — Task, Event ORM + enums
  schemas.py             — Pydantic v2 schemas
  main.py                — FastAPI app, CORS, lifespan
  routers/tasks.py       — endpoints
  services/
    rule_engine.py       — YAML rule evaluator
    task_service.py      — бизнес-логика
    telegram_service.py  — STUB (TODO: Telethon, этап 2)
  workers/               — зарезервировано (этап 2)
tests/
  conftest.py            — in-memory SQLite, фикстуры
  test_rule_engine.py    — unit-тесты
  test_tasks.py          — интеграционные тесты
```

---

## Переключение на PostgreSQL/MySQL

```bash
# .env
DB_URL=postgresql+psycopg2://user:pass@localhost/tg_filter
# pip install psycopg2-binary  — больше никаких изменений не нужно
```
