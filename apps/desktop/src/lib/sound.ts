/**
 * Renderer-side notification sound using Web Audio API.
 *
 * Uses a singleton AudioContext to avoid timing jitter caused by
 * re-creating the context on every playback (new ctx starts at
 * currentTime=0, so ramp targets land in the past → unpredictable).
 *
 * All scheduling uses ctx.currentTime + SCHEDULE_OFFSET so the
 * AudioContext has a stable reference point.
 */

const SCHEDULE_OFFSET = 0.01 // seconds — small lookahead for stable scheduling

// ── Singleton AudioContext ────────────────────────────────────────────────────

let _ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!_ctx || _ctx.state === 'closed') {
    _ctx = new AudioContext()
  }
  // Resume if suspended (browser policy requires user gesture first)
  if (_ctx.state === 'suspended') {
    void _ctx.resume()
  }
  return _ctx
}

// ── State ─────────────────────────────────────────────────────────────────────

let _soundEnabled = true
let _currentPreset: SoundPreset = 'ding'
let _customSoundPath: string | null = null

export function setSoundEnabled(value: boolean): void {
  _soundEnabled = value
}

export function setNotificationSound(preset: SoundPreset): void {
  _currentPreset = preset
}

/**
 * Set the path for the custom sound file.
 * Accepts a URL path like '/sounds/custom.mp3' or a file:// URL.
 */
export function setCustomSoundPath(path: string | null): void {
  _customSoundPath = path
}

export function getCustomSoundPath(): string | null {
  return _customSoundPath
}

// ── Preset definitions ────────────────────────────────────────────────────────

export type SoundPreset = 'ding' | 'double' | 'chime' | 'pop' | 'ping' | 'custom'

export interface SoundPresetMeta {
  label: string
  description: string
}

export const SOUND_PRESETS: Record<SoundPreset, SoundPresetMeta> = {
  ding:   { label: 'Динь',     description: 'Мягкий колокольчик' },
  double: { label: 'Двойной',  description: 'Два сигнала подряд' },
  chime:  { label: 'Перезвон', description: 'Трёзвучный аккорд' },
  pop:    { label: 'Поп',      description: 'Короткий щелчок' },
  ping:   { label: 'Пинг',    description: 'Электронный сигнал' },
  custom: { label: 'Свой файл',description: 'MP3 или OGG из папки sounds/' },
}

// ── Preset implementations ────────────────────────────────────────────────────

/** Мягкий двухтональный колокольчик 880→1320 Hz */
function playDing(ctx: AudioContext, t: number): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.type = 'sine'
  osc.frequency.setValueAtTime(880, t)
  osc.frequency.linearRampToValueAtTime(1320, t + 0.08)

  gain.gain.setValueAtTime(0.18, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55)

  osc.start(t)
  osc.stop(t + 0.55)
}

/** Два коротких сигнала подряд */
function playDouble(ctx: AudioContext, t: number): void {
  for (let i = 0; i < 2; i++) {
    const offset = i * 0.22
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.type = 'sine'
    osc.frequency.setValueAtTime(1047, t + offset) // C6

    gain.gain.setValueAtTime(0.15, t + offset)
    gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.18)

    osc.start(t + offset)
    osc.stop(t + offset + 0.18)
  }
}

/** Трёзвучный перезвон C-E-G (major chord) */
function playChime(ctx: AudioContext, t: number): void {
  const freqs = [523.25, 659.25, 783.99] // C5, E5, G5
  freqs.forEach((freq, i) => {
    const offset = i * 0.12
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, t + offset)

    gain.gain.setValueAtTime(0.12, t + offset)
    gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.5)

    osc.start(t + offset)
    osc.stop(t + offset + 0.5)
  })
}

/** Короткий щелчок (triangle, очень быстрый decay) */
function playPop(ctx: AudioContext, t: number): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.type = 'triangle'
  osc.frequency.setValueAtTime(150, t)
  osc.frequency.exponentialRampToValueAtTime(60, t + 0.06)

  gain.gain.setValueAtTime(0.3, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08)

  osc.start(t)
  osc.stop(t + 0.08)
}

/** Электронный пинг 1200→800 Hz */
function playPing(ctx: AudioContext, t: number): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.type = 'sine'
  osc.frequency.setValueAtTime(1200, t)
  osc.frequency.exponentialRampToValueAtTime(800, t + 0.15)

  gain.gain.setValueAtTime(0.2, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4)

  osc.start(t)
  osc.stop(t + 0.4)
}

// ── Custom file playback ──────────────────────────────────────────────────────

function playCustomFile(path: string): void {
  try {
    const audio = new Audio(path)
    audio.volume = 0.7
    void audio.play()
  } catch {
    // File not found or format unsupported — ignore silently
  }
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

function dispatchPreset(ctx: AudioContext, preset: SoundPreset, t: number): void {
  switch (preset) {
    case 'ding':   return playDing(ctx, t)
    case 'double': return playDouble(ctx, t)
    case 'chime':  return playChime(ctx, t)
    case 'pop':    return playPop(ctx, t)
    case 'ping':   return playPing(ctx, t)
    case 'custom': // handled separately via playCustomFile
      return
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Play the currently selected notification sound preset. */
export function playNewTaskSound(): void {
  if (!_soundEnabled) return
  if (_currentPreset === 'custom') {
    if (_customSoundPath) playCustomFile(_customSoundPath)
    return
  }
  try {
    const ctx = getCtx()
    dispatchPreset(ctx, _currentPreset, ctx.currentTime + SCHEDULE_OFFSET)
  } catch {
    // AudioContext unavailable in some contexts — ignore silently
  }
}

/** Play a specific preset immediately (for preview in Settings). */
export function playPreviewSound(preset: SoundPreset): void {
  if (preset === 'custom') {
    if (_customSoundPath) playCustomFile(_customSoundPath)
    return
  }
  try {
    const ctx = getCtx()
    dispatchPreset(ctx, preset, ctx.currentTime + SCHEDULE_OFFSET)
  } catch {
    // ignore
  }
}

/** @deprecated Use playPreviewSound() instead. Kept for backward compat. */
export function playTestSound(): void {
  playPreviewSound(_currentPreset)
}
