import { useCallback, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { TgSection, TgSettingRow, TgNumberField, TgButton } from '@/components/tg'
import { clearDoneTasks, clearInboxTasks } from '@/api/tasks'
import { nativeConfirm } from '@/lib/dialog'
import type { SectionProps } from './TelegramSection'

export function CleanupSection({ settings, patch }: SectionProps) {
  const [clearingDone, setClearingDone] = useState(false)
  const [clearingInbox, setClearingInbox] = useState(false)

  const handleClearDone = useCallback(async () => {
    const ok = await nativeConfirm('Удалить все выполненные задачи?')
    if (!ok) return
    setClearingDone(true)
    try {
      const res = await clearDoneTasks()
      alert(`Удалено ${res.deleted} задач`)
    } catch {
      alert('Ошибка очистки')
    } finally {
      setClearingDone(false)
    }
  }, [])

  const handleClearInbox = useCallback(async () => {
    const ok = await nativeConfirm(
      'Очистить ВСЕ задачи во вкладке Inbox?\n\nЭто удалит только локальные задачи в приложении (без действий в Telegram).'
    )
    if (!ok) return
    setClearingInbox(true)
    try {
      const res = await clearInboxTasks()
      alert(`Удалено ${res.deleted} задач из inbox`)
    } catch {
      alert('Ошибка очистки inbox')
    } finally {
      setClearingInbox(false)
    }
  }, [])

  return (
    <TgSection title="Очистка">
      <TgSettingRow
        label="Авто-удаление выполненных"
        hint={settings.cleanup_done_after_days === 0 ? 'Выключено' : `Через ${settings.cleanup_done_after_days} дн.`}
      >
        <TgNumberField
          value={settings.cleanup_done_after_days}
          onChange={(v) => patch('cleanup_done_after_days', v)}
          min={0}
          max={365}
        />
      </TgSettingRow>

      <TgSettingRow label="Удалить все выполненные сейчас">
        <TgButton
          variant="attention"
          onClick={handleClearDone}
          disabled={clearingDone}
          className="h-7 px-2.5 text-tg-sm"
        >
          {clearingDone ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          Очистить
        </TgButton>
      </TgSettingRow>

      <TgSettingRow label="Аварийная очистка inbox" hint="Удалит только локальные inbox-задачи">
        <TgButton
          variant="attention"
          onClick={handleClearInbox}
          disabled={clearingInbox}
          className="h-7 px-2.5 text-tg-sm"
        >
          {clearingInbox ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          Очистить inbox
        </TgButton>
      </TgSettingRow>
    </TgSection>
  )
}
