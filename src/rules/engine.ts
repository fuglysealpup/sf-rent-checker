// The rule engine: decides which rent rules govern a San Francisco unit and
// computes the legal maximum increase, the notice period, and any problems in
// the unit's rent history. Pure functions only, so every rule is unit-testable.

import { addDays, addYears, compare, isIsoDate, maxDate, type IsoDate } from './dates'
import {
  AB1482_SUNSET,
  SF_BANKING_START,
  ab1482CapPercent,
  ab1482RatesPublishedThrough,
  sfAllowablePercent,
  sfRatesPublishedThrough,
} from './rates'

export type BuildingType =
  | 'multi_unit' // apartment building with 2+ units, not owner-occupied duplex
  | 'single_family'
  | 'condo'
  | 'owner_occupied_duplex' // owner lives in the other unit of a two-unit building
  | 'shared_with_owner' // tenant shares kitchen or bath with a resident owner
  | 'deed_restricted' // affordable housing with government-regulated rents
  | 'dorm'

export const BUILDING_TYPE_LABELS: Record<BuildingType, string> = {
  multi_unit: 'Apartment building (2+ units)',
  single_family: 'Single-family home',
  condo: 'Condominium',
  owner_occupied_duplex: 'Duplex, owner lives in the other unit',
  shared_with_owner: 'Room sharing kitchen or bath with resident owner',
  deed_restricted: 'Deed-restricted affordable housing',
  dorm: 'Dormitory',
}

export interface PastIncrease {
  date: IsoDate
  newRent: number
}

export interface UnitInput {
  label?: string
  /** Year the building's first certificate of occupancy was issued (roughly, year built). */
  certificateYear: number
  /** Only consulted when certificateYear is 1979: was it issued before June 13, 1979? */
  certificateBeforeJune13_1979?: boolean
  buildingType: BuildingType
  /** Owned by a REIT, corporation, or LLC with a corporate member (Civ. Code §1947.12(d)(5)). */
  ownedByCorporation: boolean
  /** Tenant received the written AB 1482 exemption notice in the lease. */
  ab1482ExemptionNoticeGiven: boolean
  moveInDate: IsoDate
  initialRent: number
  pastIncreases: PastIncrease[]
  /** Unit reported to the SF Rent Board Housing Inventory for the current year. */
  housingInventoryReported: boolean
  /** Owner holds a current SF rent increase license. */
  rentIncreaseLicense: boolean
}

export type ServiceMethod = 'personal' | 'mail'

export interface ProposedIncrease {
  effectiveDate: IsoDate
  /** Omit to propose the legal maximum. */
  newRent?: number
  serviceMethod: ServiceMethod
  /** Date the notice would be served; defaults to today in the UI. */
  serviceDate?: IsoDate
}

export type Regime = 'sf_rent_ordinance' | 'ab1482' | 'exempt'

export const REGIME_LABELS: Record<Regime, string> = {
  sf_rent_ordinance: 'SF Rent Ordinance',
  ab1482: 'California statewide cap (AB 1482)',
  exempt: 'Exempt from rent increase limits',
}

export interface Citation {
  label: string
  url: string
}

export const CITATIONS = {
  sfRentIncreases: {
    label: 'SF Rent Board: Learn about rent increases',
    url: 'https://www.sf.gov/learn-about-rent-increases-san-francisco',
  },
  sfBanking: {
    label: 'SF Rent Board: Banked rent increases',
    url: 'https://sf.gov/information/banked-rent-increases',
  },
  sfRates: {
    label: 'SF Rent Board: Current rates (Document 577)',
    url: 'https://media.api.sf.gov/documents/577_All_Rates_8.26.pdf',
  },
  sfLicense: {
    label: 'SF Rent Board: Housing Inventory and rent increase license',
    url: 'https://sf.gov/news/new-legislation-creates-housing-inventory-and-requires-owners-obtain-license-imposing',
  },
  ab1482: {
    label: 'Civil Code §1947.12 (AB 1482)',
    url: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1947.12',
  },
  costaHawkins: {
    label: 'Civil Code §1954.52 (Costa-Hawkins)',
    url: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1954.52',
  },
  notice827: {
    label: 'Civil Code §827 (notice periods)',
    url: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=827',
  },
  ccp1013: {
    label: 'Code of Civil Procedure §1013 (5 extra days when mailed)',
    url: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CCP&sectionNum=1013',
  },
  blsCpi: {
    label: 'BLS: CPI, San Francisco area',
    url: 'https://www.bls.gov/regions/west/news-release/ConsumerPriceIndex_SanFrancisco.htm',
  },
} satisfies Record<string, Citation>

export type Severity = 'error' | 'warning' | 'info'

export interface Issue {
  severity: Severity
  message: string
}

export interface CoverageResult {
  regime: Regime
  reasons: string[]
  citations: Citation[]
}

/** SF rent increase limits cover units first certified for occupancy before June 13, 1979. */
export function isPre1979(unit: UnitInput): boolean {
  if (unit.certificateYear < 1979) return true
  if (unit.certificateYear > 1979) return false
  return unit.certificateBeforeJune13_1979 === true
}

/**
 * Which rules limit increases on this unit, for an increase effective on `onDate`.
 * Order matters: full exemptions first, then SF rent control, then AB 1482.
 */
export function determineCoverage(unit: UnitInput, onDate: IsoDate): CoverageResult {
  const t = unit.buildingType

  if (t === 'deed_restricted') {
    return {
      regime: 'exempt',
      reasons: [
        'Deed-restricted affordable housing has rents set by its regulatory agreement, so neither the SF Rent Ordinance nor AB 1482 limits increases. Check the agreement instead.',
      ],
      citations: [CITATIONS.ab1482],
    }
  }
  if (t === 'dorm') {
    return {
      regime: 'exempt',
      reasons: ['Dormitories run by a school are exempt from AB 1482 and SF increase limits.'],
      citations: [CITATIONS.ab1482],
    }
  }
  if (t === 'shared_with_owner') {
    return {
      regime: 'exempt',
      reasons: [
        'A tenant who shares a kitchen or bathroom with an owner who lives there is exempt from both SF rent control and AB 1482.',
      ],
      citations: [CITATIONS.sfRentIncreases, CITATIONS.ab1482],
    }
  }

  const reasons: string[] = []
  if (isPre1979(unit)) {
    const separatelyAlienable = t === 'single_family' || t === 'condo'
    if (separatelyAlienable && compare(unit.moveInDate, '1996-01-01') >= 0) {
      reasons.push(
        'The building is old enough for SF rent control, but single-family homes and condos with tenancies that began on or after January 1, 1996 are exempt from local increase limits under Costa-Hawkins.',
      )
    } else {
      return {
        regime: 'sf_rent_ordinance',
        reasons: [
          'The building was first certified for occupancy before June 13, 1979, so the SF Rent Ordinance limits increases to the annual allowable amount plus any banked increases.',
          ...(separatelyAlienable
            ? ['This home or condo stays under SF rent control because the tenancy began before January 1, 1996.']
            : []),
        ],
        citations: [CITATIONS.sfRentIncreases, CITATIONS.sfBanking],
      }
    }
  } else {
    reasons.push(
      'The building was first certified for occupancy after June 13, 1979, so SF rent control does not limit increases (eviction protections still apply).',
    )
  }

  // AB 1482 exemptions (Civil Code §1947.12(d)).
  const effectiveYear = Number(onDate.slice(0, 4))
  // "Issued within the previous 15 years." With only a year we can't tell the
  // boundary year apart, so the boundary year is treated as covered (the
  // stricter answer).
  if (unit.certificateYear + 15 > effectiveYear) {
    reasons.push(
      `Buildings first certified for occupancy within the last 15 years are exempt from AB 1482. This one (${unit.certificateYear}) is exempt until ${unit.certificateYear + 15}.`,
    )
    return { regime: 'exempt', reasons, citations: [CITATIONS.ab1482, CITATIONS.costaHawkins] }
  }
  if (unit.certificateYear + 15 === effectiveYear) {
    reasons.push(
      `The building turns 15 in ${effectiveYear}. Whether AB 1482 applies depends on the exact certificate date, so this checker applies the cap to be safe.`,
    )
  }
  if (compare(onDate, AB1482_SUNSET) >= 0) {
    reasons.push('AB 1482 is scheduled to expire on January 1, 2030; this increase falls after that date.')
    return { regime: 'exempt', reasons, citations: [CITATIONS.ab1482] }
  }
  if (t === 'owner_occupied_duplex') {
    reasons.push('A duplex where the owner has lived in the other unit since the tenancy began is exempt from AB 1482.')
    return { regime: 'exempt', reasons, citations: [CITATIONS.ab1482] }
  }
  if (t === 'single_family' || t === 'condo') {
    if (unit.ownedByCorporation) {
      reasons.push(
        'Homes and condos owned by a REIT, a corporation, or an LLC with a corporate member are covered by AB 1482.',
      )
    } else if (!unit.ab1482ExemptionNoticeGiven) {
      reasons.push(
        "This home or condo could be exempt from AB 1482, but only if the lease gave the tenant the statute's written exemption notice. Without it, the cap applies.",
      )
    } else {
      reasons.push(
        'Homes and condos owned by individuals are exempt from AB 1482 when the tenant received the written exemption notice.',
      )
      return { regime: 'exempt', reasons, citations: [CITATIONS.ab1482, CITATIONS.costaHawkins] }
    }
  }
  reasons.push('AB 1482 limits increases to 5% plus regional inflation, at most 10%, over any 12 months.')
  return { regime: 'ab1482', reasons, citations: [CITATIONS.ab1482, CITATIONS.blsCpi] }
}

export function currentRent(unit: UnitInput): number {
  const sorted = sortedIncreases(unit)
  return sorted.length ? sorted[sorted.length - 1].newRent : unit.initialRent
}

function sortedIncreases(unit: UnitInput): PastIncrease[] {
  return [...unit.pastIncreases].sort((a, b) => compare(a.date, b.date))
}

/** Percent increase from `from` to `to`, unrounded. */
export function percentChange(from: number, to: number): number {
  return ((to - from) / from) * 100
}

/** Rounds down to the cent, so a computed maximum is never above the legal amount. */
export function floorCents(n: number): number {
  return Math.floor(Math.round(n * 1e6) / 1e4) / 100
}

function roundPct(n: number): number {
  return Math.round(n * 10000) / 10000
}

// Tolerance when checking past increases: one cent of rounding, expressed in percent.
function centsTolerancePct(base: number): number {
  return (0.01 / base) * 100
}

export interface BankedYear {
  anniversary: IsoDate
  percent: number
  /** Where the entry came from: a skipped anniversary, or the unused part of a partial increase. */
  source: 'skipped' | 'partial'
}

export interface SfHistoryStep {
  date: IsoDate
  oldRent: number
  newRent: number
  percent: number
  allowedPercent: number | null
}

export interface SfLedger {
  /** Date the next increase may take effect (12 months after the last increase or move-in). */
  anchor: IsoDate
  bank: BankedYear[]
  steps: SfHistoryStep[]
  issues: Issue[]
}

/**
 * Walks the rent history under the SF banking rules (SF Rent Board, "Banked rent
 * increases"):
 * - One increase per 12 months; the date of each increase becomes the new anniversary.
 * - An increase uses the annual rate in effect on its effective date.
 * - Each anniversary passed with no increase banks that anniversary's rate, but
 *   only anniversaries before the year of the next increase: banking needs 24 full months.
 * - Imposing less than the allowed amount banks the remainder.
 * - Banked percentages are added, never compounded, and applied to the current base rent.
 * - Nothing banks before April 1, 1982.
 */
export function buildSfLedger(unit: UnitInput): SfLedger {
  const issues: Issue[] = []
  const steps: SfHistoryStep[] = []
  let bank: BankedYear[] = []
  let anchor = unit.moveInDate
  let rent = unit.initialRent

  for (const inc of sortedIncreases(unit)) {
    const pct = percentChange(rent, inc.newRent)
    const earliest = addYears(anchor, 1)
    if (compare(inc.date, earliest) < 0) {
      issues.push({
        severity: 'error',
        message: `The increase on ${inc.date} came less than 12 months after the previous increase or move-in (${anchor}). SF allows one increase per 12 months.`,
      })
      steps.push({ date: inc.date, oldRent: rent, newRent: inc.newRent, percent: pct, allowedPercent: 0 })
      bank = []
      anchor = inc.date
      rent = inc.newRent
      continue
    }

    const available = availableBank(bank, anchor, inc.date)
    const current = sfAllowablePercent(inc.date) ?? 0
    const allowed = roundPct(current + sumBank(available))
    steps.push({ date: inc.date, oldRent: rent, newRent: inc.newRent, percent: pct, allowedPercent: allowed })

    if (pct > allowed + centsTolerancePct(rent)) {
      issues.push({
        severity: 'warning',
        message: `The increase on ${inc.date} was ${pct.toFixed(2)}%, above the ${allowed.toFixed(1)}% this checker allows (annual plus banked). That may be a past overcharge, unless it was a Rent Board-approved pass-through or petition.`,
      })
      bank = []
    } else if (pct < current) {
      // Partial increase: the unused part of this year's rate is banked; older bank carries over.
      bank = [...available, { anniversary: inc.date, percent: roundPct(current - pct), source: 'partial' }]
    } else {
      bank = consumeBank(available, pct - current)
    }
    anchor = inc.date
    rent = inc.newRent
  }

  return { anchor, bank, steps, issues }
}

/** Existing bank plus anniversaries skipped before the year that contains `onDate`. */
function availableBank(bank: BankedYear[], anchor: IsoDate, onDate: IsoDate): BankedYear[] {
  const result = [...bank]
  for (let k = 1; ; k++) {
    const anniversary = addYears(anchor, k)
    const next = addYears(anchor, k + 1)
    // The anniversary only banks if the following anniversary has also passed,
    // i.e. a full skipped year lies between the last increase and onDate.
    if (compare(next, onDate) > 0) break
    if (compare(anniversary, SF_BANKING_START) < 0) continue
    const pct = sfAllowablePercent(anniversary)
    if (pct !== null) result.push({ anniversary, percent: pct, source: 'skipped' })
  }
  return result
}

function sumBank(bank: BankedYear[]): number {
  return roundPct(bank.reduce((s, b) => s + b.percent, 0))
}

/** Removes `used` percentage points from the bank, oldest entries first. */
function consumeBank(bank: BankedYear[], used: number): BankedYear[] {
  let remaining = roundPct(used)
  const out: BankedYear[] = []
  for (const b of bank) {
    if (remaining <= 0) {
      out.push(b)
    } else if (b.percent <= remaining) {
      remaining = roundPct(remaining - b.percent)
    } else {
      out.push({ ...b, percent: roundPct(b.percent - remaining) })
      remaining = 0
    }
  }
  return out
}

export type Status = 'ok' | 'over_limit' | 'blocked' | 'too_early' | 'rate_unavailable'

export interface NoticeRequirement {
  days: number
  baseDays: 30 | 90
  mailDays: number
  serveBy: IsoDate
  reason: string
  /** True when the chosen service date leaves too little time. */
  late: boolean
  /** Earliest effective date given the chosen service date. */
  earliestEffectiveForService?: IsoDate
}

export interface BreakdownLine {
  label: string
  percent: number
}

export interface Evaluation {
  regime: Regime
  coverage: CoverageResult
  currentRent: number
  effectiveDate: IsoDate
  status: Status
  /** Earliest date the next increase may take effect, when a once-per-year rule applies. */
  earliestEffectiveDate: IsoDate | null
  maxPercent: number | null
  maxRent: number | null
  /** What the maximum would be once licensing is fixed (SF only, when blocked). */
  maxRentIfLicensed: number | null
  breakdown: BreakdownLine[]
  bankedYears: BankedYear[]
  proposedRent: number
  proposedPercent: number
  notice: NoticeRequirement
  issues: Issue[]
  history: SfHistoryStep[]
  citations: Citation[]
}

/** Rent in effect on a given day (move-in rent until the first increase). */
function rentOn(unit: UnitInput, date: IsoDate): number {
  let rent = unit.initialRent
  for (const inc of sortedIncreases(unit)) {
    if (compare(inc.date, date) <= 0) rent = inc.newRent
  }
  return rent
}

/** Lowest rent charged in the 12 months before `date` (Civ. Code §827 and §1947.12). */
export function lowestRentPrior12Months(unit: UnitInput, date: IsoDate): number {
  const windowStart = maxDate(addYears(date, -1), unit.moveInDate)
  let lowest = rentOn(unit, windowStart)
  for (const inc of sortedIncreases(unit)) {
    if (compare(inc.date, windowStart) > 0 && compare(inc.date, date) < 0) {
      lowest = Math.min(lowest, inc.newRent)
    }
  }
  return lowest
}

/**
 * Notice period under Civil Code §827(b): 30 days, or 90 days when this increase
 * plus all others in the prior 12 months exceeds 10% of the lowest rent charged
 * in that time. Add 5 days when the notice is mailed (CCP §1013).
 */
export function noticeRequirement(
  unit: UnitInput,
  effectiveDate: IsoDate,
  newRent: number,
  method: ServiceMethod,
  serviceDate?: IsoDate,
): NoticeRequirement {
  const lowest = lowestRentPrior12Months(unit, effectiveDate)
  const cumulative = percentChange(lowest, newRent)
  const baseDays = cumulative > 10 ? 90 : 30
  const mailDays = method === 'mail' ? 5 : 0
  const days = baseDays + mailDays
  const serveBy = addDays(effectiveDate, -days)
  const reason =
    baseDays === 90
      ? `Increases over the last 12 months total ${cumulative.toFixed(1)}% of the lowest rent charged, which is more than 10%, so 90 days' notice is required.`
      : `Increases over the last 12 months total ${cumulative.toFixed(1)}% of the lowest rent charged, 10% or less, so 30 days' notice is required.`
  const late = serviceDate !== undefined && compare(serviceDate, serveBy) > 0
  return {
    days,
    baseDays,
    mailDays,
    serveBy,
    reason: mailDays ? `${reason} Mailing adds 5 days.` : reason,
    late,
    earliestEffectiveForService: serviceDate ? addDays(serviceDate, days) : undefined,
  }
}

export function validateUnit(unit: UnitInput): string[] {
  const errors: string[] = []
  if (!Number.isInteger(unit.certificateYear) || unit.certificateYear < 1850 || unit.certificateYear > 2100) {
    errors.push('Enter the year the building was built (first certificate of occupancy).')
  }
  if (!isIsoDate(unit.moveInDate)) errors.push('Enter a valid move-in date.')
  if (!(unit.initialRent > 0)) errors.push('Enter the starting rent.')
  for (const inc of unit.pastIncreases) {
    if (!isIsoDate(inc.date)) errors.push('Each past increase needs a valid date.')
    else if (isIsoDate(unit.moveInDate) && compare(inc.date, unit.moveInDate) <= 0) {
      errors.push(`The increase on ${inc.date} is on or before the move-in date.`)
    }
    if (!(inc.newRent > 0)) errors.push('Each past increase needs the new rent amount.')
  }
  return errors
}

export function evaluate(unit: UnitInput, proposal: ProposedIncrease): Evaluation {
  const errors = validateUnit(unit)
  if (!isIsoDate(proposal.effectiveDate)) errors.push('Enter a valid effective date for the increase.')
  if (errors.length) throw new InputError(errors)

  const effectiveDate = proposal.effectiveDate
  const coverage = determineCoverage(unit, effectiveDate)
  const rent = currentRent(unit)
  const issues: Issue[] = []
  const citations: Citation[] = [...coverage.citations, CITATIONS.notice827]
  if (proposal.serviceMethod === 'mail') citations.push(CITATIONS.ccp1013)

  let status: Status = 'ok'
  let earliestEffectiveDate: IsoDate | null = null
  let maxPercent: number | null = null
  let maxRent: number | null = null
  let maxRentIfLicensed: number | null = null
  let breakdown: BreakdownLine[] = []
  let bankedYears: BankedYear[] = []
  let history: SfHistoryStep[] = []

  if (coverage.regime === 'sf_rent_ordinance') {
    const ledger = buildSfLedger(unit)
    history = ledger.steps
    issues.push(...ledger.issues)
    earliestEffectiveDate = addYears(ledger.anchor, 1)
    const current = sfAllowablePercent(effectiveDate)
    if (compare(effectiveDate, earliestEffectiveDate) < 0) {
      status = 'too_early'
      issues.push({
        severity: 'error',
        message: `SF allows one increase every 12 months. The next increase can take effect on or after ${earliestEffectiveDate}.`,
      })
    } else if (current === null) {
      status = 'rate_unavailable'
      issues.push({
        severity: 'error',
        message: `The SF Rent Board has only published the annual allowable increase through ${sfRatesPublishedThrough()}. The rate for this date isn't known yet.`,
      })
    } else {
      bankedYears = availableBank(ledger.bank, ledger.anchor, effectiveDate)
      const banked = sumBank(bankedYears)
      maxPercent = roundPct(current + banked)
      breakdown = [{ label: `Annual allowable increase in effect on ${effectiveDate}`, percent: current }]
      if (banked > 0) breakdown.push({ label: 'Banked increases', percent: banked })
      const legalMax = floorCents(rent * (1 + maxPercent / 100))
      if (!unit.housingInventoryReported || !unit.rentIncreaseLicense) {
        status = 'blocked'
        maxRentIfLicensed = legalMax
        maxRent = rent
        const missing = [
          !unit.housingInventoryReported && 'report the unit to the Housing Inventory',
          !unit.rentIncreaseLicense && 'get a rent increase license',
        ].filter(Boolean)
        issues.push({
          severity: 'error',
          message: `No annual or banked increase is allowed until you ${missing.join(' and ')}. The license is issued only when Housing Inventory reporting is up to date.`,
        })
        citations.push(CITATIONS.sfLicense)
      } else {
        maxRent = legalMax
      }
    }
  } else if (coverage.regime === 'ab1482') {
    const cap = ab1482CapPercent(effectiveDate)
    if (cap === null) {
      status = 'rate_unavailable'
      issues.push({
        severity: 'error',
        message: `AB 1482 caps are only known for increases through ${ab1482RatesPublishedThrough()} (the next one depends on April's CPI).`,
      })
    } else {
      const lowest = lowestRentPrior12Months(unit, effectiveDate)
      const windowStart = addYears(effectiveDate, -1)
      const recent = unit.pastIncreases.filter(
        (i) => compare(i.date, windowStart) > 0 && compare(i.date, effectiveDate) < 0,
      )
      maxPercent = cap
      maxRent = Math.max(rent, floorCents(lowest * (1 + cap / 100)))
      breakdown = [{ label: `AB 1482 cap for the SF region (5% + ${roundPct(cap - 5)}% CPI)`, percent: cap }]
      if (lowest !== rent) {
        issues.push({
          severity: 'info',
          message: `The cap applies to all increases in the past 12 months combined, measured from the lowest rent charged in that time ($${lowest.toFixed(2)}).`,
        })
      }
      if (recent.length >= 2) {
        status = 'too_early'
        maxRent = rent
        issues.push({
          severity: 'error',
          message: 'AB 1482 allows at most two increases in any 12 months, and this unit has already had two.',
        })
      }
    }
  } else {
    issues.push({
      severity: 'info',
      message: 'No local or state cap limits this increase. Notice rules still apply, and very large increases can raise other legal questions.',
    })
  }

  if (coverage.regime !== 'sf_rent_ordinance' && !unit.housingInventoryReported) {
    issues.push({
      severity: 'warning',
      message: 'Most SF rental units must still be reported to the Rent Board Housing Inventory each year, even when SF rent control does not cap the rent.',
    })
    citations.push(CITATIONS.sfLicense)
  }

  const proposedRent = proposal.newRent ?? maxRent ?? rent
  const proposedPercent = percentChange(rent, proposedRent)
  if (proposal.newRent !== undefined && proposal.newRent < rent) {
    issues.push({ severity: 'info', message: 'The proposed rent is lower than the current rent; no increase notice is needed.' })
  }
  if (maxRent !== null && proposedRent > maxRent + 0.005 && status === 'ok') {
    status = 'over_limit'
    issues.push({
      severity: 'error',
      message: `The proposed rent of $${proposedRent.toFixed(2)} is above the legal maximum of $${maxRent.toFixed(2)}.`,
    })
  }

  const notice = noticeRequirement(unit, effectiveDate, proposedRent, proposal.serviceMethod, proposal.serviceDate)
  if (notice.late) {
    issues.push({
      severity: 'error',
      message: `Served on ${proposal.serviceDate}, the notice is too late for ${effectiveDate}. It needed to be served by ${notice.serveBy}; the earliest effective date is now ${notice.earliestEffectiveForService}.`,
    })
  }

  return {
    regime: coverage.regime,
    coverage,
    currentRent: rent,
    effectiveDate,
    status,
    earliestEffectiveDate,
    maxPercent,
    maxRent,
    maxRentIfLicensed,
    breakdown,
    bankedYears,
    proposedRent,
    proposedPercent,
    notice,
    issues,
    history,
    citations: dedupe(citations),
  }
}

function dedupe(citations: Citation[]): Citation[] {
  const seen = new Set<string>()
  return citations.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)))
}

export class InputError extends Error {
  errors: string[]
  constructor(errors: string[]) {
    super(errors.join(' '))
    this.errors = errors
  }
}
