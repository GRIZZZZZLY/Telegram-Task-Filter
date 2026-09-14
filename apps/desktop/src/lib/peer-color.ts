/**
 * Telegram paints every chat participant in one of eight colours.
 * We do the same for task authors: same author, same colour, every launch.
 */

/** Number of author colours in the Telegram palette. */
const PEER_COLORS = 8

/**
 * Stable 1..8 colour slot for a chat id.
 *
 * A plain multiply-and-add hash: chat ids are short strings, and all we need
 * is that the same id lands on the same slot and that ids spread out.
 */
export function peerColorIndex(chatId: string): number {
  let hash = 0
  for (let i = 0; i < chatId.length; i++) {
    hash = (Math.imul(hash, 31) + chatId.charCodeAt(i)) >>> 0
  }
  return (hash % PEER_COLORS) + 1
}

/** The same slot as a CSS colour, ready for a style attribute. */
export function peerColorVar(chatId: string): string {
  return `rgb(var(--tg-peer-${peerColorIndex(chatId)}))`
}
