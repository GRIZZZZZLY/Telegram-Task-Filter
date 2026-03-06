# TG Focus Filter

Windows desktop-приложение для фильтрации рабочих задач из Telegram.

- Слушает выбранные чаты/ветки
- Создаёт задачи по rules + mentions
- Поддерживает `Done`, `Snooze`, `В работу (👀)`, `Pin`
- Синхронизирует редактирования сообщений (real-time + catch-up)
- Имеет PIN-защиту, статистику, диагностику и автообновление (NSIS)

---

## Текущее состояние

Проект активно развивается. Основные реализованные функции:

- Telegram auth + session management
- Task lifecycle: inbox/done/snoozed/reopen/dismiss
- Staged commit (окно отмены перед `Done`)
- Пер-чат фильтрация веток (`chat_id:thread_id`)
- Context lift для коротких reply-пингов (переключаемо в Settings)
- Синхронизация отредактированных сообщений в задачах (`task_updated`)
- Work marker: кнопка `В работу / В работе` + реакция 👀
- Auto-update UI и API в desktop (check/download/install)
- Release workflow для тегов `v*` (GitHub Actions)

---

## Стек

| Слой | Технологии |
|---|---|
| Desktop | Electron 40, React 18, TypeScript, Tailwind |
| Backend | Python 3.13, FastAPI, SQLAlchemy, SQLite |
| Telegram | Telethon |
| Build | PyInstaller + electron-builder |
| Delivery | GitHub Actions (tag-based releases) |

---

## Быстрый старт

### Запуск готовой сборки

1. Скачайте `TG-Focus-Filter-*-setup.exe` (рекомендуется для автообновлений) или `*-portable.exe`.
2. Запустите приложение.
3. Пройдите Telegram-авторизацию в UI.

Подробно: `docs/SETUP.md`

### Сборка из исходников

```powershell
build.bat
```

`build.bat` теперь умеет:

- выбор target: portable / nsis / all
- bump версии перед сборкой: none / patch / minor / major / custom

Примеры:

```powershell
build.bat all patch
build.bat nsis 0.2.0
build.bat portable none
```

Подробно: `docs/DEVELOPMENT.md`

---

## Автообновления

- Поддерживаются для **NSIS-installed** версии
- Для portable — ручное обновление
- В UI: `Настройки -> Обновления приложения`
  - Проверить
  - Скачать
  - Перезапустить и установить

Тех. детали и релиз-процесс: `docs/RELEASE_AND_UPDATES.md`

---

## Документация

- `docs/SETUP.md` — установка и первый запуск
- `docs/AUTH_GUIDE.md` — Telegram auth flow
- `docs/DEVELOPMENT.md` — разработка, сборка, тесты
- `docs/RELEASE_AND_UPDATES.md` — auto-update + CI/CD release
- `docs/ROADMAP.md` — планы доработок и приоритеты

---

## Структура репозитория

```text
Telegram-Task-Filter/
├── apps/desktop/
│   ├── electron/              # main/preload
│   └── src/                   # React UI
├── services/api/
│   ├── app/                   # FastAPI app
│   ├── tests/                 # pytest
│   └── backend.spec           # PyInstaller config
├── docs/
├── scripts/
├── ai-docs/plan/
└── build.bat
```
