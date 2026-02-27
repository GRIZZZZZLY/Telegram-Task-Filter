# План: Settings UI + UX improvements
**Дата:** 2026-02-26  
**Статус:** В реализации

---

## Что реализуем

Пять инкрементов, от UI-рефакторинга до полноценной панели настроек.

---

## Инкремент 1 — Плоский список (UI)
**Статус:** 🔲 pending

Заменяем BentoGrid на flat-list. Карточки одинаковой ширины.  
Приоритет = цветная вертикальная полоска слева (`w-1 h-full rounded-l`).

**Файлы:**
- `apps/desktop/src/components/tasks/TaskCard.tsx` — убрать colSpan, flat-row стиль
- `apps/desktop/src/components/tasks/TaskList.tsx` — `<div className="flex flex-col gap-2">` вместо BentoGrid

---

## Инкремент 2 — Экран настроек
**Статус:** 🔲 pending

### Backend
**Новые файлы:**
- `services/api/app/routers/settings.py` — `GET /settings`, `PATCH /settings`
- `services/api/app/routers/telegram_info.py` — `GET /telegram/chats`, `GET /telegram/threads/{chat_id}`

**Изменения:**
- `services/api/app/config.py` — новые поля:
  - `filter_ignore_own: bool = True`
  - `filter_min_text_length: int = 0`
  - `filter_strict_mentions: bool = False`
  - `cleanup_done_after_days: int = 0`
  - `sound_enabled: bool = True`
  - `compact_mode: bool = False`
  - `tg_mention_handles: str = "@igo_kravts"` (несколько через запятую)
- `services/api/app/schemas.py` — добавить `SettingsOut`, `SettingsIn`
- `services/api/app/main.py` — зарегистрировать новые роутеры

### Frontend
**Новые файлы:**
- `apps/desktop/src/types/settings.ts`
- `apps/desktop/src/api/settings.ts` — `getSettings()`, `updateSettings()`, `getChats()`, `getThreads()`
- `apps/desktop/src/hooks/useSettings.ts`
- `apps/desktop/src/components/settings/SettingsScreen.tsx`

**Изменения:**
- `apps/desktop/src/components/layout/TopBar.tsx` — иконка ⚙️
- `apps/desktop/src/components/layout/AppShell.tsx` — showSettings state

**Секции настроек:**
1. **Telegram** — мультиселект чатов + тредов + несколько тегов упоминания
2. **Фильтры** — игнор своих, только упоминания, мин. длина текста
3. **Реакция** — выбор emoji (👍❤🔥✍👏🎉), текст ответа, задержка
4. **Очистка** — N дней → удалять done, кнопка "Очистить все"
5. **Внешний вид** — звук уведомлений, компактный режим

---

## Инкремент 3 — Фильтры шума (Backend)
**Статус:** 🔲 pending

`services/api/app/workers/tg_listener.py`:
- Фильтр `msg.out` (игнор своих сообщений)
- Дедупликация по `source_message_id` (проверка перед вставкой)
- Мин. длина текста (`settings.filter_min_text_length`)
- Строгий режим: только сообщения с упоминанием (`settings.filter_strict_mentions`)
- Поддержка нескольких тегов (`tg_mention_handles.split(",")`)

---

## Инкремент 4 — Быстрая смена приоритета
**Статус:** 🔲 pending

**Backend:**
- `services/api/app/routers/tasks.py` — `PATCH /tasks/{id}/priority`
- `services/api/app/services/task_service.py` — `change_priority()`

**Frontend:**
- `apps/desktop/src/api/tasks.ts` — `changePriority(id, priority)`
- `apps/desktop/src/components/tasks/TaskCard.tsx` — бейдж приоритета кликабелен, циклично: high → medium → low → high

---

## Инкремент 5 — Автоочистка + Компактный режим + Звук
**Статус:** 🔲 pending

**Автоочистка:**
- `services/api/app/workers/cleanup_worker.py` — NEW, раз в час
- `services/api/app/main.py` — запуск cleanup_worker в lifespan
- `services/api/app/routers/tasks.py` — `DELETE /tasks/done`
- `apps/desktop/src/components/tasks/TaskList.tsx` — кнопка "Очистить" на вкладке Done

**Компактный режим:**
- Тоггл в SettingsScreen (localStorage)
- `TaskCard.tsx` — compact: полоска + текст + кнопки, высота ~40px

**Звук:**
- `apps/desktop/electron/main.ts` — `ipcMain.handle('app:set-sound', ...)`, `Notification({ silent: !soundEnabled })`
- `apps/desktop/electron/preload.ts` — `setSoundEnabled(val: boolean)`
- `apps/desktop/src/electron.d.ts` — тип

---

## Итоговый список файлов (~21)

| Файл | Тип |
|---|---|
| `services/api/app/config.py` | modify |
| `services/api/app/schemas.py` | modify |
| `services/api/app/routers/settings.py` | NEW |
| `services/api/app/routers/telegram_info.py` | NEW |
| `services/api/app/routers/tasks.py` | modify |
| `services/api/app/services/task_service.py` | modify |
| `services/api/app/workers/tg_listener.py` | modify |
| `services/api/app/workers/cleanup_worker.py` | NEW |
| `services/api/app/main.py` | modify |
| `apps/desktop/src/types/settings.ts` | NEW |
| `apps/desktop/src/api/settings.ts` | NEW |
| `apps/desktop/src/hooks/useSettings.ts` | NEW |
| `apps/desktop/src/components/settings/SettingsScreen.tsx` | NEW |
| `apps/desktop/src/components/layout/AppShell.tsx` | modify |
| `apps/desktop/src/components/layout/TopBar.tsx` | modify |
| `apps/desktop/src/components/tasks/TaskCard.tsx` | modify |
| `apps/desktop/src/components/tasks/TaskList.tsx` | modify |
| `apps/desktop/src/api/tasks.ts` | modify |
| `apps/desktop/electron/main.ts` | modify |
| `apps/desktop/electron/preload.ts` | modify |
| `apps/desktop/src/electron.d.ts` | modify |

---

## Риски

| Риск | Митигация |
|---|---|
| `GET /telegram/chats` медленный (Telethon iter_dialogs) | Лимит 50, кэш 60 сек |
| Несколько тегов ломает старые YAML-правила | Listener расширяет список mentions, `mention: "@x"` работает как прежде |
| `PATCH /settings` пишет в `.env` напрямую | `python-dotenv.set_key()` — уже используется |
| Много задач в compact mode | react-window виртуализация опционально (>100 задач) |
