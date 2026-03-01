# Project Plan: Security + UX + AI Roadmap

## Статус

| Сессия | Тема | Статус | Тестов |
|--------|------|--------|--------|
| S1 | PIN-код + блокировка UI | ✅ ЗАВЕРШЕНА | 110 passed |
| S2 | Шифрование сессии + CORS | ✅ ЗАВЕРШЕНА | 133 passed |
| S3 | UX: горячие клавиши + диалоги + звуки + NTFS/DPAPI | ✅ ЗАВЕРШЕНА | 151 passed |
| S3+ | Детальный вид задачи + sender info + bugfix apiFetch | ✅ ЗАВЕРШЕНА | 151 passed |
| S4 | AI-классификация + fuzzy-дедупликация + Local LLM | ⏳ ЗАПЛАНИРОВАНА | — |

---

## Project Summary

**What:** Три направления улучшений TG Focus Filter — безопасность (PIN, шифрование сессии, защита API), UX (горячие клавиши, нативные диалоги, кастомные звуки, детальный вид задач), AI (классификация задач, fuzzy-дедупликация, локальные LLM).
**For:** Единственный пользователь-владелец Telegram-аккаунта.
**Success metric:** (1) без PIN-кода невозможно увидеть задачи или вызвать API, (2) сессия Telegram зашифрована на диске, (3) основные действия доступны с клавиатуры, (4) AI-классификация работает хотя бы для одного провайдера.

---

## Scope

### Реализовано (S1–S3+)
1. PIN-код при запуске (4-6 цифр, bcrypt-хеш, блокировка UI) ✅
2. Автоблокировка через N минут неактивности ✅
3. Bearer-токен для API (живёт в памяти, не в localStorage) ✅
4. Шифрование `.session` файла (AES-256-GCM, ключ из PIN) ✅
5. CORS ограничен до localhost + null (Electron file://) ✅
6. NTFS hardening — icacls ограничивает доступ к AppData папке ✅
7. DPAPI — TG_API_ID / TG_API_HASH зашифрованы Windows DPAPI ✅
8. Горячие клавиши (Ctrl+D, Ctrl+Z, Ctrl+F, Esc, ↑↓) ✅
9. Визуальная подсветка выбранной задачи (ring) ✅
10. Нативные Electron-диалоги вместо `confirm()` / `alert()` ✅
11. Кастомные звуки (пресет `custom` → mp3/ogg) ✅
12. Детальный вид задачи — модальное окно с полным текстом, отправителем, действиями ✅
13. `sender_username` / `sender_id` в API и WS broadcast ✅
14. Bugfix: `apiFetch` Authorization header терялся при явных headers в вызовах ✅

### Запланировано (S4)
- AI-классификация задач (приоритет, категория) через OpenAI / Anthropic / Local LLM
- Fuzzy-дедупликация похожих сообщений
- Категории как фильтр во вкладках (parking lot внутри S4)

### Out of Scope
- Мульти-язык (i18n) — русский единственный
- Авто-обновление (electron-updater) — отдельная задача
- Экспорт задач (CSV/JSON) — parking lot
- Biometric auth (Windows Hello) — слишком сложно для v1
- End-to-end шифрование API (HTTPS) — localhost, не нужно

### Parking Lot
- Экспорт задач CSV/JSON
- Windows Hello / биометрия
- Облачный бэкап зашифрованных данных
- Плагинная система правил
- Telegram bot-mode (вместо userbot)
- Категории как фильтр во вкладках (ждёт S4)

---

## Constraints
- **Платформа:** Windows x64 (Electron + Python)
- **Стек:** существующий (React/TS + FastAPI/Python), без новых фреймворков
- **Тесты:** pytest + `npm run build` — не ломать
- **Python:** 3.13, Node.js v24
- **AppData:** `C:\Users\Igor\AppData\Roaming\tg-focus-filter-desktop\`

---

## Реализованные сессии

### ✅ Session S1: PIN-код + блокировка UI

**Что сделано:**
- `pin_service.py` — `set_pin`, `verify_pin`, `is_pin_set`, `generate_session_token` (bcrypt)
- `routers/pin.py` — `POST /auth/pin/set`, `POST /auth/pin/verify`, `GET /auth/pin/status`
- `middleware/pin_auth.py` — Bearer-токен middleware, whitelist `/health`, `/auth/pin/*`
- `PinScreen.tsx` — экран ввода PIN (6 кружков, анимация ошибки, блокировка после 3 попыток)
- `usePinGuard.ts` — state machine: loading → needs-setup / locked / unlocked, автоблокировка по таймеру
- `api/pin.ts` — `getPinStatus`, `verifyPin`, `setPin`
- `SettingsScreen.tsx` — секция «Безопасность» (установка/смена PIN, таймаут автоблокировки)

**Файлы:**
```
services/api/app/services/pin_service.py       🆕
services/api/app/routers/pin.py                🆕
services/api/app/middleware/pin_auth.py        🆕
services/api/tests/test_pin.py                 🆕
apps/desktop/src/components/auth/PinScreen.tsx 🆕
apps/desktop/src/hooks/usePinGuard.ts          🆕
apps/desktop/src/api/pin.ts                    🆕
apps/desktop/src/api/client.ts                 ✏️ setAuthToken/getAuthToken/getWsUrl
apps/desktop/src/App.tsx                       ✏️ usePinGuard + PinScreen
apps/desktop/src/components/settings/SettingsScreen.tsx ✏️ секция Безопасность
```

---

### ✅ Session S2: Шифрование Telegram-сессии + защита API

**Что сделано:**
- `session_crypto.py` — AES-256-GCM encrypt/decrypt, ключ = PBKDF2(pin, salt)
- `TelegramService.start()` — расшифровка → temp файл → Telethon → удаление temp
- `POST /auth/pin/verify` — автоматически шифрует plaintext сессию при первом unlock (миграция)
- CORS ограничен: `["http://localhost:5173", "null"]` (null = Electron file://)
- OPTIONS preflight всегда пропускается middleware (CORS fix)
- Auth endpoints (`/auth/start`, `/auth/verify`) защищены Bearer-токеном

**Обнаруженные и исправленные баги:**
- OPTIONS preflight блокировался PIN middleware → исправлено
- `.session` оставался plaintext после первого unlock → исправлено (миграция в pin_verify)

**Файлы:**
```
services/api/app/services/session_crypto.py   🆕
services/api/tests/test_session_crypto.py      🆕
services/api/tests/test_security_s2.py         🆕
services/api/app/middleware/pin_auth.py        ✏️ OPTIONS whitelist
services/api/app/routers/pin.py                ✏️ _ensure_session_encrypted_after_unlock
services/api/app/routers/auth.py               ✏️ _encrypt_session_if_needed
services/api/app/main.py                       ✏️ CORS origins
```

---

### ✅ Session S3: UX + NTFS/DPAPI hardening

**Что сделано:**

**NTFS + DPAPI (security hardening):**
- `ntfs_service.py` — `harden_data_dir()` через `icacls` subprocess, ограничивает AppData папку только текущим пользователем
- `dpapi_service.py` — Windows DPAPI через `ctypes.windll.crypt32`, шифрует `TG_API_ID` / `TG_API_HASH` в `secrets.dpapi`
- `config.py` — `get_settings()` вызывает `inject_secrets_into_env()` перед созданием Settings
- `config.py` — `save_tg_credentials()` пишет credentials в DPAPI, удаляет из `.env`
- `main.py` — `harden_data_dir()` при старте бэкенда
- `routers/pin.py` — `_migrate_env_secrets()` при `POST /auth/pin/set`

**UX — горячие клавиши:**
- `useKeyboard.ts` — глобальный keydown listener
  - `Ctrl+D` → Done выбранной/первой inbox задачи
  - `Ctrl+Z` → Undo последнего Done
  - `Ctrl+F` → фокус на поиск
  - `Escape` → закрыть панель / убрать фокус с поиска
  - `↑` / `↓` → навигация по задачам
- `TaskList.tsx` — `selectedTaskId` state, визуальная подсветка `ring-2 ring-indigo-400/70`
- Поиск: placeholder обновлён до `Поиск по задачам... (Ctrl+F)`

**UX — нативные диалоги:**
- `electron/main.ts` — IPC handler `dialog:confirm` → `dialog.showMessageBox()`
- `electron/preload.ts` — `confirm(message): Promise<boolean>`
- `electron.d.ts` — TypeScript декларация
- `src/lib/dialog.ts` — `nativeConfirm()` с fallback на `window.confirm`
- Заменены все `confirm()` в: `TaskCard`, `TaskList`, `SettingsScreen`

**UX — кастомные звуки:**
- `sound.ts` — новый пресет `custom`, `setCustomSoundPath()` / `getCustomSoundPath()`
- `SettingsScreen.tsx` — поле ввода пути к файлу при выборе пресета «Свой файл»

**Файлы:**
```
services/api/app/services/ntfs_service.py      🆕
services/api/app/services/dpapi_service.py     🆕
services/api/tests/test_security_hardening.py  🆕 (18 тестов)
services/api/app/config.py                     ✏️ DPAPI inject + save_tg_credentials
services/api/app/main.py                       ✏️ harden_data_dir при старте
services/api/app/routers/pin.py                ✏️ _migrate_env_secrets
apps/desktop/src/hooks/useKeyboard.ts          🆕
apps/desktop/src/lib/dialog.ts                 🆕
apps/desktop/src/lib/sound.ts                  ✏️ пресет custom
apps/desktop/electron/main.ts                  ✏️ dialog:confirm IPC
apps/desktop/electron/preload.ts               ✏️ confirm()
apps/desktop/src/electron.d.ts                 ✏️ confirm declaration
apps/desktop/src/components/tasks/TaskList.tsx ✏️ useKeyboard + selectedTaskId + nativeConfirm
apps/desktop/src/components/tasks/TaskCard.tsx ✏️ nativeConfirm + Maximize2 кнопка
apps/desktop/src/components/settings/SettingsScreen.tsx ✏️ custom sound path
```

---

### ✅ Session S3+: Детальный вид задачи + sender info + bugfix

**Что сделано:**

**Детальный вид задачи (TaskDetailModal):**
- `TaskDetailModal.tsx` — модальное окно поверх списка
  - Полный текст сообщения (прокручиваемый)
  - Отправитель: `@username` или `id:...`
  - Чат, тема, дата/время полностью (московское время)
  - Все действия: Done, Snooze (с выпадающим меню), Убрать, Reopen, Open in Telegram
  - Приоритет кликабельный (смена цикла)
  - Закрытие: Escape, клик на backdrop, после действия
- `TaskCard.tsx` — кнопка `⤢` (Maximize2) открывает модаль
- `TaskList.tsx` — `detailTask` state, рендер `TaskDetailModal`

**Sender info в API:**
- `schemas.py` — `TaskOut` добавлены `sender_id`, `sender_username`
- `types/task.ts` — `Task` добавлены `sender_id?`, `sender_username?`
- `tg_listener.py` — WS broadcast включает `sender_id`, `sender_username`

**Bugfix apiFetch:**
- `api/client.ts` — исправлен порядок spread: `...options` шёл после `headers`, перезаписывая `Authorization`. Исправлено: `{ ...options, headers: { ...extraHeaders, ...options?.headers } }`. Затронутые вызовы: `markDone`, `snoozeTask`, `changePriority`, `reorderTasks`.

**Файлы:**
```
apps/desktop/src/components/tasks/TaskDetailModal.tsx  🆕
apps/desktop/src/components/tasks/TaskCard.tsx         ✏️ onOpenDetail prop + Maximize2
apps/desktop/src/components/tasks/TaskList.tsx         ✏️ detailTask state + TaskDetailModal
apps/desktop/src/types/task.ts                         ✏️ sender_id, sender_username
apps/desktop/src/api/client.ts                         ✏️ bugfix Authorization header
services/api/app/schemas.py                            ✏️ sender_id, sender_username в TaskOut
services/api/app/workers/tg_listener.py                ✏️ sender fields в WS broadcast
```

---

## Validation Plan (актуальный)

### Smoke (выполнено вручную)
1. ✅ Запуск → PinScreen → ввод PIN → Inbox виден
2. ✅ Минута бездействия → PinScreen снова
3. ✅ Ctrl+D → задача done → Ctrl+Z → задача вернулась
4. ✅ Очистить inbox → нативный диалог Electron → подтвердить → пусто
5. ✅ Кнопка ⤢ → модаль с полным текстом и отправителем
6. ✅ Done в модали → задача помечена, модаль закрыта

### Regression (автоматически)
- 151 pytest passed после S3+
- `npm run build` без ошибок TypeScript

---

## Порядок реализации

```
S1 (PIN + блокировка) ──→ S2 (шифрование + API) ──→ S3 (UX + NTFS/DPAPI) ──→ S3+ (детали + bugfix) ──→ S4 (AI) ⏳
     ✅ DONE                    ✅ DONE                    ✅ DONE                    ✅ DONE
```

**S4 описан в отдельном файле:** `20260301-000000-s4-ai-local-llm-plan.md`
