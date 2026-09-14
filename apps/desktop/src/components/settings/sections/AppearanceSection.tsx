import { TgSection, TgSettingRow, TgToggle, TgSegmented } from '@/components/tg'
import { useHighContrast } from '@/hooks/useHighContrast'
import type { SectionProps } from './TelegramSection'

export function AppearanceSection({ settings, patch }: SectionProps) {
  const displayMode = settings.task_display_mode || (settings.compact_mode ? 'compact' : 'standard')
  const highContrast = useHighContrast()

  return (
    <TgSection title="Внешний вид">
      <TgSettingRow label="Строка задачи" hint="Сколько показывать в списке, не открывая задачу">
        <TgSegmented
          options={[
            { id: 'compact', label: 'Короче' },
            { id: 'standard', label: 'Обычно' },
            { id: 'expanded', label: 'С текстом' },
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
