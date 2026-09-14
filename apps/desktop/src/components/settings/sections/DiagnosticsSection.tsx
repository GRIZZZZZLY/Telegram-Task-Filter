import { useCallback, useState } from 'react'
import { Loader2, RefreshCw, FolderOpen } from 'lucide-react'
import { TgSection, TgButton, TgSegmented } from '@/components/tg'
import { fetchLogs } from '@/api/logs'
import type { LogLevel, LogsResponse } from '@/api/logs'
import { parseLogLines } from '@/lib/log-parser'
import type { FriendlyEntry } from '@/lib/log-parser'
import { cn } from '@/lib/utils'

export function DiagnosticsSection() {
  const [logsData, setLogsData] = useState<LogsResponse | null>(null)
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState<string | null>(null)
  const [logsLevel, setLogsLevel] = useState<LogLevel>('ALL')
  const [logsLines, setLogsLines] = useState(200)
  const [logsMode, setLogsMode] = useState<'friendly' | 'raw'>('friendly')

  const handleLoadLogs = useCallback(async () => {
    setLogsLoading(true)
    setLogsError(null)
    try {
      // Friendly mode: load 300 raw lines (parser discards noise, needs headroom)
      // Raw mode: use user-selected lines + level
      setLogsData(await fetchLogs(
        logsMode === 'friendly' ? 300 : logsLines,
        logsMode === 'friendly' ? 'ALL' : logsLevel,
      ))
    } catch (err) {
      setLogsError(err instanceof Error ? err.message : String(err))
    } finally {
      setLogsLoading(false)
    }
  }, [logsLines, logsLevel, logsMode])

  return (
    <TgSection title="Диагностика">
      <div className="flex flex-wrap items-center gap-2 px-[22px] pb-2 pt-1">
        <TgSegmented
          options={[
            { id: 'friendly', label: 'Понятный' },
            { id: 'raw', label: 'Технический' },
          ]}
          active={logsMode}
          onChange={(id) => setLogsMode(id as 'friendly' | 'raw')}
        />

        {logsMode === 'raw' && (
          <>
            <select
              value={logsLevel}
              onChange={(e) => setLogsLevel(e.target.value as LogLevel)}
              className="rounded-tg-btn border border-tg-divider bg-tg-bg px-2 py-1 text-tg-sm text-tg-text outline-none focus:border-tg-line-active"
            >
              <option value="ALL">Все уровни</option>
              <option value="ERROR">Только ошибки</option>
              <option value="WARNING">Предупреждения</option>
              <option value="INFO">INFO</option>
            </select>
            <select
              value={logsLines}
              onChange={(e) => setLogsLines(Number(e.target.value))}
              className="rounded-tg-btn border border-tg-divider bg-tg-bg px-2 py-1 text-tg-sm text-tg-text outline-none focus:border-tg-line-active"
            >
              <option value={50}>50 строк</option>
              <option value={100}>100 строк</option>
              <option value={200}>200 строк</option>
              <option value={500}>500 строк</option>
            </select>
          </>
        )}

        <TgButton
          variant="light"
          onClick={handleLoadLogs}
          disabled={logsLoading}
          className="h-7 px-2.5 text-tg-sm"
        >
          {logsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {logsData ? 'Обновить' : 'Загрузить'}
        </TgButton>

        {window.electronAPI && (
          <TgButton
            variant="light"
            onClick={() => window.electronAPI?.openLogsFolder()}
            title="Открыть папку с логами в Проводнике"
            className="h-7 px-2.5 text-tg-sm"
          >
            <FolderOpen className="h-3 w-3" />
            Папка логов
          </TgButton>
        )}
      </div>

      {logsError && (
        <p className="mx-[22px] mb-2 rounded-tg-btn bg-tg-danger/10 px-3 py-2 text-tg-sm text-tg-danger">
          Ошибка: {logsError}
        </p>
      )}

      {logsData && logsMode === 'friendly' && (() => {
        const entries: FriendlyEntry[] = parseLogLines(logsData.lines)
        if (entries.length === 0) {
          return (
            <p className="px-[22px] pb-3 text-tg-sm text-tg-text-sub">
              Нет событий для отображения. Попробуй «Технический» режим для деталей.
            </p>
          )
        }
        return (
          <div className="mx-[22px] mb-3 flex max-h-72 flex-col gap-0.5 overflow-y-auto">
            {entries.map((e, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-start gap-2 rounded-tg-btn px-2 py-1.5 text-tg-sm',
                  e.isError ? 'bg-tg-danger/10'
                    : e.isWarning ? 'bg-[rgb(var(--tg-peer-3)/0.12)]'
                    : 'bg-tg-bg-over',
                )}
              >
                <span className="flex-none leading-[1.4]">{e.icon}</span>
                <span
                  className={cn(
                    'min-w-0 flex-1 leading-[1.5]',
                    e.isError ? 'text-tg-danger'
                      : e.isWarning ? 'text-[rgb(var(--tg-peer-3))]'
                      : 'text-tg-text',
                  )}
                >
                  {e.text}
                </span>
                <span className="flex-none tabular-nums text-tg-sm text-tg-text-sub">{e.time}</span>
              </div>
            ))}
          </div>
        )
      })()}

      {logsData && logsMode === 'raw' && (
        logsData.lines.length === 0 ? (
          <p className="px-[22px] pb-3 text-tg-sm text-tg-text-sub">
            Лог пуст или нет строк выбранного уровня.
          </p>
        ) : (
          <div className="mx-[22px] mb-3 overflow-hidden rounded-tg-btn border border-tg-divider">
            <div className="flex items-center justify-between border-b border-tg-divider px-2 py-1">
              <span className="text-tg-sm text-tg-text-sub">{logsData.file}</span>
              <span className="text-tg-sm text-tg-text-sub">{logsData.total_lines} строк</span>
            </div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all p-2 font-mono text-tg-sm leading-[1.6]">
              {logsData.lines.map((line, i) => (
                <span
                  key={i}
                  className={cn(
                    'block',
                    line.includes('ERROR') ? 'text-tg-danger'
                      : line.includes('WARNING') ? 'text-[rgb(var(--tg-peer-3))]'
                      : 'text-tg-text-sub',
                  )}
                >
                  {line}
                </span>
              ))}
            </pre>
          </div>
        )
      )}
    </TgSection>
  )
}
