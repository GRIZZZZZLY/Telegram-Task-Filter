import { describe, it, expect } from 'vitest'
import { parseUpdateState, isUpdateDialogVisible } from './update-state'

describe('parseUpdateState', () => {
  it('reads a complete state', () => {
    const s = parseUpdateState({
      status: 'available',
      currentVersion: '0.1.16',
      availableVersion: '0.2.0',
      progress: 42,
      message: 'ready',
      checkedAt: '2026-09-14T10:00:00Z',
    })
    expect(s).toEqual({
      status: 'available',
      currentVersion: '0.1.16',
      availableVersion: '0.2.0',
      progress: 42,
      message: 'ready',
      checkedAt: '2026-09-14T10:00:00Z',
    })
  })

  it('fills in defaults for missing optional fields', () => {
    const s = parseUpdateState({ status: 'idle', currentVersion: '0.1.16' })
    expect(s?.availableVersion).toBeNull()
    expect(s?.progress).toBe(0)
    expect(s?.message).toBeNull()
    expect(s?.checkedAt).toBeNull()
  })

  it('rejects anything that is not a state object', () => {
    expect(parseUpdateState(null)).toBeNull()
    expect(parseUpdateState('available')).toBeNull()
    expect(parseUpdateState({})).toBeNull()
    expect(parseUpdateState({ status: 'available' })).toBeNull()
    expect(parseUpdateState({ currentVersion: '1.0.0' })).toBeNull()
  })

  it('ignores fields of the wrong type instead of trusting them', () => {
    const s = parseUpdateState({
      status: 'error',
      currentVersion: '1.0.0',
      availableVersion: 42,
      progress: 'lots',
      message: {},
    })
    expect(s?.availableVersion).toBeNull()
    expect(s?.progress).toBe(0)
    expect(s?.message).toBeNull()
  })
})

describe('isUpdateDialogVisible', () => {
  it('shows the dialog only for the four states that need the user', () => {
    const at = (status: string) =>
      isUpdateDialogVisible(parseUpdateState({ status, currentVersion: '1.0.0' }))
    expect(at('available')).toBe(true)
    expect(at('downloading')).toBe(true)
    expect(at('downloaded')).toBe(true)
    expect(at('error')).toBe(true)
    expect(at('idle')).toBe(false)
    expect(at('checking')).toBe(false)
    expect(at('not-available')).toBe(false)
    expect(at('unsupported')).toBe(false)
  })

  it('stays hidden with no state at all', () => {
    expect(isUpdateDialogVisible(null)).toBe(false)
  })
})
