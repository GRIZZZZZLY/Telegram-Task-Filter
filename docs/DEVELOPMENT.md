# Гайд для разработчика

---

## Требования

| Инструмент | Версия | Назначение |
|---|---|---|
| Python | 3.13 | Backend |
| Node.js | v24 | Frontend + Electron |
| npm | 10+ | Пакетный менеджер JS |
| PyInstaller | 6+ | Бандлинг Python в .exe |

---

## Первоначальная настройка

### 1. Клонировать репозиторий

```powershell
git clone <repo-url> D:\Telegram-Task-Filter
cd D:\Telegram-Task-Filter
```

### 2. Настроить `.env`

```powershell
copy .env.example .env
# Заполнить TG_API_ID, TG_API_HASH, TG_PHONE
```

Минимальный `.env` для разработки:

```env
TG_API_ID=1234567
TG_API_HASH=abc123def456abc123def456abc123de
TG_PHONE=+79001234567
TG_SESSION_NAME=user
APP_ENV=dev
APP_HOST=127.0.0.1
APP_PORT=8787
```

### 3. Настроить Python venv

```powershell
cd services\api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
pip install pyinstaller   # для сборки
```

### 4. Установить Node.js зависимости

```powershell
cd apps\desktop
npm install
```

### 5. Авторизоваться в Telegram (первый раз)

```powershell
cd D:\Telegram-Task-Filter
.venv\Scripts\python.exe scripts\auth_telegram.py
# Следовать инструкциям в консоли
# Создаст sessions\user.session
```

---

## Запуск в dev-режиме

### Backend

```powershell
cd services\api
.venv\Scripts\uvicorn app.main:app --reload --port 8787
```

Backend доступен на `http://localhost:8787`.  
Swagger UI: `http://localhost:8787/docs`

### Frontend (Electron)

```powershell
cd apps\desktop
npm run dev
```

Открывает Electron-окно с hot-reload через Vite (порт 1420).

> Backend должен быть запущен до старта Electron, иначе приложение покажет экран ожидания (таймаут 40 сек).

---

## Структура Backend

```
services/api/
├── app/
│   ├── main.py              # FastAPI app, lifespan, CORS
│   ├── config.py            # pydantic-settings, lru_cache
│   ├── database.py          # SQLAlchemy engine, create_tables()
│   ├── models.py            # ORM: Task, Event
│   ├── schemas.py           # Pydantic схемы запросов/ответов
│   ├── path_utils.py        # get_data_dir(), get_sessions_dir()
│   ├── routers/
│   │   ├── auth.py          # /auth/* — авторизация Telegram
│   │   ├── tasks.py         # /tasks/* — CRUD задач
│   │   ├── settings.py      # /settings — настройки
│   │   ├── telegram_info.py # /telegram/* — чаты, треды
│   │   └── ws.py            # WS /ws/tasks — WebSocket
│   ├── services/
│   │   └── telegram_service.py  # TelegramService синглтон
│   └── workers/
│       ├── tg_listener.py   # Telethon NewMessage handler
│       ├── commit_worker.py # Отправка реакций с задержкой
│       ├── snooze_worker.py # Пробуждение snoozed задач
│       └── cleanup_worker.py # Авто-удаление старых задач
├── main_frozen.py           # Точка входа для PyInstaller
├── backend.spec             # PyInstaller конфиг
└── tests/                   # pytest тесты
```

### Ключевые концепции

**Настройки через lru_cache:**  
`get_settings()` кэшируется. При изменении через `PATCH /settings` кэш сбрасывается через `get_settings.cache_clear()`. Большинство настроек применяются на следующем сообщении автоматически.

**Исключение — список чатов:**  
`tg_monitored_chat_ids` фиксируется при регистрации Telethon handler. Изменение требует `POST /telegram/restart-listener`.

**Staged commit (окно отмены):**  
`POST /tasks/{id}/done` устанавливает `committed_at = now`. `commit_worker` ждёт `done_commit_delay_seconds` (дефолт 5 сек), затем отправляет реакцию. Если пользователь нажал «Отмена» (`POST /tasks/{id}/reopen`), `committed_at` сбрасывается в NULL — воркер пропускает.

**WebSocket broadcast:**  
`manager.broadcast(type, data)` рассылает JSON всем подключённым клиентам. События: `task_created`, `task_committed`, `task_reopened`, `task_woken`.

---

## Структура Frontend

```
apps/desktop/
├── electron/
│   ├── main.ts              # Electron main process
│   └── preload.ts           # contextBridge (window.electronAPI)
└── src/
    ├── api/
    │   ├── client.ts        # apiFetch, ApiError
    │   ├── auth.ts          # /auth/* клиент
    │   ├── tasks.ts         # /tasks/* клиент
    │   └── settings.ts      # /settings клиент
    ├── hooks/
    │   ├── useBackendReady.ts   # polling /health
    │   └── useChatNames.ts      # кэш имён чатов
    └── components/
        ├── layout/
        │   ├── AppShell.tsx     # корневой компонент, дерево состояний
        │   ├── TopBar.tsx       # верхняя панель
        │   └── FilterTabs.tsx   # вкладки inbox/done/snoozed
        ├── ui/
        │   └── WindowControls.tsx  # кнопки управления окном
        ├── auth/
        │   └── TelegramAuthScreen.tsx  # wizard авторизации
        ├── settings/
        │   └── SettingsScreen.tsx      # экран настроек
        └── tasks/
            └── TaskList.tsx            # список задач + WebSocket
```

### Дерево состояний AppShell

```
Backend timeout (40 сек)
    ↓ нет
Backend loading (polling /health)
    ↓ ready
Auth checking (GET /auth/status)
    ↓
    ├── session_exists=true, connected=false → экран "Повторить / Войти заново"
    ├── connected=false, sessionExists=false → <TelegramAuthScreen>
    └── connected=true → Main UI (TopBar + FilterTabs + TaskList)
```

### IPC каналы Electron

| Канал | Направление | Действие |
|---|---|---|
| `window:minimize` | renderer→main | Свернуть в taskbar |
| `window:close` | renderer→main | Скрыть в трей |
| `window:toggle-pin` | renderer→main | Переключить always-on-top |
| `window:get-pin` | invoke | Получить состояние pin |
| `window:toggle-maximize` | renderer→main | Развернуть/восстановить |
| `window:get-maximized` | invoke | Получить состояние maximize |
| `app:quit` | renderer→main | Полностью закрыть |
| `shell:open-external` | renderer→main | Открыть URL в браузере |
| `pin-changed` | main→renderer | Push: обновить иконку pin |
| `maximize-changed` | main→renderer | Push: обновить иконку maximize |

---

## Тесты

```powershell
# Запустить все тесты
D:\Telegram-Task-Filter\services\api\.venv\Scripts\python.exe -m pytest services\api\tests\ -q

# С verbose выводом
D:\Telegram-Task-Filter\services\api\.venv\Scripts\python.exe -m pytest services\api\tests\ -v

# Конкретный файл
D:\Telegram-Task-Filter\services\api\.venv\Scripts\python.exe -m pytest services\api\tests\test_tasks.py -v
```

Тесты используют in-memory SQLite и моки Telegram. Ожидаемый результат: **70 passed**.

---

## Сборка

### Быстрая сборка (portable .exe)

```powershell
# Из корня проекта
build.bat
# или явно:
build.bat portable
```

### Шаги сборки (scripts/build.ps1)

| Шаг | Действие |
|---|---|
| **[1/5]** | Проверка Node.js |
| **[2/5]** | PyInstaller: бандлинг Python backend |
| **[3/5]** | `npm install` в apps/desktop |
| **[4/5]** | `npm run build` (TypeScript + Vite) |
| **[5/5]** | `electron-builder --win --config.win.target=portable` |

**Результат:** `apps/desktop/release/TG-Focus-Filter-*-portable.exe`

### NSIS установщик

```powershell
build.bat nsis
# Результат: apps/desktop/release/TG-Focus-Filter-*-setup.exe
```

### Только PyInstaller (backend)

```powershell
cd services\api
.venv\Scripts\pyinstaller.exe backend.spec --distpath dist --workpath build --noconfirm
# Результат: services/api/dist/backend/backend.exe
```

### Только Electron (frontend)

```powershell
cd apps\desktop
npm run build
npx electron-builder --win --config.win.target=portable
```

---

## Конфигурация

### Все переменные `.env`

| Переменная | Дефолт | Описание |
|---|---|---|
| `TG_API_ID` | `""` | Telegram API ID (обязательно) |
| `TG_API_HASH` | `""` | Telegram API Hash (обязательно) |
| `TG_PHONE` | `""` | Номер телефона (обязательно) |
| `TG_SESSION_NAME` | `"user"` | Имя файла сессии |
| `TG_MENTION_HANDLE` | `"@handle"` | Основной @handle |
| `TG_MENTION_HANDLES` | `""` | Несколько handles через запятую |
| `TG_MONITORED_CHAT_IDS` | `""` | ID чатов через запятую |
| `TG_MONITORED_THREAD_IDS` | `""` | ID тредов через запятую |
| `DONE_REACTION` | `"👍"` | Emoji реакции |
| `DONE_SEND_REPLY` | `true` | Отправлять ответ в чат |
| `DONE_REPLY_TEXT` | `"Готово ✅"` | Текст ответа |
| `DONE_COMMIT_DELAY_SECONDS` | `5` | Задержка реакции (окно отмены) |
| `FILTER_IGNORE_OWN` | `true` | Игнорировать исходящие |
| `FILTER_MIN_TEXT_LENGTH` | `0` | Минимальная длина текста |
| `FILTER_STRICT_MENTIONS` | `false` | Только с @упоминанием |
| `CLEANUP_DONE_AFTER_DAYS` | `0` | Авто-удаление (0 = выкл) |
| `SOUND_ENABLED` | `true` | Звук уведомлений |
| `COMPACT_MODE` | `false` | Компактный режим UI |
| `APP_ENV` | `"dev"` | Окружение |
| `APP_HOST` | `"127.0.0.1"` | Хост backend |
| `APP_PORT` | `8787` | Порт backend |
| `APP_LOG_LEVEL` | `"INFO"` | Уровень логов |

### Правила фильтрации (YAML)

Файл: `shared/rules/default_rules.yaml`

```yaml
- id: unique_rule_id
  name: Human readable name
  enabled: true
  priority: 100           # выше = проверяется первым
  when:
    mention: "@handle"    # case-insensitive (опционально)
    keywords: ["todo", "задача"]  # ANY из слов (опционально)
    chat_id: "-1002512649185"     # ID чата (опционально)
    thread_id: "173"              # ID треда (опционально)
  then:
    create_task: true
    priority: high        # low | medium | high
```

Правила перечитываются на каждое сообщение — перезапуск не нужен.

---

## Известные ограничения

| Ограничение | Причина |
|---|---|
| LSP-ошибки Pyright в Python | False positives с SQLAlchemy/Telethon — игнорировать |
| `✅` не работает как реакция | Telegram не поддерживает этот emoji как реакцию — использовать `👍` |
| Список чатов фиксируется при старте | Telethon регистрирует filter при старте handler — нужен restart-listener |
| CORS `allow_origins=["*"]` | Electron renderer грузится с `file://` (Origin: null) — whitelist не работает |
| `Content-Type` на GET провоцирует preflight | Убран из `apiFetch` для GET-запросов |

---

## Полезные команды

```powershell
# Проверить статус backend
curl http://localhost:8787/health

# Посмотреть задачи
curl http://localhost:8787/tasks

# Swagger UI
start http://localhost:8787/docs

# Логи Electron (dev)
# Выводятся в консоль npm run dev

# Логи backend (packaged)
# %APPDATA%\tg-focus-filter-desktop\ — нет файла логов, только stdout backend.exe
```

---

## Архитектурные решения (ADR)

| Решение | Причина |
|---|---|
| Electron вместо Tauri | Tauri требует Rust toolchain; Electron проще для Windows-only portable |
| PyInstaller `--onedir` | `--onefile` медленнее стартует; `--onedir` быстрее и проще для отладки |
| SQLite | Single-user, no sync needed, zero-config |
| Rule-based (без AI) | Предсказуемость, скорость, offline-работа |
| `allow_origins=["*"]` | Electron `file://` → `Origin: null` → whitelist не работает |
| `navigator.userAgent` для Electron detection | `window.electronAPI` может быть `undefined` на первом рендере в packaged-режиме |
| Staged commit (5 сек задержка) | Окно отмены перед отправкой реакции в Telegram |
