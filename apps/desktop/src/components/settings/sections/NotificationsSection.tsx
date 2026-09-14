import { Play } from 'lucide-react'
import { TgSection, TgSettingRow, TgToggle } from '@/components/tg'
import {
  setSoundEnabled,
  setNotificationSound,
  playPreviewSound,
  setCustomSoundPath,
  getCustomSoundPath,
  SOUND_PRESETS,
} from '@/lib/sound'
import type { SoundPreset } from '@/lib/sound'
import type { SectionProps } from './TelegramSection'

/** Everything about being told a task arrived. Looks belong next door. */
export function NotificationsSection({ settings, patch }: SectionProps) {
  return (
    <TgSection title="Уведомления">
      <TgSettingRow label="Системные уведомления" hint="Всплывающие окна Windows">
        <TgToggle
          checked={settings.notifications_enabled}
          onChange={(v) => {
            patch('notifications_enabled', v)
            window.electronAPI?.setNotificationsEnabled(v)
          }}
          label="Системные уведомления"
        />
      </TgSettingRow>

      <TgSettingRow label="Звук уведомлений" hint="Только если уведомления включены">
        <TgToggle
          checked={settings.sound_enabled}
          onChange={(v) => {
            patch('sound_enabled', v)
            setSoundEnabled(v)
            // Electron notification stays silent — sound handled in renderer
            window.electronAPI?.setSoundEnabled(false)
          }}
          label="Звук уведомлений"
        />
      </TgSettingRow>

      {settings.sound_enabled && (
        <TgSettingRow
          label="Звук"
          hint={SOUND_PRESETS[settings.notification_sound as SoundPreset]?.description}
        >
          <select
            value={settings.notification_sound}
            onChange={(e) => {
              const preset = e.target.value as SoundPreset
              patch('notification_sound', preset)
              setNotificationSound(preset)
            }}
            className="max-w-[180px] rounded-tg-btn border border-tg-divider bg-tg-bg px-2 py-1 text-tg-sm text-tg-text outline-none focus:border-tg-line-active"
          >
            {(Object.entries(SOUND_PRESETS) as [SoundPreset, typeof SOUND_PRESETS[SoundPreset]][]).map(
              ([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ),
            )}
          </select>
          <button
            type="button"
            onClick={() => playPreviewSound(settings.notification_sound as SoundPreset)}
            title="Проиграть выбранный звук"
            aria-label="Проиграть выбранный звук"
            className="rounded-tg-btn border border-tg-divider p-1.5 text-tg-text-sub transition-colors duration-tg-universal hover:bg-tg-bg-over hover:text-tg-text"
          >
            <Play className="h-3 w-3" />
          </button>
        </TgSettingRow>
      )}

      {settings.sound_enabled && settings.notification_sound === 'custom' && (
        <TgSettingRow label="Путь к файлу" hint="MP3 или OGG, например: /sounds/my.mp3">
          {/* Uncontrolled on purpose: committing on blur avoids re-rendering the
              whole section on every keystroke of a long path. */}
          <input
            type="text"
            defaultValue={getCustomSoundPath() ?? ''}
            placeholder="/sounds/custom.mp3"
            onBlur={(e) => setCustomSoundPath(e.target.value.trim() || null)}
            className="w-44 rounded-tg-btn border border-tg-divider bg-tg-bg px-2 py-1 text-tg-sm text-tg-text outline-none placeholder:text-tg-placeholder focus:border-tg-line-active"
          />
          <button
            type="button"
            onClick={() => playPreviewSound('custom')}
            title="Проиграть кастомный звук"
            aria-label="Проиграть кастомный звук"
            className="rounded-tg-btn border border-tg-divider p-1.5 text-tg-text-sub transition-colors duration-tg-universal hover:bg-tg-bg-over hover:text-tg-text"
          >
            <Play className="h-3 w-3" />
          </button>
        </TgSettingRow>
      )}
    </TgSection>
  )
}
