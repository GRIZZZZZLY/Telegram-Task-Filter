/**
 * Date helpers for backend timestamps and device-local rendering.
 */

export function getDeviceTimeZone(): string | undefined {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export function withDeviceTimeZone(
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormatOptions {
  const tz = getDeviceTimeZone()
  return tz ? { ...options, timeZone: tz } : options
}

/**
 * Backend can return naive UTC ISO strings (without timezone suffix).
 * Treat them as UTC explicitly to avoid local-time misinterpretation.
 */
export function parseBackendDate(iso: string): Date {
  const hasOffset = /([zZ]|[+-]\d{2}:\d{2})$/.test(iso)
  return new Date(hasOffset ? iso : `${iso}Z`)
}
