import { describe, expect, it } from 'vitest'
import { parseCsv, parseRentRoll } from './csv'

describe('csv', () => {
  it('parses quoted fields and CRLF', () => {
    expect(parseCsv('a,"b, c","d ""q"""\r\n1,2,3\r\n')).toEqual([
      ['a', 'b, c', 'd "q"'],
      ['1', '2', '3'],
    ])
  })

  it('reads a rent roll row into a unit', () => {
    const text = [
      'unit,year_built,building_type,corporate_owner,ab1482_exemption_notice,move_in_date,initial_rent,past_increases,housing_inventory_reported,rent_increase_license',
      '"101",1925,multi_unit,no,no,2022-08-01,"$1,300",2023-08-01:1346.80;2024-08-01:1369.70,yes,yes',
    ].join('\n')
    const [row] = parseRentRoll(text)
    expect(row.error).toBeUndefined()
    expect(row.unit?.initialRent).toBe(1300)
    expect(row.unit?.pastIncreases).toEqual([
      { date: '2023-08-01', newRent: 1346.8 },
      { date: '2024-08-01', newRent: 1369.7 },
    ])
    expect(row.unit?.rentIncreaseLicense).toBe(true)
  })

  it('reports missing columns and unknown building types', () => {
    expect(parseRentRoll('unit,year_built\n1,1920')[0].error).toMatch(/Missing columns/)
    const bad = parseRentRoll(
      'unit,year_built,building_type,corporate_owner,ab1482_exemption_notice,move_in_date,initial_rent,past_increases,housing_inventory_reported,rent_increase_license\n1,1920,castle,no,no,2020-01-01,1000,,yes,yes',
    )
    expect(bad[0].error).toMatch(/Unknown building_type/)
  })
})
