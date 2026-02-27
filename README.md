# TG Focus Filter

Десктопное приложение для Windows — личный «фильтр внимания» для Telegram.  
Слушает выбранные чаты, извлекает задачи по правилам и показывает их в компактном окне поверх всех окон.

---

## Что это

- Всегда-поверх-окно (always-on-top) с плоским списком задач
- Задачи создаются автоматически из входящих сообщений Telegram по YAML-правилам
- Поддержка @упоминаний, ключевых слов, фильтрации по чатам и тредам
- Реакция 👍 и ответ «Готово ✅» отправляются в чат при выполнении задачи
- Откладывание задач (snooze), приоритеты, авто-очистка
- Полностью портабельный `.exe` — не требует установки Python или Node.js

---

## Стек

| Слой | Технологии |
|---|---|
| Десктоп | Electron 40, React 18, TypeScript, Tailwind CSS |
| Backend | Python 3.13, FastAPI, Uvicorn |
| Telegram | Telethon (MTProto) |
| База данных | SQLite + SQLAlchemy |
| Правила | YAML (rule-based, без AI) |
| Сборка | PyInstaller (backend) + electron-builder (frontend) |

---

## Быстрый старт

### Готовый `.exe` (рекомендуется)

1. Скачать `TG-Focus-Filter-*-portable.exe` из раздела Releases
2. Запустить `.exe`
3. При первом запуске пройти авторизацию в Telegram через интерфейс приложения

Подробнее: [docs/SETUP.md](docs/SETUP.md)

### Сборка из исходников

```powershell
# Предварительно: Python 3.13, Node.js v24, venv с зависимостями
build.bat
# Результат: apps/desktop/release/TG-Focus-Filter-*-portable.exe
```

Подробнее: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

---

## Структура проекта

```
Telegram-Task-Filter/
├── .env                          # Конфигурация (не в git)
├── .env.example                  # Шаблон конфигурации
├── build.bat                     # Точка входа сборки
├── shared/
│   └── rules/
│       └── default_rules.yaml    # Правила фильтрации сообщений
├── services/
│   └── api/                      # Python FastAPI backend
│       ├── app/
│       │   ├── main.py           # FastAPI app, CORS, lifespan
│       │   ├── config.py         # Настройки (pydantic-settings)
│       │   ├── routers/          # HTTP роутеры
│       │   ├── services/         # Бизнес-логика (Telegram)
│       │   └── workers/          # Фоновые задачи asyncio
│       ├── backend.spec          # PyInstaller конфиг
│       └── tests/                # pytest тесты
├── apps/
│   └── desktop/                  # Electron + React frontend
│       ├── electron/
│       │   ├── main.ts           # Electron main process
│       │   └── preload.ts        # contextBridge API
│       └── src/
│           ├── components/       # React компоненты
│           ├── api/              # HTTP клиенты
│           └── hooks/            # Кастомные хуки
├── scripts/
│   ├── build.ps1                 # PowerShell скрипт сборки
│   └── auth_telegram.py          # CLI авторизация (dev)
└── docs/
    ├── AUTH_GUIDE.md             # Шпаргалка по авторизации
    ├── SETUP.md                  # Установка и первый запуск
    └── DEVELOPMENT.md            # Гайд для разработчика
```

---

## Хранение данных

**Packaged (`.exe`):** `%APPDATA%\tg-focus-filter-desktop\`

```
tg-focus-filter-desktop\
├── .env                  # конфигурация
├── sessions\
│   └── user.session      # Telethon сессия (SQLite)
└── data\
    └── focus_filter.db   # база задач (SQLite)
```

**Dev режим:** те же папки в корне проекта (`D:\Telegram-Task-Filter\`).

---

## Правила фильтрации

Файл `shared/rules/default_rules.yaml`:

```yaml
- id: mention_me
  name: Mention @handle
  enabled: true
  priority: 100          # выше = проверяется первым
  when:
    mention: "@myhandle" # case-insensitive
    keywords: ["todo"]   # ANY из ключевых слов (опционально)
    chat_id: "-100123"   # ID чата (опционально)
    thread_id: "173"     # ID треда (опционально)
  then:
    create_task: true
    priority: high       # low | medium | high
```

Логика: все условия `when` — AND. Первое совпавшее правило (по убыванию `priority`) определяет результат.

---

## API Backend

Backend запускается на `http://localhost:8787`.

| Группа | Эндпоинты |
|---|---|
| Здоровье | `GET /health` |
| Авторизация | `GET /auth/status`, `POST /auth/start`, `POST /auth/verify` |
| Задачи | `GET /tasks`, `POST /tasks/{id}/done`, `POST /tasks/{id}/reopen`, `POST /tasks/{id}/snooze`, `PATCH /tasks/{id}/priority`, `DELETE /tasks/done` |
| Настройки | `GET /settings`, `PATCH /settings` |
| Telegram | `GET /telegram/chats`, `GET /telegram/threads/{chat_id}`, `POST /telegram/restart-listener` |
| WebSocket | `WS /ws/tasks` |

---

## Документация

- [docs/AUTH_GUIDE.md](docs/AUTH_GUIDE.md) — шпаргалка по авторизации в Telegram
- [docs/SETUP.md](docs/SETUP.md) — установка и первый запуск
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — разработка, тесты, сборка
