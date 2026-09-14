/**
 * Animation timings copied from Telegram Desktop sources.
 *
 * basic.style:   universalDuration, slideDuration, slideShift, shake*
 * widgets.style: ripple, popup menu, toast, tabs, input, scroll area
 *
 * Components must read these rather than writing their own numbers, so a
 * timing can be checked against Telegram in one place.
 */
export const TG_MS = {
  /** Toggles, checkboxes, hover colour changes. */
  universal: 120,
  /** Ripple circle expanding from the press point. */
  rippleIn: 650,
  /** Ripple fading after release. */
  rippleOut: 200,
  /** Popup menu opening. */
  menuShow: 200,
  /** Popup menu closing. */
  menuHide: 150,
  /** Panel sliding in from the side. */
  slide: 240,
  /** Dimming behind a panel. */
  fadeWrap: 200,
  /** Block collapsing or expanding by height. */
  slideWrap: 150,
  /** Tab underline moving. */
  tabs: 150,
  /** Input underline and floating label. */
  input: 150,
  /** Toast appearing. */
  toastIn: 200,
  /** Toast sliding up. */
  toastSlide: 160,
  /** Toast fading away. */
  toastOut: 1000,
  /** Error shake. */
  shake: 300,
  /** Scrollbar hiding after scrolling stops. */
  scrollHide: 1000,
} as const

/** Distances and sizes from the same sources, in pixels. */
export const TG_PX = {
  /** How far a sliding panel travels. */
  slideShift: 100,
  /** Shake amplitude. */
  shakeShift: 4,
  /** Window title strip height. */
  titleHeight: 24,
  /** Window title button width. */
  titleButtonWidth: 36,
  /** Standard button height. */
  buttonHeight: 34,
} as const
