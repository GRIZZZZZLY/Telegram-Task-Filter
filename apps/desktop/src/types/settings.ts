export interface AppSettings {
  // Telegram
  tg_mention_handles: string       // comma-separated, e.g. "@alice,@bob"
  tg_monitored_chat_ids: string    // comma-separated chat IDs
  tg_monitored_thread_ids: string  // comma-separated thread IDs

  // Reactions
  done_reaction: string
  done_send_reply: boolean
  done_reply_text: string
  done_commit_delay_seconds: number

  // Filters
  filter_ignore_own: boolean
  filter_min_text_length: number
  filter_strict_mentions: boolean

  // Cleanup
  cleanup_done_after_days: number

  // UI
  sound_enabled: boolean
  compact_mode: boolean
}

export type AppSettingsUpdate = Partial<AppSettings>

/** Info returned by GET /telegram/chats */
export interface TgChat {
  id: string
  name: string
  type: 'supergroup' | 'channel' | 'group' | 'user' | 'unknown'
}

/** Info returned by GET /telegram/threads/{chat_id} */
export interface TgThread {
  id: string
  name: string
}
