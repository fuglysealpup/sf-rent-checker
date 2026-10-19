// Example data so the app opens in a working state. Made-up units, not real tenants.

import type { UnitInput } from './rules/engine'

export const SAMPLE_UNIT: UnitInput = {
  label: 'Unit 3, 1450 Guerrero St (example)',
  certificateYear: 1925,
  buildingType: 'multi_unit',
  ownedByCorporation: false,
  ab1482ExemptionNoticeGiven: false,
  moveInDate: '2021-11-01',
  initialRent: 2850,
  pastIncreases: [{ date: '2022-11-01', newRent: 2915.55 }],
  housingInventoryReported: true,
  rentIncreaseLicense: true,
}

export const SAMPLE_EFFECTIVE_DATE = '2026-12-01'

export const SAMPLE_ROLL = `unit,year_built,built_before_june_13_1979,building_type,corporate_owner,ab1482_exemption_notice,move_in_date,initial_rent,past_increases,housing_inventory_reported,rent_increase_license
Guerrero #1,1925,,multi_unit,no,no,2018-06-01,2400,2019-06-01:2462.40;2020-06-01:2506.72;2021-06-01:2524.27;2022-06-01:2582.33;2023-06-01:2675.29;2024-06-01:2720.77;2025-06-01:2758.86;2026-06-01:2803.00,yes,yes
Guerrero #2,1925,,multi_unit,no,no,2021-11-01,2850,2022-11-01:2915.55,yes,yes
Guerrero #3,1925,,multi_unit,no,no,2009-03-15,1650,2015-03-15:1750,yes,yes
Guerrero #4,1925,,multi_unit,no,no,2023-09-01,3100,2024-09-01:3250,yes,yes
Valencia #12,1979,no,multi_unit,yes,no,2019-04-01,3400,2025-08-01:3614.20,yes,no
Noe Valley house,1938,,single_family,no,yes,2016-02-01,5200,2025-02-01:5600,yes,no
Mission Bay #508,2012,,condo,yes,no,2024-07-01,4100,2025-07-01:4350,no,no
Sunset flat,1952,,multi_unit,no,no,2024-01-15,2600,,no,no
`
