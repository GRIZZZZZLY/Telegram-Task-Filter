# TG Focus Filter (MVP)

Личный фильтр внимания для Telegram: превращает поток сообщений в компактный список задач.

## Что делает MVP
- Слушает выбранные чаты/ветки Telegram через Telethon.
- По rule-based логике создаёт задачи из сообщений.
- Показывает задачи в desktop UI (Tauri + React).
- Позволяет закрывать задачу из UI.
- При закрытии ставит реакцию в исходном сообщении Telegram.

## Архитектура
- `apps/desktop` — Tauri + React UI.
- `services/api` — FastAPI backend + workers.
- `shared/rules/default_rules.yaml` — правила извлечения задач.
- `SQLite` — локальное хранилище задач/событий.

## Требования
- Node.js 20+
- Python 3.11+
- Rust toolchain (для Tauri)
- Telegram API credentials (`TG_API_ID`, `TG_API_HASH`)

## Быстрый старт (локально)

### 1) Клонируй и настрой env
```bash
cp .env.example .env
# заполни значения
```

### 2) Подними backend
```bash
cd services/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8787
```

### 3) Подними desktop UI
```bash
cd apps/desktop
npm install
npm run tauri dev
```

## Структура проекта (MVP)
```txt
tg-focus-filter/
  apps/
    desktop/
  services/
    api/
      app/
        routers/
        services/
        workers/
  shared/
    rules/
  .env.example
  README.md
```

## API (минимум)
- `GET /health`
- `GET /tasks`
- `POST /tasks/{id}/done`
- `GET /rules`
- `PUT /rules/{id}`
- `WS /ws/tasks`

## База данных (минимум)
- `tasks`
- `events`
- `rules`
- `message_links`

## Поведение Done
1. UI отправляет `POST /tasks/{id}/done`.
2. Backend меняет статус задачи.
3. `action_worker` ставит реакцию на исходное сообщение в Telegram.
4. Пишется событие `reaction_sent`.

## Безопасность
- Не хранить секреты в репозитории.
- `.env` должен быть в `.gitignore`.
- Telethon session-файлы хранить локально, не коммитить.

## Ограничения MVP
- Rule-based извлечение (без AI-классификации).
- Single-user режим.
- SQLite локально (без синхронизации между устройствами).

## Roadmap после MVP
- Улучшенный dedup задач.
- AI-классификация сложных сообщений (опционально).
- Batch-операции в UI.
- Экспорт метрик (создано/закрыто/зависло).
