# SF Rent Increase Checker

A demo web app that answers three questions about a San Francisco rental unit:

1. **Which rules limit the rent increase?** The SF Rent Ordinance, California's statewide cap (AB 1482), or neither.
2. **What is the legal maximum?** Including SF banked increases, which are easy to get wrong by hand.
3. **When must the notice go out?** 30 or 90 days, plus 5 if mailed, and it drafts the notice.

It also checks Housing Inventory reporting and the rent increase license, flags past increases that look too high, and can check a whole rent roll from a CSV.

> **Demo, not legal advice.** The rules here are simplified, cover only the common cases, and can go out of date. Confirm anything you act on with the [SF Rent Board](https://www.sf.gov/departments/rent-board) or a lawyer.

## Run it

```bash
npm install
npm run dev      # local dev server
npm test         # rule engine unit tests
npm run build    # static site in dist/
```

There is no backend. `dist/` can be served from GitHub Pages, Vercel, Netlify, or any static host. The included `deploy.yml` workflow publishes to GitHub Pages on every push to `main` once Pages is set to "GitHub Actions" in the repo settings.

## How it decides

All rule logic is in [`src/rules`](src/rules), separate from the UI and covered by tests in `src/rules/*.test.ts`.

| File | What it holds |
|---|---|
| `rates.ts` | Every published rate, each with its source. Dates past the last published rate return nothing, so the app refuses to guess. |
| `engine.ts` | Coverage, the SF banking ledger, the AB 1482 cap, notice periods. |
| `notice.ts` | The drafted notice text. |
| `csv.ts` | Rent roll import. |

### Which rules apply

Checked in this order:

1. **Fully exempt:** deed-restricted affordable housing, dorms, and rooms where the tenant shares a kitchen or bath with a resident owner.
2. **SF Rent Ordinance:** buildings first certified for occupancy before June 13, 1979. Exception: single-family homes and condos whose tenancy began on or after January 1, 1996 are exempt from local increase limits under Costa-Hawkins ([Civ. Code §1954.52](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1954.52)).
3. **AB 1482** ([Civ. Code §1947.12](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1947.12)) for everything else, unless:
   - the building was certified within the last 15 years (with only a year to go on, the boundary year is treated as covered, the stricter answer);
   - it's a duplex where the owner lives in the other unit;
   - it's a home or condo owned by an individual (not a REIT, corporation, or LLC with a corporate member) **and** the lease gave the statutory exemption notice;
   - the increase takes effect after the law's January 1, 2030 sunset.

### SF Rent Ordinance maximum

Source: [SF Rent Board, Banked rent increases](https://sf.gov/information/banked-rent-increases) and [Learn about rent increases](https://www.sf.gov/learn-about-rent-increases-san-francisco).

- One increase per 12 months. The date of each increase becomes the new anniversary.
- The annual allowable increase is the rate in effect on the increase's effective date: **1.6% from March 1, 2026 to February 28, 2027** ([Document 577](https://media.api.sf.gov/documents/577_All_Rates_8.26.pdf)). Earlier years back to April 1, 1982 come from Documents 571 and 577.
- Each anniversary passed with no increase banks that anniversary's rate, but only once 24 full months have passed since the last increase. Imposing less than the allowed amount banks the remainder. Nothing banks before April 1, 1982.
- Banked percentages are **added, not compounded**, and applied to the current base rent. The tests reproduce the Rent Board's own worked example (move-in 8/1/2022 at $1,300 → $1,387.10 on 8/1/2025).
- The engine walks the full rent history, so a past increase above what was allowed is flagged (it might be an approved pass-through, which the demo doesn't model) and clears the bank.
- Computed maximums are rounded down to the cent.

### Housing Inventory and license

Since July 1, 2022 (March 1, 2023 for condos and buildings with 1–9 units), owners need a Rent Board license before imposing annual or banked increases, and the license requires up-to-date Housing Inventory reporting ([SF Rent Board](https://sf.gov/news/new-legislation-creates-housing-inventory-and-requires-owners-obtain-license-imposing)). Without both, the checker allows no increase on a rent-controlled unit and shows what the maximum will be once licensed. For other units it warns when reporting is missing.

### AB 1482 maximum

5% plus the April-to-April change in CPI-U for San Francisco–Oakland–Hayward, never more than 10%, applied to the lowest rent charged in the prior 12 months, counting every increase in that window. At most two increases per 12 months. Each spring's CPI applies to increases from August 1 through July 31.

| Increases effective | April CPI | Cap |
|---|---|---|
| Aug 2022 – Jul 2023 | 5.0% | 10.0% |
| Aug 2023 – Jul 2024 | 4.2% | 9.2% |
| Aug 2024 – Jul 2025 | 3.8% | 8.8% |
| Aug 2025 – Jul 2026 | 1.3% | 6.3% |
| Aug 2026 – Jul 2027 | 3.8% | 8.8% |

CPI source: [BLS, Consumer Price Index, San Francisco Area, Table A](https://www.bls.gov/regions/west/news-release/ConsumerPriceIndex_SanFrancisco.htm).

### Notice period

[Civ. Code §827](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=827): 30 days, or 90 days if this increase plus all others in the prior 12 months is more than 10% of the lowest rent charged in that time. Add 5 days when mailed ([CCP §1013](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CCP&sectionNum=1013)). The drafted notice states the dollar amount, percentage and effective date, as the Rent Board requires.

## Not modeled

Capital improvement, utility and operating-expense pass-throughs; Rent Board petitions; increases agreed in a lease; rent reductions and decreased-services claims; Ellis Act, owner move-in and other eviction rules; Section 8 and other subsidized tenancies; the 1992 split-year edge case beyond picking the rate in effect on the date; and other cities.

## Updating rates

Each February the Rent Board publishes the next March–February annual allowable increase, and each May BLS publishes April CPI. Add a row to `SF_ANNUAL_ALLOWABLE` or `AB1482_SF_CPI` in `src/rules/rates.ts`, add a test for it, and run `npm test`.
