/**
 * Converts raw backend log lines into human-readable friendly entries.
 *
 * Format produced by MskFormatter:
 *   "2026-02-27 16:33:29,123 MSK INFO     app.workers.tg_listener | message"
 *
 * Noisy low-value lines (individual MSG passes, sub-steps already covered
 * by a higher-level event) are dropped so the friendly view stays clean.
 */

export interface FriendlyEntry {
  time: string      // "16:33:29"
  icon: string      // emoji
  text: string      // Russian human-readable description
  isError: boolean
  isWarning: boolean
  raw: string       // original line (shown in technical mode)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortChatId(id: string): string {
  const n = parseInt(id, 10)
  if (isNaN(n)) return id
  return `чат …${String(Math.abs(n)).slice(-4)}`
}

function prioRu(p: string): string {
  return ({ high: 'высокий', medium: 'средний', low: 'низкий', normal: 'обычный' })[p] ?? p
}

function pluralFields(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'поле'
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'поля'
  return 'полей'
}

// ── Main parser ───────────────────────────────────────────────────────────────

function parseLine(raw: string): FriendlyEntry | null {
  // Match both "MSK" and legacy format (without MSK)
  const m = raw.match(
    /^(\d{4}-\d{2}-\d{2} )(\d{2}:\d{2}:\d{2}),\d+ (?:MSK )?(\w+)\s+\S+ \| (.+)$/,
  )
  if (!m) return null

  const [, , time, levelStr, msg] = m
  const isError   = levelStr === 'ERROR'
  const isWarning = levelStr === 'WARNING'

  const ok = (icon: string, text: string): FriendlyEntry =>
    ({ time, icon, text, isError, isWarning, raw })

  // ── Startup / shutdown ────────────────────────────────────────────────────
  if (msg.startsWith('Starting up'))        return ok('🚀', 'Приложение запустилось')
  if (msg.startsWith('All components started')) return ok('✅', 'Все компоненты готовы к работе')
  if (msg.includes('Shutting down') || msg.includes('Shutdown complete'))
    return ok('⏹', 'Приложение остановлено')

  // ── Telegram connection ───────────────────────────────────────────────────
  {
    const r = msg.match(/Telethon connected \| (@\S+)/)
    if (r) return ok('🔗', `Telegram подключён (${r[1]})`)
  }
  {
    const r = msg.match(/Telethon listener registered \| chats=\[([^\]]*)\]/)
    if (r) {
      const n = r[1].split(',').filter(Boolean).length
      return ok('📡', `Слушатель запущен — отслеживаю ${n} чат${n === 1 ? '' : n < 5 ? 'а' : 'ов'}`)
    }
  }

  // ── Incoming messages ─────────────────────────────────────────────────────
  // Skip lines where no mention — just traffic noise
  if (msg.startsWith('MSG |') && msg.includes('mentions=[]')) return null
  {
    const r = msg.match(/MSG \| chat=(\S+) sender=\S+ mentions=(\[[^\]]+\]) text='(.{0,60})/)
    if (r) {
      const preview = r[3].replace(/\\n.*/, '').trim()
      return ok('📨', `Упоминание в ${shortChatId(r[1])} — «${preview}»`)
    }
  }

  // ── Task creation (live listener) ─────────────────────────────────────────
  {
    const r = msg.match(/task created \| id=(\d+) priority=(\S+) chat=(\S+) text='(.{0,60})/)
    if (r) {
      const preview = r[4].replace(/'$/, '').trim()
      return ok('🆕', `Создана задача #${r[1]} [${prioRu(r[2])}] — «${preview}»`)
    }
  }

  // ── Catch-up scan ─────────────────────────────────────────────────────────
  {
    const r = msg.match(/Catch-up scan started \| from=(.+?) hours=(\d+)/)
    if (r) return ok('🔍', `Сканирование истории запущено (${r[2]} ч, с ${r[1]})`)
  }
  {
    const r = msg.match(/Catch-up: task created \| id=(\d+) priority=(\S+) chat=\S+ text='(.{0,60})/)
    if (r) {
      const preview = r[3].replace(/'$/, '').trim()
      return ok('📌', `История: задача #${r[1]} [${prioRu(r[2])}] — «${preview}»`)
    }
  }
  {
    const r = msg.match(
      /Catch-up scan complete \| scanned=(\d+) created=(\d+) skipped_done=(\d+) skipped_dup=(\d+)/,
    )
    if (r) {
      const [, scanned, created, done, dup] = r
      const parts = [`проверено ${scanned}`, `создано ${created}`]
      if (Number(done) > 0) parts.push(`уже выполнено ${done}`)
      if (Number(dup) > 0)  parts.push(`дублей пропущено ${dup}`)
      return ok('✅', `Сканирование завершено — ${parts.join(', ')}`)
    }
  }
  if (msg.startsWith('Catch-up scan disabled')) return ok('⏸', 'Сканирование истории отключено (catchup_hours=0)')

  // ── Commit / done ─────────────────────────────────────────────────────────
  {
    const r = msg.match(/Committing task \| id=(\d+) chat=(\S+)/)
    if (r) return ok('📤', `Отправляю реакцию для задачи #${r[1]} (${shortChatId(r[2])})…`)
  }
  {
    const r = msg.match(/✅ Committed \| task_id=(\d+)/)
    if (r) return ok('✅', `Задача #${r[1]} выполнена — реакция и ответ отправлены в Telegram`)
  }
  // Sub-steps already covered by ✅ Committed
  if (msg.startsWith('Reaction sent') || msg.startsWith('Reply sent')) return null
  // "N task(s) ready to commit" — covered by Committing task
  if (msg.match(/^Commit worker: \d+ task/)) return null

  // Reopen / undo
  {
    const r = msg.match(/Task reopened \| id=(\d+)/)
    if (r) return ok('↩️', `Задача #${r[1]} возвращена в inbox (отмена)`)
  }

  // ── Task lifecycle (dismiss / clear) ──────────────────────────────────────
  {
    const r = msg.match(/Task marked done \| id=(\d+)/)
    if (r) return ok('✔️', `Задача #${r[1]} отмечена выполненной`)
  }
  {
    const r = msg.match(/Task dismissed \| id=(\d+)/)
    if (r) return ok('🗑', `Задача #${r[1]} удалена без реакции`)
  }
  {
    const r = msg.match(/Clear done tasks \| deleted=(\d+)/)
    if (r) return ok('🧹', `Очищено выполненных задач: ${r[1]}`)
  }
  {
    const r = msg.match(/Clear inbox tasks \| deleted=(\d+)/)
    if (r) return ok('🧹', `Очищен inbox: удалено ${r[1]} задач`)
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  {
    const r = msg.match(/Settings updated: \[([^\]]+)\]/)
    if (r) {
      const n = r[1].split(',').length
      return ok('⚙️', `Настройки сохранены (${n} ${pluralFields(n)})`)
    }
  }

  // ── WebSocket / UI ────────────────────────────────────────────────────────
  if (msg.startsWith('WS client connected'))    return ok('🖥', 'Интерфейс открыт')
  if (msg.startsWith('WS client disconnected')) return ok('🖥', 'Интерфейс закрыт')

  // ── Workers startup — skip noise, keep only commit worker ─────────────────
  {
    const r = msg.match(/Commit worker started \| undo_window=(\S+)/)
    if (r) return ok('⏱', `Воркер фиксации запущен (окно отмены: ${r[1]})`)
  }
  if (
    msg.startsWith('Snooze worker started') ||
    msg.startsWith('Cleanup worker started') ||
    msg.startsWith('Reaction guard worker started') ||
    msg.startsWith('Listener:')  // own user_id / handles line
  ) return null

  // ── Reaction guard ────────────────────────────────────────────────────────
  {
    const r = msg.match(/Guard: rolled back \| task_id=(\d+)/)
    if (r) return ok('🛡', `Guard: реакция на задаче #${r[1]} была лишней — откатили`)
  }

  // ── Snooze ────────────────────────────────────────────────────────────────
  {
    const r = msg.match(/Task woken \| id=(\d+)/)
    if (r) return ok('⏰', `Задача #${r[1]} проснулась из snooze → вернулась в inbox`)
  }

  // ── Errors and warnings — always show ────────────────────────────────────
  if (isError)   return ok('🔴', msg.slice(0, 160))
  if (isWarning) return ok('🟡', msg.slice(0, 160))

  // Everything else — noise, skip
  return null
}

export function parseLogLines(lines: string[]): FriendlyEntry[] {
  return lines
    .map(parseLine)
    .filter((e): e is FriendlyEntry => e !== null)
}
