import { Maximize2, ExternalLink, Pin, PinOff, Flag, Trash2, RotateCcw, MessageSquare } from 'lucide-react'
import { TgPopupMenu } from '@/components/tg'
import type { TgMenuItem } from '@/components/tg'
import type { Task } from '@/types/task'
import { buildTgLinks, nextPriority } from '@/lib/task-format'

interface Props {
  task: Task
  open: boolean
  anchor: { x: number; y: number } | null
  onClose: () => void
  onOpenDetail?: () => void
  onPriorityChange: (id: number, priority: Task['priority']) => void
  onPin?: (id: number) => void
  onDismiss: (id: number) => void
  onReopen: (id: number) => void
  /** Opens the inline field that sends a custom reply with "done". */
  onCustomReply?: () => void
}

const PRIORITY_LABEL: Record<Task['priority'], string> = {
  normal: 'Обычный',
  high: 'Высокий',
  medium: 'Средний',
  low: 'Низкий',
}

/**
 * Everything that used to sit on the card as a button and now lives one
 * right-click away. Which items appear depends on the tab the task is in.
 */
export function TaskRowMenu({
  task,
  open,
  anchor,
  onClose,
  onOpenDetail,
  onPriorityChange,
  onPin,
  onDismiss,
  onReopen,
  onCustomReply,
}: Props) {
  const isInbox = task.status === 'inbox'
  const isPinned = task.sort_order !== null && task.sort_order < 0
  const chatId = task.chat_id || task.source_chat || ''
  const links = buildTgLinks(chatId, task.source_message_id)

  const items: TgMenuItem[] = []

  if (onOpenDetail) {
    items.push({
      id: 'detail',
      label: 'Подробности',
      icon: <Maximize2 className="h-4 w-4" />,
      onSelect: onOpenDetail,
    })
  }

  items.push({
    id: 'telegram',
    label: 'Открыть в Telegram',
    icon: <ExternalLink className="h-4 w-4" />,
    onSelect: () => window.electronAPI?.openExternal(links.deep),
  })

  if (isInbox) {
    if (onCustomReply) {
      items.push({
        id: 'custom-reply',
        label: 'Выполнить со своим ответом',
        icon: <MessageSquare className="h-4 w-4" />,
        onSelect: onCustomReply,
      })
    }

    items.push({
      id: 'priority',
      label: `Приоритет: ${PRIORITY_LABEL[task.priority]}`,
      icon: <Flag className="h-4 w-4" />,
      onSelect: () => onPriorityChange(task.id, nextPriority(task.priority)),
    })

    if (onPin) {
      items.push({
        id: 'pin',
        label: isPinned ? 'Открепить' : 'Закрепить вверху',
        icon: isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />,
        onSelect: () => onPin(task.id),
      })
    }

    items.push({
      id: 'dismiss',
      label: 'Убрать из списка',
      icon: <Trash2 className="h-4 w-4" />,
      danger: true,
      onSelect: () => onDismiss(task.id),
    })
  } else {
    items.push({
      id: 'reopen',
      label: task.status === 'done' ? 'Вернуть' : 'В inbox',
      icon: <RotateCcw className="h-4 w-4" />,
      onSelect: () => onReopen(task.id),
    })
  }

  return <TgPopupMenu open={open} anchor={anchor} onClose={onClose} items={items} />
}
