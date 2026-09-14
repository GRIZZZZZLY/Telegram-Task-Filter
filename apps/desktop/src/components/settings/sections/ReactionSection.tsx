import { TgSection, TgSettingRow, TgToggle, TgTextField, TgSlider } from '@/components/tg'
import { cn } from '@/lib/utils'
import type { SectionProps } from './TelegramSection'

/** Reactions Telegram accepts on a message. */
const REACTION_OPTIONS = ['👍', '❤', '🔥', '🎉', '👏', '🤝', '💯', '✍']

function EmojiPick({
  value,
  onPick,
  withDefaultOption = false,
}: {
  value: string
  onPick: (emoji: string) => void
  /** Adds a "same as the main one" choice, used by the custom-reply reaction. */
  withDefaultOption?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {withDefaultOption && (
        <button
          type="button"
          onClick={() => onPick('')}
          className={cn(
            'flex h-8 items-center rounded-tg-btn border px-2 text-tg-sm transition-colors duration-tg-universal',
            value === ''
              ? 'border-tg-accent bg-tg-accent/15 text-tg-accent-text'
              : 'border-tg-divider text-tg-text-sub hover:bg-tg-bg-over',
          )}
        >
          как основная
        </button>
      )}
      {REACTION_OPTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          aria-label={`Реакция ${emoji}`}
          className={cn(
            'grid h-8 w-8 place-items-center rounded-tg-btn border text-lg transition-colors duration-tg-universal',
            value === emoji
              ? 'border-tg-accent bg-tg-accent/15'
              : 'border-tg-divider hover:bg-tg-bg-over',
          )}
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}

export function ReactionSection({ settings, patch }: SectionProps) {
  return (
    <TgSection title="Реакция на выполнение">
      <TgSettingRow
        label="Отправлять реакцию"
        hint="Ставить эмодзи-реакцию на сообщение при выполнении"
      >
        <TgToggle
          checked={settings.done_reaction_enabled}
          onChange={(v) => patch('done_reaction_enabled', v)}
          label="Отправлять реакцию"
        />
      </TgSettingRow>

      {settings.done_reaction_enabled && (
        <div className="px-[22px] pb-2 pt-1">
          <p className="mb-2 text-tg-sm text-tg-text-sub">Реакция</p>
          <EmojiPick value={settings.done_reaction} onPick={(e) => patch('done_reaction', e)} />
        </div>
      )}

      <TgSettingRow label="Отправлять ответ в чат">
        <TgToggle
          checked={settings.done_send_reply}
          onChange={(v) => patch('done_send_reply', v)}
          label="Отправлять ответ в чат"
        />
      </TgSettingRow>

      {settings.done_send_reply && (
        <div className="px-[22px] pb-2 pt-1">
          <p className="mb-1 text-tg-sm text-tg-text-sub">Текст ответа</p>
          <TgTextField
            value={settings.done_reply_text}
            onChange={(v) => patch('done_reply_text', v)}
          />
        </div>
      )}

      <TgSettingRow
        label="Задержка реакции"
        hint={`${settings.done_commit_delay_seconds} сек — время на отмену`}
      >
        <TgSlider
          value={settings.done_commit_delay_seconds}
          onChange={(v) => patch('done_commit_delay_seconds', v)}
          min={0}
          max={60}
        />
      </TgSettingRow>

      <TgSettingRow
        label="Реакция на кастомный ответ"
        hint="Ставить отдельную реакцию, когда задача выполнена с кастомным текстом"
      >
        <TgToggle
          checked={settings.custom_reply_reaction_enabled}
          onChange={(v) => patch('custom_reply_reaction_enabled', v)}
          label="Реакция на кастомный ответ"
        />
      </TgSettingRow>

      {settings.custom_reply_reaction_enabled && (
        <div className="px-[22px] pb-2 pt-1">
          <p className="mb-2 text-tg-sm text-tg-text-sub">
            Реакция для кастомного ответа{' '}
            <span className="text-tg-placeholder">(пусто = как основная)</span>
          </p>
          <EmojiPick
            value={settings.custom_reply_reaction}
            onPick={(e) => patch('custom_reply_reaction', e)}
            withDefaultOption
          />
        </div>
      )}
    </TgSection>
  )
}
