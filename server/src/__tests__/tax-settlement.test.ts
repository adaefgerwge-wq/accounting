import { describe, it, expect } from 'vitest'
import { buildTaxSettlementLines } from '../domain/tax-settlement.js'

const CODES = { paid: '1150', received: '2050', payable: '2060', receivable: '1160' }

function assertBalanced(lines: { side: string; amount: number }[]) {
  const d = lines.filter(l => l.side === 'debit').reduce((s, l) => s + l.amount, 0)
  const c = lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
  expect(d).toBe(c)
}

describe('buildTaxSettlementLines（消費税の決算整理）', () => {
  it('仮受 > 仮払：差額を未払消費税（貸方）に計上', () => {
    const lines = buildTaxSettlementLines(5000, 8000, CODES)
    expect(lines).toContainEqual({ side: 'debit',  accountCode: '2050', amount: 8000 })
    expect(lines).toContainEqual({ side: 'credit', accountCode: '1150', amount: 5000 })
    expect(lines).toContainEqual({ side: 'credit', accountCode: '2060', amount: 3000 })
    assertBalanced(lines)
  })

  it('仮払 > 仮受：差額を未収還付消費税（借方）に計上', () => {
    const lines = buildTaxSettlementLines(8000, 5000, CODES)
    expect(lines).toContainEqual({ side: 'debit',  accountCode: '2050', amount: 5000 })
    expect(lines).toContainEqual({ side: 'credit', accountCode: '1150', amount: 8000 })
    expect(lines).toContainEqual({ side: 'debit',  accountCode: '1160', amount: 3000 })
    assertBalanced(lines)
  })

  it('両方0なら仕訳不要', () => {
    expect(buildTaxSettlementLines(0, 0, CODES)).toEqual([])
  })

  it('仮受のみ：全額を未払消費税へ', () => {
    const lines = buildTaxSettlementLines(0, 10000, CODES)
    expect(lines).toEqual([
      { side: 'debit',  accountCode: '2050', amount: 10000 },
      { side: 'credit', accountCode: '2060', amount: 10000 },
    ])
  })

  it('ちょうど同額なら相殺のみで差額なし', () => {
    const lines = buildTaxSettlementLines(7000, 7000, CODES)
    expect(lines).toHaveLength(2)
    expect(lines.some(l => l.accountCode === '2060' || l.accountCode === '1160')).toBe(false)
    assertBalanced(lines)
  })

  it('逆残（マイナス残高）でも貸借が一致する', () => {
    const lines = buildTaxSettlementLines(-1000, 5000, CODES)
    assertBalanced(lines)
  })
})
