// Rent roll import: one row per unit, past increases packed into one column
// as "YYYY-MM-DD:amount" pairs separated by semicolons.

import type { BuildingType, PastIncrease, UnitInput } from './engine'

export const CSV_COLUMNS = [
  'unit',
  'year_built',
  'built_before_june_13_1979',
  'building_type',
  'corporate_owner',
  'ab1482_exemption_notice',
  'move_in_date',
  'initial_rent',
  'past_increases',
  'housing_inventory_reported',
  'rent_increase_license',
] as const

const BUILDING_TYPES: BuildingType[] = [
  'multi_unit',
  'single_family',
  'condo',
  'owner_occupied_duplex',
  'shared_with_owner',
  'deed_restricted',
  'dorm',
]

export interface ParsedRow {
  line: number
  unit?: UnitInput
  error?: string
}

/** Minimal RFC 4180 parser: handles quoted fields, escaped quotes and CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') inQuotes = false
      else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''))
}

function bool(value: string | undefined): boolean {
  return /^(y|yes|true|1)$/i.test((value ?? '').trim())
}

function money(value: string | undefined): number {
  return Number((value ?? '').replace(/[$,\s]/g, ''))
}

export function parseIncreases(value: string): PastIncrease[] {
  return value
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const [date, amount] = pair.split(':')
      return { date: (date ?? '').trim(), newRent: money(amount) }
    })
}

export function parseRentRoll(text: string): ParsedRow[] {
  const rows = parseCsv(text)
  if (!rows.length) return []
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const missing = CSV_COLUMNS.filter((c) => c !== 'built_before_june_13_1979' && !header.includes(c))
  if (missing.length) return [{ line: 1, error: `Missing columns: ${missing.join(', ')}` }]
  const col = (r: string[], name: string) => r[header.indexOf(name)]?.trim() ?? ''

  return rows.slice(1).map((r, i) => {
    const line = i + 2
    const type = col(r, 'building_type') as BuildingType
    if (!BUILDING_TYPES.includes(type)) {
      return { line, error: `Unknown building_type "${type}". Use one of: ${BUILDING_TYPES.join(', ')}` }
    }
    return {
      line,
      unit: {
        label: col(r, 'unit'),
        certificateYear: Number(col(r, 'year_built')),
        certificateBeforeJune13_1979: bool(col(r, 'built_before_june_13_1979')),
        buildingType: type,
        ownedByCorporation: bool(col(r, 'corporate_owner')),
        ab1482ExemptionNoticeGiven: bool(col(r, 'ab1482_exemption_notice')),
        moveInDate: col(r, 'move_in_date'),
        initialRent: money(col(r, 'initial_rent')),
        pastIncreases: parseIncreases(col(r, 'past_increases')),
        housingInventoryReported: bool(col(r, 'housing_inventory_reported')),
        rentIncreaseLicense: bool(col(r, 'rent_increase_license')),
      },
    }
  })
}
