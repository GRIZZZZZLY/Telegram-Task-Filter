import { TgSection, TgSettingRow, TgToggle, TgSegmented } from '@/components/tg'
import {
  setSoundEnabled,
  setNotificationSound,
  playPreviewSound,
  setCustomSoundPath,
  getCustomSoundPath,
  SOUND_PRESETS,
} from '@/lib/sound'
import type { SoundPreset } from '@/lib/sound'
import { useHighContrast } from '@/hooks/useHighContrast'
import type { SectionProps } from './TelegramSection'

export function AppearanceSection({ settings, patch }: SectionProps) {
  const displayMode = settings.task_display_mode || (settings.compact_mode ? 'compact' : 'standard')
  const highContrast = useHighContrast()

  return (
    <TgSection title="Внешний вид">
      <TgSettingRow label="Системные уведомления" hint="Всплывающие тосты Windows">
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
        <TgSettingRow label="Пресет звука">
          <select
            value={settings.notification_sound}
            onChange={(e) => {
              const preset = e.target.value as SoundPreset
              patch('notification_sound', preset)
              setNotificationSound(preset)
            }}
            className="rounded-tg-btn border border-tg-divider bg-tg-bg px-2 py-1 text-tg-sm text-tg-text outline-none focus:border-tg-line-active"
          >
            {(Object.entries(SOUND_PRESETS) as [SoundPreset, typeof SOUND_PRESETS[SoundPreset]][]).map(
              ([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label} — {meta.description}
                </option>
              ),
            )}
          </select>
          <button
            type="button"
            onClick={() => playPreviewSound(settings.notification_sound as SoundPreset)}
            title="Проиграть выбранный звук"
            aria-label="Проиграть выбранный звук"
            className="rounded-tg-btn border border-tg-divider px-2 py-1 text-tg-sm text-tg-text-sub transition-colors duration-tg-universal hover:bg-tg-bg-over hover:text-tg-text"
          >
            ▶
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
            className="rounded-tg-btn border border-tg-divider px-2 py-1 text-tg-sm text-tg-text-sub transition-colors duration-tg-universal hover:bg-tg-bg-over hover:text-tg-text"
          >
            ▶
          </button>
        </TgSettingRow>
      )}

      <TgSettingRow label="Режим отображения задач" hint="Компактный / Стандартный / Развёрнутый">
        <TgSegmented
          options={[
            { id: 'compact', label: 'Компактный' },
            { id: 'standard', label: 'Стандартный' },
            { id: 'expanded', label: 'Развёрнутый' },
          ]}
          active={displayMode}
          onChange={(id) => patch('task_display_mode', id as 'compact' | 'standard' | 'expanded')}
        />
      </TgSettingRow>

      <TgSettingRow
        label="Повышенная контрастность"
        hint="Тёмный текст и плашки для лучшей читаемости"
      >
        <TgToggle
          checked={highContrast.enabled}
          onChange={highContrast.toggle}
          label="Повышенная контрастность"
        />
      </TgSettingRow>
    </TgSection>
  )
}
