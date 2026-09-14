import { TgSection, TgSettingRow, TgToggle, TgNumberField, TgSegmented } from '@/components/tg'
import type { SectionProps } from './TelegramSection'

export function FiltersSection({ settings, patch }: SectionProps) {
  return (
    <TgSection title="Фильтры">
      <TgSettingRow label="Игнорировать свои сообщения">
        <TgToggle
          checked={settings.filter_ignore_own}
          onChange={(v) => patch('filter_ignore_own', v)}
          label="Игнорировать свои сообщения"
        />
      </TgSettingRow>

      <TgSettingRow
        label="Минимальная длина текста"
        hint={`Сейчас: ${settings.filter_min_text_length} симв.`}
      >
        <TgNumberField
          value={settings.filter_min_text_length}
          onChange={(v) => patch('filter_min_text_length', v)}
          min={0}
          max={2000}
        />
      </TgSettingRow>

      <TgSettingRow
        label="Контекст из reply"
        hint="Если сообщение короткий пинг с @тегом, брать суть задачи из родительского сообщения"
      >
        <TgToggle
          checked={settings.tg_context_lift_enabled}
          onChange={(v) => patch('tg_context_lift_enabled', v)}
          label="Контекст из reply"
        />
      </TgSettingRow>

      <TgSettingRow label="Порядок задач в inbox">
        <TgSegmented
          options={[
            { id: 'desc', label: 'Новые сверху' },
            { id: 'asc', label: 'Новые снизу' },
          ]}
          active={settings.tasks_inbox_sort_direction === 'asc' ? 'asc' : 'desc'}
          onChange={(id) => patch('tasks_inbox_sort_direction', id as 'asc' | 'desc')}
        />
      </TgSettingRow>

      <TgSettingRow label="Высокий приоритет выше" hint="Сначала HIGH, потом MED, LOW, NORM">
        <TgToggle
          checked={settings.tasks_inbox_sort_by_priority}
          onChange={(v) => patch('tasks_inbox_sort_by_priority', v)}
          label="Высокий приоритет выше"
        />
      </TgSettingRow>
    </TgSection>
  )
}
