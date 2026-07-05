import { describe, it, expect } from 'vitest'
import { calcTax, planTax } from '../tax.js'

describe('calcTax（内税の逆算・切り捨て）', () => {
  it('税込11,000円の10%は消費税1,000円', () => {
    expect(calcTax(11000, 'taxable10')).toEqual({ baseAmount: 10000, taxAmount: 1000 })
  })

  it('浮動小数点誤差で1円ずれない（税込1,100円 → 100円）', () => {
    // 1100 * 0.1 / 1.1 = 99.99999... になるため補正が必要なケース
    expect(calcTax(1100, 'taxable10').taxAmount).toBe(100)
  })

  it('軽減税率8%（税込108円 → 8円）', () => {
    expect(calcTax(108, 'taxable8')).toEqual({ baseAmount: 100, taxAmount: 8 })
  })

  it('割り切れない金額は切り捨て（税込101円 → 9円）', () => {
    expect(calcTax(101, 'taxable10')).toEqual({ baseAmount: 92, taxAmount: 9 })
  })

  it('対象外・非課税・不課税は税額0', () => {
    for (const t of ['none', 'exempt', 'non_taxable'] as const) {
      expect(calcTax(10000, t).taxAmount).toBe(0)
    }
  })
})

describe('planTax（税抜経理の消費税仕訳判定）', () => {
  it('売上（収益が貸方）→ 仮受消費税', () => {
    const plan = planTax('1020', '4010', 'asset', 'revenue', 'taxable10', 110000)
    expect(plan).not.toBeNull()
    expect(plan!.kind).toBe('sales')
    expect(plan!.taxCode).toBe('2050')
    expect(plan!.taxAmount).toBe(10000)
  })

  it('仕入・経費（費用が借方）→ 仮払消費税', () => {
    const plan = planTax('5010', '2010', 'expense', 'liability', 'taxable10', 33000)
    expect(plan!.kind).toBe('purchase')
    expect(plan!.taxCode).toBe('1150')
    expect(plan!.taxAmount).toBe(3000)
  })

  it('課税資産の取得（資産が借方）→ 仮払消費税', () => {
    const plan = planTax('1500', '1020', 'asset', 'asset', 'taxable10', 220000)
    expect(plan!.kind).toBe('purchase')
    expect(plan!.taxAmount).toBe(20000)
  })

  it('対象外の組み合わせは null', () => {
    expect(planTax('2010', '1020', 'liability', 'asset', 'taxable10', 10000)).toBeNull()
    expect(planTax('5010', '2010', 'expense', 'liability', 'none', 10000)).toBeNull()
  })
})
