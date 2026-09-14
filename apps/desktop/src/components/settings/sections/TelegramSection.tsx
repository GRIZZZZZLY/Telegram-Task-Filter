import { TgSection } from '@/components/tg'
import type { AppSettings } from '@/types/settings'
import { TagInput } from '../TagInput'
import { ThreadSelector } from '../ThreadSelector'

export interface SectionProps {
  settings: AppSettings
  patch: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}

export function TelegramSection({ settings, patch }: SectionProps) {
  return (
    <TgSection title="Telegram" first>
      <div className="px-[22px] pb-2 pt-1">
        <p className="text-tg-box text-tg-text-bold">Мой Telegram handle</p>
        <p className="mb-2 mt-0.5 text-tg-sm text-tg-text-sub">
          Задачи создаются только для сообщений, где упомянут ваш @тег
        </p>
        <TagInput
          value={settings.tg_mention_handles}
          onChange={(v) => patch('tg_mention_handles', v)}
          placeholder="@username"
        />
      </div>

      <div className="px-[22px] pb-2 pt-2">
        <p className="mb-2 text-tg-box text-tg-text-bold">Отслеживаемые чаты и ветки</p>
        <ThreadSelector
          monitoredChatIds={settings.tg_monitored_chat_ids}
          monitoredThreadIds={settings.tg_monitored_thread_ids}
          onChatIdsChange={(v) => patch('tg_monitored_chat_ids', v)}
          onThreadIdsChange={(v) => patch('tg_monitored_thread_ids', v)}
        />
      </div>

      <p className="mx-[22px] mb-3 rounded-tg-btn bg-tg-accent/10 px-2.5 py-1.5 text-tg-sm text-tg-accent-text">
        ⚡ После изменения чатов нажмите <strong>Применить</strong> — это перезапустит слушатель.
      </p>
    </TgSection>
  )
}
