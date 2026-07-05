import { describe, it, expect } from 'vitest'
import { summarizeTax, type TaxSummaryLine } from '../domain/tax-summary.js'

let seq = 1
const line = (over: Partial<TaxSummaryLine>): TaxSummaryLine => ({
  journalId: 1, lineId: seq++, side: 'credit',
  accountCode: '4010', accountType: 'revenue', amount: 0, taxType: 'taxable10', ...over,
})

describe('summarizeTax（税区分別集計）', () => {
  it('税込経理：税込金額から税抜・税額に分解して集計', () => {
    const rows = summarizeTax([
      line({ amount: 110000 }),                          // 課税売上10%
      line({ amount: 108000, taxType: 'taxable8' }),     // 軽減8%
      line({ side: 'debit', accountCode: '5010', accountType: 'expense', amount: 33000 }), // 課税仕入
    ], 'inclusive')

    expect(rows).toContainEqual({ category: 'sales', taxType: 'taxable10', base: 100000, tax: 10000, gross: 110000 })
    expect(rows).toContainEqual({ category: 'sales', taxType: 'taxable8',  base: 100000, tax: 8000,  gross: 108000 })
    expect(rows).toContainEqual({ category: 'purchase', taxType: 'taxable10', base: 30000, tax: 3000, gross: 33000 })
  })

  it('税抜経理：直後の消費税行をペアリングして税額を得る', () => {
    const rows = summarizeTax([
      line({ journalId: 5, lineId: 1, amount: 100000 }),                               // 税抜の売上
      line({ journalId: 5, lineId: 2, accountCode: '2050', accountType: 'liability', amount: 10000, taxType: 'none' }), // 仮受消費税
    ], 'exclusive')

    expect(rows).toEqual([{ category: 'sales', taxType: 'taxable10', base: 100000, tax: 10000, gross: 110000 }])
  })

  it('借方の収益（値引き・返品）はマイナスとして集計', () => {
    const rows = summarizeTax([
      line({ amount: 110000 }),
      line({ side: 'debit', amount: 11000 }), // 売上値引き
    ], 'inclusive')
    expect(rows).toEqual([{ category: 'sales', taxType: 'taxable10', base: 90000, tax: 9000, gross: 99000 }])
  })

  it('taxType=none の行と負債・純資産科目は集計対象外', () => {
    const rows = summarizeTax([
      line({ taxType: 'none', amount: 50000 }),
      line({ accountCode: '2010', accountType: 'liability', amount: 33000 }),
    ], 'inclusive')
    expect(rows).toEqual([])
  })
})
