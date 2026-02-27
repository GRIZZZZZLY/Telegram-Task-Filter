# Plan: Undo / Reopen задачи после Done

**Дата:** 2026-02-25  
**Проект:** Telegram Task Filter  
**Связан с:** `20260225-175647-mvp-backend-stage1.md`  
**Этап:** 2 (после Telethon listener)

---

## Проблема

Пользователь случайно закрыл задачу. Через 5-секундный staged-commit окно уже прошло:
- реакция ✅ отправлена в Telegram
- сообщение "Готово" (если настроено) тоже отправлено
- задача в статусе `done`

Нужна возможность полностью отменить это действие.

---

## Технические ограничения (честно)

| Действие | Возможно | Условие |
|----------|----------|---------|
| Убрать реакцию | ✅ всегда | Telethon: отправить `reaction=[]` |
| Удалить наше "Готово"-сообщение | ✅ | Если приложение его отправило + < 48ч |
| Удалить "Готово"-сообщение от коллеги | ❌ | Только если ты admin чата |
| Удалить наше сообщение после 48ч | ❌ | Telegram API не позволяет |

**Вывод:** реакция убирается всегда. Сообщение — только своё и только в пределах 48 часов.  
После 48ч UI показывает предупреждение: "Реакция убрана. Сообщение удали вручную."

---

## Что добавляется к этапу 1

### 1. Staged commit (pending_done) — защита до 5 секунд

Вместо немедленной отправки реакции в Telegram:

```
[Done] нажат
   ↓
status = pending_done
committed_at = NULL          ← реакция ещё НЕ отправлена
   ↓
UI показывает toast 5 секунд: "Закрыто ✅  [Отмена]"
   ↓
[Отмена] → status = inbox, ничего не отправлено ✓
[Время вышло] → фоновый worker отправляет реакцию → committed_at = now()
```

Для staged commit **не нужен новый статус** — достаточно поля `committed_at`:

```python
# models.py — добавить в Task:
committed_at = Column(DateTime(timezone=True), nullable=True)
# NULL = pending, NOT NULL = реакция отправлена
```

### 2. Поле reply_message_id в Event

При отправке "Готово"-сообщения сохраняем его id в `payload_json` события `reaction_sent`:

```json
{
  "chat_id": "-100123",
  "source_message_id": 456,
  "reaction": "✅",
  "reply_message_id": 789,
  "sent_at": "2026-02-25T18:00:00Z"
}
```

Если "Готово" не отправлялось — `reply_message_id: null`.

---

## Новый endpoint

```
POST /tasks/{id}/reopen
```

**Логика:**
1. Получить задачу → 404 если не найдена
2. Проверить статус → 409 если уже `inbox`
3. Найти последнее событие `reaction_sent` для задачи
4. Вызвать `TelegramService.remove_done(...)`
5. Изменить статус → `inbox`, `committed_at = NULL`
6. Записать `Event(type=reopened)`
7. Вернуть `TaskOut` + `warnings[]`

**Response:**
```json
{
  "task": { "id": 1, "status": "inbox", ... },
  "reaction_removed": true,
  "reply_deleted": true,
  "warnings": []
}

// Если сообщение удалить не удалось:
{
  "task": { "id": 1, "status": "inbox", ... },
  "reaction_removed": true,
  "reply_deleted": false,
  "warnings": ["Message older than 48h — delete manually in Telegram"]
}
```

---

## TelegramService — методы

```python
# services/api/app/services/telegram_service.py

async def send_done(
    self,
    chat_id: str,
    message_id: int,
    reaction: str = "✅",
    send_reply: bool = False,        # ← включать ли "Готово"-сообщение
    reply_text: str = "Готово ✅",
) -> dict:
    """
    Поставить реакцию. Опционально — отправить reply-сообщение.
    Возвращает dict с reply_message_id (None если не отправляли).

    MVP: stub. TODO: реализовать через Telethon client.
    """
    # TODO (stage 2):
    # await client(SendReactionRequest(peer=chat_id, msg_id=message_id, reaction=[reaction_obj]))
    # if send_reply:
    #     msg = await client.send_message(chat_id, reply_text, reply_to=message_id)
    #     return {"reply_message_id": msg.id}
    return {"reply_message_id": None}


async def remove_done(
    self,
    chat_id: str,
    message_id: int,
    reply_message_id: int | None = None,
) -> dict:
    """
    Убрать реакцию. Удалить reply-сообщение если известен его id.
    Возвращает {"reaction_removed": bool, "reply_deleted": bool}.

    MVP: stub. TODO: реализовать через Telethon client.
    """
    # TODO (stage 2):
    # await client(SendReactionRequest(peer=chat_id, msg_id=message_id, reaction=[]))
    # deleted = False
    # if reply_message_id:
    #     try:
    #         await client.delete_messages(chat_id, [reply_message_id])
    #         deleted = True
    #     except Exception:
    #         deleted = False  # старше 48ч или нет прав
    # return {"reaction_removed": True, "reply_deleted": deleted}
    return {"reaction_removed": True, "reply_deleted": False}
```

---

## TaskService — метод reopen

```python
# services/api/app/services/task_service.py

async def reopen(self, task_id: int) -> dict:
    """
    Вернуть задачу в inbox. Убрать реакцию и reply-сообщение в Telegram.

    Raises:
        HTTPException 404: задача не найдена.
        HTTPException 409: задача уже в inbox.
    """
    task = self.db.get(Task, task_id)
    if task is None:
        raise HTTPException(404, f"Task {task_id} not found")
    if task.status == TaskStatus.inbox:
        raise HTTPException(409, f"Task {task_id} is already in inbox")

    # Найти последний reaction_sent event
    reaction_event = (
        self.db.query(Event)
        .filter(Event.task_id == task_id, Event.type == EventType.reaction_sent)
        .order_by(Event.ts.desc())
        .first()
    )

    reaction_removed = False
    reply_deleted = False
    warnings = []

    if reaction_event and task.chat_id and task.source_message_id:
        payload = json.loads(reaction_event.payload_json or "{}")
        reply_message_id = payload.get("reply_message_id")

        tg = TelegramService()
        result = await tg.remove_done(
            chat_id=task.chat_id,
            message_id=task.source_message_id,
            reply_message_id=reply_message_id,
        )
        reaction_removed = result["reaction_removed"]
        reply_deleted = result["reply_deleted"]

        if reply_message_id and not reply_deleted:
            warnings.append("Message older than 48h — delete manually in Telegram")

    task.status = TaskStatus.inbox
    task.committed_at = None
    task.updated_at = _now()

    self.db.add(Event(
        task_id=task.id,
        type=EventType.reopened,
        payload_json=json.dumps({
            "reaction_removed": reaction_removed,
            "reply_deleted": reply_deleted,
        }),
        ts=_now(),
    ))
    self.db.commit()
    self.db.refresh(task)

    return {
        "task": task,
        "reaction_removed": reaction_removed,
        "reply_deleted": reply_deleted,
        "warnings": warnings,
    }
```

---

## Router — новый endpoint

```python
# services/api/app/routers/tasks.py — добавить:

@router.post("/{task_id}/reopen", summary="Reopen done task")
async def reopen_task(task_id: int, db: Session = Depends(get_db)):
    """
    Вернуть задачу в inbox. Убирает реакцию в Telegram,
    удаляет reply-сообщение (если наше и < 48ч).

    - 404 если задача не найдена
    - 409 если задача уже в inbox
    """
    svc = TaskService(db)
    return await svc.reopen(task_id)
```

---

## Модель — изменения

```python
# models.py — добавить в Task:
committed_at = Column(DateTime(timezone=True), nullable=True)

# models.py — добавить в EventType:
class EventType(str, enum.Enum):
    ...
    reopened = "reopened"          # ← новый тип
```

---

## UI — Done-вкладка

```
┌──────────────────────────────────────┐
│  ✅ Деплой в прод                    │
│  #backend  •  вчера 14:23           │
│                       [↩ Переоткрыть]│
├──────────────────────────────────────│
│  ✅ Ревью PR #42                     │
│  #general  •  3 дня назад           │
│                       [↩ Переоткрыть]│
└──────────────────────────────────────┘
```

После клика "Переоткрыть":
- Если всё ок: задача перемещается в Inbox, тост "Задача возвращена ✓"
- Если сообщение не удалось удалить: тост с предупреждением оранжевого цвета

---

## Acceptance Criteria

| # | Критерий |
|---|----------|
| AC-1 | `POST /tasks/{id}/reopen` → 200, статус задачи = inbox |
| AC-2 | После reopen создаётся Event type=reopened |
| AC-3 | `POST /tasks/{id}/reopen` на inbox-задачу → 409 |
| AC-4 | `POST /tasks/{id}/reopen` на несуществующую → 404 |
| AC-5 | TelegramService.remove_done вызывается с правильными параметрами |
| AC-6 | Если reply_deleted=false → в response есть warnings[] с текстом |
| AC-7 | committed_at сбрасывается в NULL при reopen |

---

## Порядок реализации (в рамках этапа 2)

1. Добавить `committed_at` в модель Task
2. Добавить `EventType.reopened`
3. Реализовать `TelegramService.remove_done` (после Telethon интеграции)
4. Добавить `TaskService.reopen`
5. Добавить `POST /tasks/{id}/reopen` в router
6. Написать тесты (reopen success / 404 / 409 / warning when reply not deleted)
7. UI: кнопка "Переоткрыть" в Done-вкладке + toast с предупреждением
