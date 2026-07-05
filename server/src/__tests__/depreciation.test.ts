import { describe, it, expect } from 'vitest'
import { depreciationForPeriod, bookValueAt, accumulatedDepreciation, serviceMonthsThrough } from '../domain/depreciation.js'

// 取得価額48万円・耐用年数4年（48ヶ月）→ 月1万円
const pc = { acquisitionDate: '2026-01-15', cost: 480000, usefulLifeYears: 4 }

describe('depreciationForPeriod（定額法・月割）', () => {
  it('期首月に取得：初年度は12ヶ月分', () => {
    expect(depreciationForPeriod(pc, '2026-01-01', '2026-12-31')).toBe(120000)
  })

  it('期中取得は月割（7月取得 → 6ヶ月分）', () => {
    const a = { ...pc, acquisitionDate: '2026-07-10' }
    expect(depreciationForPeriod(a, '2026-01-01', '2026-12-31')).toBe(60000)
  })

  it('2年目は満額', () => {
    const a = { ...pc, acquisitionDate: '2026-07-10' }
    expect(depreciationForPeriod(a, '2027-01-01', '2027-12-31')).toBe(120000)
  })

  it('最終年は備忘価額1円を残す', () => {
    const a = { acquisitionDate: '2022-01-01', cost: 480000, usefulLifeYears: 4 }
    expect(depreciationForPeriod(a, '2025-01-01', '2025-12-31')).toBe(119999)
    expect(bookValueAt(a, '2025-12-31')).toBe(1)
  })

  it('償却終了後は0', () => {
    const a = { acquisitionDate: '2020-01-01', cost: 480000, usefulLifeYears: 4 }
    expect(depreciationForPeriod(a, '2026-01-01', '2026-12-31')).toBe(0)
    expect(bookValueAt(a, '2026-12-31')).toBe(1)
  })

  it('取得前の年度は0', () => {
    expect(depreciationForPeriod(pc, '2025-01-01', '2025-12-31')).toBe(0)
  })

  it('全期間の償却額合計が取得価額−1円に一致する（切り捨て誤差が累積しない）', () => {
    // 割り切れない金額：100万円・6年（72ヶ月）→ 月13,888.88…円
    const a = { acquisitionDate: '2026-04-01', cost: 1000000, usefulLifeYears: 6 }
    let total = 0
    for (let y = 2026; y <= 2033; y++) {
      total += depreciationForPeriod(a, `${y}-01-01`, `${y}-12-31`)
    }
    expect(total).toBe(999999)
  })
})

describe('accumulatedDepreciation / serviceMonthsThrough', () => {
  it('供用月数は取得月を含む', () => {
    expect(serviceMonthsThrough(pc, '2026-01-31')).toBe(1)
    expect(serviceMonthsThrough(pc, '2026-12-31')).toBe(12)
  })

  it('耐用月数を超えない', () => {
    expect(serviceMonthsThrough(pc, '2099-12-31')).toBe(48)
  })

  it('累計は取得価額−1円で頭打ち', () => {
    expect(accumulatedDepreciation(pc, 48)).toBe(479999)
    expect(accumulatedDepreciation(pc, 100)).toBe(479999)
  })
})
