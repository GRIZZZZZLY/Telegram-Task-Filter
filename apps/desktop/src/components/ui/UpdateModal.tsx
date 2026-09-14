/**
 * UpdateModal — окно новой версии.
 *
 * Появляется само, когда сервер обновлений сообщил о новой версии.
 * Показывает описание изменений с GitHub и ведёт загрузку и установку.
 */
import { useEffect, useState } from 'react'
import { Download, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { TgModal, TgButton } from '@/components/tg'
import { parseUpdateState, isUpdateDialogVisible } from '@/lib/update-state'
import type { UpdateState } from '@/lib/update-state'

async function fetchChangelog(version: string): Promise<string | null> {
  try {
    const tag = version.startsWith('v') ? version : `v${version}`
    const res = await fetch(
      `https://api.github.com/repos/GRIZZZZZLY/Telegram-Task-Filter/releases/tags/${tag}`,
      { headers: { Accept: 'application/vnd.github+json' } },
    )
    if (!res.ok) return null
    const data = await res.json() as { body?: string }
    return data.body?.trim() || null
  } catch {
    return null
  }
}

/** Release notes are Markdown-ish: headers, bullets, plain lines. */
function Changelog({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1">
      {text.split('\n').map((line, i) => {
        const trimmed = line.trim()
        if (!trimmed) return <div key={i} className="h-1" />
        if (trimmed.startsWith('## ')) {
          return (
            <p key={i} className="pt-1 text-tg-base font-semibold text-tg-text-bold">
              {trimmed.replace(/^##\s*/, '')}
            </p>
          )
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          return (
            <p key={i} className="pl-2 text-tg-base text-tg-text-sub">
              · {trimmed.replace(/^[-•]\s*/, '')}
            </p>
          )
        }
        return <p key={i} className="text-tg-base text-tg-text-sub">{trimmed}</p>
      })}
    </div>
  )
}

interface Props {
  /** Called when user clicks "Пропустить" or closes the modal */
  onDismiss: () => void
}

export function UpdateModal({ onDismiss }: Props) {
  const [updateState, setUpdateState] = useState<UpdateState | null>(null)
  const [changelog, setChangelog] = useState<string | null>(null)
  const [changelogLoading, setChangelogLoading] = useState(false)

  useEffect(() => {
    if (!window.electronAPI) return

    void window.electronAPI.updatesGetState().then((raw) => {
      const s = parseUpdateState(raw)
      if (s) setUpdateState(s)
    })

    return window.electronAPI.onUpdatesStateChanged((raw) => {
      const s = parseUpdateState(raw)
      if (s) setUpdateState(s)
    })
  }, [])

  useEffect(() => {
    const version = updateState?.availableVersion
    if (!version || changelog !== null) return
    setChangelogLoading(true)
    void fetchChangelog(version).then((text) => {
      setChangelog(text)
      setChangelogLoading(false)
    })
  }, [updateState?.availableVersion, changelog])

  const status = updateState?.status
  const visible = isUpdateDialogVisible(updateState)

  const footer = (
    <>
      {status === 'available' && (
        <>
          <TgButton variant="light" onClick={onDismiss}>Пропустить</TgButton>
          <TgButton onClick={() => void window.electronAPI?.updatesDownload()}>
            <Download className="h-3.5 w-3.5" />
            Обновить
          </TgButton>
        </>
      )}

      {status === 'downloading' && (
        <TgButton disabled>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Загрузка...
        </TgButton>
      )}

      {status === 'downloaded' && (
        <>
          <TgButton variant="light" onClick={onDismiss}>Позже</TgButton>
          <TgButton onClick={() => window.electronAPI?.updatesInstall()}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            Установить и перезапустить
          </TgButton>
        </>
      )}

      {status === 'error' && (
        <>
          <TgButton variant="light" onClick={onDismiss}>Закрыть</TgButton>
          <TgButton variant="light" onClick={() => void window.electronAPI?.updatesDownload()}>
            <Download className="h-3.5 w-3.5" />
            Повторить
          </TgButton>
        </>
      )}
    </>
  )

  return (
    <TgModal
      open={visible}
      onClose={onDismiss}
      title="Доступно обновление"
      subtitle={
        updateState?.availableVersion
          ? `${updateState.currentVersion} → v${updateState.availableVersion}`
          : undefined
      }
      // Only the "available" state may be dismissed; a running download is not
      // interrupted by a stray Escape.
      closable={status === 'available'}
      footer={footer}
    >
      {changelogLoading ? (
        <div className="flex items-center gap-2 text-tg-base text-tg-text-sub">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Загрузка описания...
        </div>
      ) : changelog ? (
        <Changelog text={changelog} />
      ) : (
        <p className="text-tg-base text-tg-text-sub">Описание изменений недоступно.</p>
      )}

      {status === 'downloading' && updateState && (
        <div className="mt-3">
          <div className="h-1 w-full overflow-hidden rounded-full bg-tg-bg-over">
            <div
              className="h-full rounded-full bg-tg-accent transition-all"
              style={{ width: `${updateState.progress}%` }}
            />
          </div>
          <p className="mt-1 text-tg-sm text-tg-text-sub">
            Загрузка... {Math.round(updateState.progress)}%
          </p>
        </div>
      )}

      {status === 'downloaded' && (
        <p className="mt-3 flex items-center gap-2 text-tg-base text-tg-good">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Обновление загружено и готово к установке
        </p>
      )}

      {status === 'error' && (
        <p className="mt-3 flex items-start gap-2 text-tg-base text-tg-danger">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{updateState?.message ?? 'Ошибка при загрузке обновления'}</span>
        </p>
      )}
    </TgModal>
  )
}
