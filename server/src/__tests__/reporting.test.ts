import { describe, it, expect } from 'vitest'
import { aggregateBalances, type ReportLineRow } from '../domain/reporting.js'

const accounts = [
  { code: '1020', name: '普通預金', type: 'asset' },
  { code: '3020', name: '利益剰余金', type: 'equity' },
  { code: '4010', name: '売上高', type: 'revenue' },
]

const line = (over: Partial<ReportLineRow>): ReportLineRow => ({
  accountCode: '1020', side: 'debit', amount: 0, date: '2026-06-01', kind: 'normal', ...over,
})

const rowOf = (rows: ReturnType<typeof aggregateBalances>, code: string) => rows.find(r => r.code === code)!

describe('aggregateBalances（期首・期中・期末の集計）', () => {
  it('期間開始前の明細は期首残高に入り、期中には入らない', () => {
    const rows = aggregateBalances(accounts, [
      line({ amount: 100000, date: '2025-12-31' }), // 前期
      line({ amount: 30000,  date: '2026-06-01' }), // 当期
    ], { start: '2026-01-01', end: '2026-12-31' })

    const bank = rowOf(rows, '1020')
    expect(bank.opening).toBe(100000)
    expect(bank.periodDebit).toBe(30000)
    expect(bank.closing).toBe(130000)
  })

  it('期間終了後の明細は集計しない', () => {
    const rows = aggregateBalances(accounts, [
      line({ amount: 50000, date: '2027-01-01' }),
    ], { start: '2026-01-01', end: '2026-12-31' })
    expect(rowOf(rows, '1020').closing).toBe(0)
  })

  it('貸方正常科目（収益）は貸方で増える', () => {
    const rows = aggregateBalances(accounts, [
      line({ accountCode: '4010', side: 'credit', amount: 200000 }),
    ], { start: '2026-01-01', end: '2026-12-31' })
    expect(rowOf(rows, '4010').closing).toBe(200000)
  })

  it('excludeClosing で期中の決算振替仕訳を除外する（PL用）', () => {
    const lines = [
      line({ accountCode: '4010', side: 'credit', amount: 200000 }),
      // 決算振替：売上を借方で打ち消し
      line({ accountCode: '4010', side: 'debit', amount: 200000, date: '2026-12-31', kind: 'closing' }),
    ]
    const withClosing = aggregateBalances(accounts, lines, { start: '2026-01-01', end: '2026-12-31' })
    const withoutClosing = aggregateBalances(accounts, lines, { start: '2026-01-01', end: '2026-12-31', excludeClosing: true })

    expect(rowOf(withClosing, '4010').closing).toBe(0)       // 振替後は0（締め後試算表）
    expect(rowOf(withoutClosing, '4010').closing).toBe(200000) // PLでは売上が見える
  })

  it('前期の決算振替は excludeClosing でも期首に含める（繰越が壊れない）', () => {
    const rows = aggregateBalances(accounts, [
      line({ accountCode: '3020', side: 'credit', amount: 150000, date: '2025-12-31', kind: 'closing' }),
    ], { start: '2026-01-01', end: '2026-12-31', excludeClosing: true })
    expect(rowOf(rows, '3020').opening).toBe(150000)
  })

  it('期間未指定なら全件が期中扱い', () => {
    const rows = aggregateBalances(accounts, [
      line({ amount: 10000, date: '2020-01-01' }),
      line({ amount: 20000, date: '2030-01-01' }),
    ])
    const bank = rowOf(rows, '1020')
    expect(bank.opening).toBe(0)
    expect(bank.closing).toBe(30000)
  })
})
