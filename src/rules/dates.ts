// Calendar-date helpers. All dates are ISO "YYYY-MM-DD" strings handled in UTC
// so results never shift with the viewer's time zone.

export type IsoDate = string

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: string): boolean {
  if (!ISO_RE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && toIso(d) === value
}

export function parseIso(value: IsoDate): Date {
  if (!isIsoDate(value)) throw new Error(`Invalid date: ${value}`)
  return new Date(`${value}T00:00:00Z`)
}

export function toIso(d: Date): IsoDate {
  return d.toISOString().slice(0, 10)
}

/** Adds whole years, mapping Feb 29 to Feb 28 in non-leap years. */
export function addYears(value: IsoDate, years: number): IsoDate {
  const d = parseIso(value)
  const y = d.getUTCFullYear() + years
  const m = d.getUTCMonth()
  const day = Math.min(d.getUTCDate(), daysInMonth(y, m))
  return toIso(new Date(Date.UTC(y, m, day)))
}

export function addDays(value: IsoDate, days: number): IsoDate {
  const d = parseIso(value)
  d.setUTCDate(d.getUTCDate() + days)
  return toIso(d)
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

export function compare(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a > b ? a : b
}

export function formatLong(value: IsoDate): string {
  return parseIso(value).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
