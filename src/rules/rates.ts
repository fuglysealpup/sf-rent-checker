// Published rates. Every number here comes from an official source cited
// beside it. When a new year's rate is published, add a row; dates past the
// last row deliberately return null so the app refuses to guess.

import { compare, type IsoDate } from './dates'

export interface RatePeriod {
  start: IsoDate
  end: IsoDate // inclusive
  percent: number
}

/**
 * San Francisco annual allowable increase (Rent Ordinance §37.3(a)(1)).
 * Sources:
 * - SF Rent Board, "Current Rates" (Document 577, rev. 8/26):
 *   https://media.api.sf.gov/documents/577_All_Rates_8.26.pdf
 * - SF Rent Board, "Allowable Annual Increases" (Document 571) for 1982–1996:
 *   https://sf.gov/file/571-allowable-annual-increases-25-26-en-1124pdf
 * The rate that applies is the one in effect on the date the increase takes effect.
 */
export const SF_ANNUAL_ALLOWABLE: RatePeriod[] = [
  { start: '1982-04-01', end: '1983-02-28', percent: 7.0 },
  { start: '1983-03-01', end: '1984-02-29', percent: 7.0 },
  { start: '1984-03-01', end: '1992-12-07', percent: 4.0 },
  // Doc 571: only one of the two 1992–93 increases may be imposed, depending on
  // the anniversary date. Splitting the period by date reproduces that.
  { start: '1992-12-08', end: '1993-02-28', percent: 1.6 },
  { start: '1993-03-01', end: '1994-02-28', percent: 1.9 },
  { start: '1994-03-01', end: '1995-02-28', percent: 1.3 },
  { start: '1995-03-01', end: '1996-02-29', percent: 1.1 },
  { start: '1996-03-01', end: '1997-02-28', percent: 1.0 },
  { start: '1997-03-01', end: '1998-02-28', percent: 1.8 },
  { start: '1998-03-01', end: '1999-02-28', percent: 2.2 },
  { start: '1999-03-01', end: '2000-02-29', percent: 1.7 },
  { start: '2000-03-01', end: '2001-02-28', percent: 2.9 },
  { start: '2001-03-01', end: '2002-02-28', percent: 2.8 },
  { start: '2002-03-01', end: '2003-02-28', percent: 2.7 },
  { start: '2003-03-01', end: '2004-02-29', percent: 0.8 },
  { start: '2004-03-01', end: '2005-02-28', percent: 0.6 },
  { start: '2005-03-01', end: '2006-02-28', percent: 1.2 },
  { start: '2006-03-01', end: '2007-02-28', percent: 1.7 },
  { start: '2007-03-01', end: '2008-02-29', percent: 1.5 },
  { start: '2008-03-01', end: '2009-02-28', percent: 2.0 },
  { start: '2009-03-01', end: '2010-02-28', percent: 2.2 },
  { start: '2010-03-01', end: '2011-02-28', percent: 0.1 },
  { start: '2011-03-01', end: '2012-02-29', percent: 0.5 },
  { start: '2012-03-01', end: '2013-02-28', percent: 1.9 },
  { start: '2013-03-01', end: '2014-02-28', percent: 1.9 },
  { start: '2014-03-01', end: '2015-02-28', percent: 1.0 },
  { start: '2015-03-01', end: '2016-02-29', percent: 1.9 },
  { start: '2016-03-01', end: '2017-02-28', percent: 1.6 },
  { start: '2017-03-01', end: '2018-02-28', percent: 2.2 },
  { start: '2018-03-01', end: '2019-02-28', percent: 1.6 },
  { start: '2019-03-01', end: '2020-02-29', percent: 2.6 },
  { start: '2020-03-01', end: '2021-02-28', percent: 1.8 },
  { start: '2021-03-01', end: '2022-02-28', percent: 0.7 },
  { start: '2022-03-01', end: '2023-02-28', percent: 2.3 },
  { start: '2023-03-01', end: '2024-02-29', percent: 3.6 },
  { start: '2024-03-01', end: '2025-02-28', percent: 1.7 },
  { start: '2025-03-01', end: '2026-02-28', percent: 1.4 },
  { start: '2026-03-01', end: '2027-02-28', percent: 1.6 },
]

/** Banking cannot reach back before April 1, 1982 (SF Rent Board, "Banked rent increases"). */
export const SF_BANKING_START: IsoDate = '1982-04-01'

/**
 * California Tenant Protection Act (AB 1482, Civil Code §1947.12) cap for the
 * San Francisco–Oakland–Hayward region: 5% plus the April-to-April change in
 * the regional CPI-U, never more than 10%. The CPI figure published each spring
 * applies to increases from August 1 through July 31.
 * CPI source: BLS, Consumer Price Index, San Francisco Area, Table A
 *   https://www.bls.gov/regions/west/news-release/ConsumerPriceIndex_SanFrancisco.htm
 *   April 12-month changes: 2022 5.0, 2023 4.2, 2024 3.8, 2025 1.3, 2026 3.8.
 */
export const AB1482_SF_CPI: { start: IsoDate; end: IsoDate; cpi: number }[] = [
  { start: '2022-08-01', end: '2023-07-31', cpi: 5.0 },
  { start: '2023-08-01', end: '2024-07-31', cpi: 4.2 },
  { start: '2024-08-01', end: '2025-07-31', cpi: 3.8 },
  { start: '2025-08-01', end: '2026-07-31', cpi: 1.3 },
  { start: '2026-08-01', end: '2027-07-31', cpi: 3.8 },
]

export const AB1482_MAX_PERCENT = 10
/** Civil Code §1947.12(o): the statute stays in effect until January 1, 2030. */
export const AB1482_SUNSET: IsoDate = '2030-01-01'

function findPeriod<T extends { start: IsoDate; end: IsoDate }>(
  table: T[],
  date: IsoDate,
): T | null {
  return table.find((p) => compare(p.start, date) <= 0 && compare(date, p.end) <= 0) ?? null
}

/** SF annual allowable percent in effect on `date`, or null if not published / before 1982. */
export function sfAllowablePercent(date: IsoDate): number | null {
  return findPeriod(SF_ANNUAL_ALLOWABLE, date)?.percent ?? null
}

export function sfRatesPublishedThrough(): IsoDate {
  return SF_ANNUAL_ALLOWABLE[SF_ANNUAL_ALLOWABLE.length - 1].end
}

/** AB 1482 cap (percent) for an increase effective on `date`, or null if unknown. */
export function ab1482CapPercent(date: IsoDate): number | null {
  const period = findPeriod(AB1482_SF_CPI, date)
  if (!period) return null
  return Math.min(AB1482_MAX_PERCENT, round1(5 + period.cpi))
}

export function ab1482RatesPublishedThrough(): IsoDate {
  return AB1482_SF_CPI[AB1482_SF_CPI.length - 1].end
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
