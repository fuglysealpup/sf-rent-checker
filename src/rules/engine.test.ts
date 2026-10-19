import { describe, expect, it } from 'vitest'
import {
  buildSfLedger,
  determineCoverage,
  evaluate,
  floorCents,
  lowestRentPrior12Months,
  noticeRequirement,
  type UnitInput,
} from './engine'
import { ab1482CapPercent, sfAllowablePercent } from './rates'
import { addYears } from './dates'

const base: UnitInput = {
  certificateYear: 1925,
  buildingType: 'multi_unit',
  ownedByCorporation: false,
  ab1482ExemptionNoticeGiven: false,
  moveInDate: '2022-08-01',
  initialRent: 1300,
  pastIncreases: [],
  housingInventoryReported: true,
  rentIncreaseLicense: true,
}

const unit = (over: Partial<UnitInput>): UnitInput => ({ ...base, ...over })

describe('rates', () => {
  it('uses the published SF annual allowable increase for each period', () => {
    expect(sfAllowablePercent('2026-03-01')).toBe(1.6)
    expect(sfAllowablePercent('2027-02-28')).toBe(1.6)
    expect(sfAllowablePercent('2026-02-28')).toBe(1.4)
    expect(sfAllowablePercent('2023-08-01')).toBe(3.6)
    expect(sfAllowablePercent('1992-12-07')).toBe(4.0)
    expect(sfAllowablePercent('1992-12-08')).toBe(1.6)
  })

  it('refuses to guess rates that are not published', () => {
    expect(sfAllowablePercent('2027-03-01')).toBeNull()
    expect(sfAllowablePercent('1982-03-31')).toBeNull()
    expect(ab1482CapPercent('2027-08-01')).toBeNull()
  })

  it('computes AB 1482 caps as 5% plus April CPI, max 10%', () => {
    expect(ab1482CapPercent('2026-08-01')).toBe(8.8)
    expect(ab1482CapPercent('2026-07-31')).toBe(6.3)
    expect(ab1482CapPercent('2022-08-01')).toBe(10)
    expect(ab1482CapPercent('2023-10-01')).toBe(9.2)
  })
})

describe('coverage', () => {
  const on = '2026-10-01'
  it('puts pre-June 13, 1979 apartments under SF rent control', () => {
    expect(determineCoverage(base, on).regime).toBe('sf_rent_ordinance')
    expect(determineCoverage(unit({ certificateYear: 1979, certificateBeforeJune13_1979: true }), on).regime).toBe(
      'sf_rent_ordinance',
    )
  })

  it('puts post-1979 buildings older than 15 years under AB 1482', () => {
    expect(determineCoverage(unit({ certificateYear: 1979, certificateBeforeJune13_1979: false }), on).regime).toBe('ab1482')
    expect(determineCoverage(unit({ certificateYear: 2005 }), on).regime).toBe('ab1482')
  })

  it('exempts buildings certified in the last 15 years, treating the boundary year as covered', () => {
    expect(determineCoverage(unit({ certificateYear: 2015 }), on).regime).toBe('exempt')
    expect(determineCoverage(unit({ certificateYear: 2011 }), on).regime).toBe('ab1482')
    expect(determineCoverage(unit({ certificateYear: 2012 }), on).regime).toBe('exempt')
  })

  it('applies Costa-Hawkins to pre-1979 homes and condos rented since 1996', () => {
    const home = unit({ buildingType: 'single_family', moveInDate: '2015-01-01' })
    expect(determineCoverage(home, on).regime).toBe('ab1482')
    expect(determineCoverage({ ...home, ab1482ExemptionNoticeGiven: true }, on).regime).toBe('exempt')
    expect(
      determineCoverage({ ...home, ab1482ExemptionNoticeGiven: true, ownedByCorporation: true }, on).regime,
    ).toBe('ab1482')
    expect(determineCoverage({ ...home, moveInDate: '1995-06-01' }, on).regime).toBe('sf_rent_ordinance')
  })

  it('exempts owner-occupied duplexes from AB 1482 but not from SF rent control', () => {
    expect(determineCoverage(unit({ buildingType: 'owner_occupied_duplex', certificateYear: 1990 }), on).regime).toBe('exempt')
    expect(determineCoverage(unit({ buildingType: 'owner_occupied_duplex' }), on).regime).toBe('sf_rent_ordinance')
  })

  it('fully exempts deed-restricted, dorm and shared-with-owner housing', () => {
    for (const t of ['deed_restricted', 'dorm', 'shared_with_owner'] as const) {
      expect(determineCoverage(unit({ buildingType: t }), on).regime).toBe('exempt')
    }
  })

  it('stops applying AB 1482 after its 2030 sunset', () => {
    expect(determineCoverage(unit({ certificateYear: 2000 }), '2030-01-01').regime).toBe('exempt')
  })
})

describe('SF banking', () => {
  it("reproduces the Rent Board's published banking example", () => {
    // sf.gov/information/banked-rent-increases: move-in 8/1/2022 at $1,300,
    // skipped 3.6% and 1.7%, plus 1.4% current = 6.7% → $1,387.10.
    const ev = evaluate(base, { effectiveDate: '2025-08-01', serviceMethod: 'personal' })
    expect(ev.regime).toBe('sf_rent_ordinance')
    expect(ev.maxPercent).toBeCloseTo(6.7, 6)
    expect(ev.maxRent).toBe(1387.1)
    expect(ev.bankedYears.map((b) => [b.anniversary, b.percent])).toEqual([
      ['2023-08-01', 3.6],
      ['2024-08-01', 1.7],
    ])
  })

  it('does not bank a year until 24 months have passed', () => {
    // 18 months after move-in: only the current rate, nothing banked.
    const ev = evaluate(base, { effectiveDate: '2024-02-01', serviceMethod: 'personal' })
    expect(ev.bankedYears).toEqual([])
    expect(ev.maxPercent).toBe(3.6)
  })

  it('banks the unused part of a partial increase', () => {
    const u = unit({ pastIncreases: [{ date: '2023-08-01', newRent: 1313 }] }) // 1% of 3.6%
    const ledger = buildSfLedger(u)
    expect(ledger.bank).toHaveLength(1)
    expect(ledger.bank[0].percent).toBeCloseTo(2.6, 6)
    const ev = evaluate(u, { effectiveDate: '2024-08-01', serviceMethod: 'personal' })
    expect(ev.maxPercent).toBeCloseTo(1.7 + 2.6, 6)
    expect(ev.maxRent).toBe(floorCents(1313 * 1.043))
  })

  it('consumes banked increases when they are used', () => {
    const u = unit({ pastIncreases: [{ date: '2025-08-01', newRent: 1387.1 }] })
    expect(buildSfLedger(u).bank).toEqual([])
    const ev = evaluate(u, { effectiveDate: '2026-08-01', serviceMethod: 'personal' })
    expect(ev.maxPercent).toBe(1.6)
    expect(ev.maxRent).toBe(floorCents(1387.1 * 1.016))
  })

  it('uses only part of the bank when only part is imposed', () => {
    // Allowed 6.7% on 8/1/2025, imposed 4.4% = 1.4% current + 3.0% from the bank.
    const u = unit({ pastIncreases: [{ date: '2025-08-01', newRent: 1357.2 }] })
    const remaining = buildSfLedger(u).bank.reduce((s, b) => s + b.percent, 0)
    expect(remaining).toBeCloseTo(2.3, 6)
  })

  it('flags past increases above the allowed amount and clears the bank', () => {
    const u = unit({ pastIncreases: [{ date: '2023-08-01', newRent: 1400 }] })
    const ledger = buildSfLedger(u)
    expect(ledger.issues.some((i) => i.severity === 'warning')).toBe(true)
    expect(ledger.bank).toEqual([])
  })

  it('flags two increases within 12 months', () => {
    const u = unit({
      pastIncreases: [
        { date: '2023-08-01', newRent: 1340 },
        { date: '2024-03-01', newRent: 1350 },
      ],
    })
    expect(buildSfLedger(u).issues.some((i) => i.severity === 'error')).toBe(true)
  })

  it('does not bank anniversaries before April 1, 1982', () => {
    const u = unit({ moveInDate: '1980-06-01', initialRent: 300 })
    const ev = evaluate(u, { effectiveDate: '1984-06-01', serviceMethod: 'personal' })
    // Skipped 1981 (before banking began), 1982 (7%) and 1983 (7%), plus 4% current.
    expect(ev.bankedYears.map((b) => b.anniversary)).toEqual(['1982-06-01', '1983-06-01'])
    expect(ev.maxPercent).toBe(18)
  })

  it('maps a Feb 29 anniversary to Feb 28', () => {
    expect(addYears('2024-02-29', 1)).toBe('2025-02-28')
  })
})

describe('SF increase checks', () => {
  it('blocks increases before 12 months have passed', () => {
    const u = unit({ pastIncreases: [{ date: '2026-03-01', newRent: 1320 }] })
    const ev = evaluate(u, { effectiveDate: '2026-12-01', serviceMethod: 'personal' })
    expect(ev.status).toBe('too_early')
    expect(ev.earliestEffectiveDate).toBe('2027-03-01')
  })

  it('refuses to compute when the annual rate is not published yet', () => {
    const ev = evaluate(unit({ moveInDate: '2026-04-01' }), { effectiveDate: '2027-04-01', serviceMethod: 'personal' })
    expect(ev.status).toBe('rate_unavailable')
    expect(ev.maxRent).toBeNull()
  })

  it('blocks any increase without a Housing Inventory report and license', () => {
    const u = unit({ rentIncreaseLicense: false })
    const ev = evaluate(u, { effectiveDate: '2025-08-01', serviceMethod: 'personal' })
    expect(ev.status).toBe('blocked')
    expect(ev.maxRent).toBe(1300)
    expect(ev.maxRentIfLicensed).toBe(1387.1)
  })

  it('flags a proposed rent over the maximum', () => {
    const ev = evaluate(base, { effectiveDate: '2025-08-01', newRent: 1400, serviceMethod: 'personal' })
    expect(ev.status).toBe('over_limit')
  })

  it('accepts a proposed rent at the maximum', () => {
    const ev = evaluate(base, { effectiveDate: '2025-08-01', newRent: 1387.1, serviceMethod: 'personal' })
    expect(ev.status).toBe('ok')
  })
})

describe('AB 1482 checks', () => {
  const post79 = unit({ certificateYear: 1990, moveInDate: '2020-01-01', initialRent: 3000 })

  it('caps the increase at 8.8% of the lowest rent in the past 12 months', () => {
    const ev = evaluate(post79, { effectiveDate: '2026-09-01', serviceMethod: 'personal' })
    expect(ev.regime).toBe('ab1482')
    expect(ev.maxPercent).toBe(8.8)
    expect(ev.maxRent).toBe(3264)
  })

  it('counts earlier increases in the same 12 months against the cap', () => {
    const u = { ...post79, pastIncreases: [{ date: '2026-03-01', newRent: 3100 }] }
    expect(lowestRentPrior12Months(u, '2026-09-01')).toBe(3000)
    const ev = evaluate(u, { effectiveDate: '2026-09-01', serviceMethod: 'personal' })
    expect(ev.maxRent).toBe(3264)
  })

  it('allows at most two increases in 12 months', () => {
    const u = {
      ...post79,
      pastIncreases: [
        { date: '2026-01-01', newRent: 3050 },
        { date: '2026-05-01', newRent: 3100 },
      ],
    }
    const ev = evaluate(u, { effectiveDate: '2026-09-01', serviceMethod: 'personal' })
    expect(ev.status).toBe('too_early')
  })

  it('uses the cap in effect on the effective date', () => {
    const ev = evaluate(post79, { effectiveDate: '2026-07-15', serviceMethod: 'personal' })
    expect(ev.maxPercent).toBe(6.3)
    expect(ev.maxRent).toBe(3189)
  })
})

describe('notice periods', () => {
  it('requires 30 days for increases of 10% or less, plus 5 when mailed', () => {
    const n = noticeRequirement(base, '2025-08-01', 1387.1, 'personal')
    expect(n.days).toBe(30)
    expect(n.serveBy).toBe('2025-07-02')
    const mailed = noticeRequirement(base, '2025-08-01', 1387.1, 'mail')
    expect(mailed.days).toBe(35)
    expect(mailed.serveBy).toBe('2025-06-27')
  })

  it('requires 90 days when 12-month increases exceed 10%', () => {
    const n = noticeRequirement(base, '2025-08-01', 1440, 'personal')
    expect(n.baseDays).toBe(90)
    expect(n.serveBy).toBe('2025-05-03')
  })

  it('treats exactly 10% as 30 days', () => {
    expect(noticeRequirement(base, '2025-08-01', 1430, 'personal').baseDays).toBe(30)
  })

  it('flags a service date that is too late', () => {
    const ev = evaluate(base, {
      effectiveDate: '2025-08-01',
      serviceMethod: 'mail',
      serviceDate: '2025-07-01',
    })
    expect(ev.notice.late).toBe(true)
    expect(ev.notice.earliestEffectiveForService).toBe('2025-08-05')
  })
})
