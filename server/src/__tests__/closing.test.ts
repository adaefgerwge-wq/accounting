import { describe, it, expect } from 'vitest'
import { buildProfitTransferLines, type PlBalance } from '../domain/closing.js'

const RE = '3020'

function balances(entries: [string, PlBalance][]): Map<string, PlBalance> {
  return new Map(entries)
}

function debitTotal(lines: { side: string; amount: number }[]) {
  return lines.filter(l => l.side === 'debit').reduce((s, l) => s + l.amount, 0)
}
function creditTotal(lines: { side: string; amount: number }[]) {
  return lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
}

describe('buildProfitTransferLines（損益振替）', () => {
  it('黒字：収益は借方・費用は貸方で打ち消し、差額を利益剰余金の貸方へ', () => {
    const { lines, net } = buildProfitTransferLines(balances([
      ['4010', { type: 'revenue', balance: 700000 }],
      ['5010', { type: 'expense', balance: 300000 }],
      ['5020', { type: 'expense', balance: 200000 }],
    ]), RE)

    expect(net).toBe(200000)
    expect(lines).toContainEqual({ side: 'debit',  accountCode: '4010', amount: 700000 })
    expect(lines).toContainEqual({ side: 'credit', accountCode: '5010', amount: 300000 })
    expect(lines).toContainEqual({ side: 'credit', accountCode: RE, amount: 200000 })
    expect(debitTotal(lines)).toBe(creditTotal(lines)) // 仕訳として貸借一致
  })

  it('赤字：利益剰余金は借方', () => {
    const { lines, net } = buildProfitTransferLines(balances([
      ['4010', { type: 'revenue', balance: 100000 }],
      ['5010', { type: 'expense', balance: 250000 }],
    ]), RE)

    expect(net).toBe(-150000)
    expect(lines).toContainEqual({ side: 'debit', accountCode: RE, amount: 150000 })
    expect(debitTotal(lines)).toBe(creditTotal(lines))
  })

  it('損益がなければ空（振替仕訳を作らない）', () => {
    const { lines, net } = buildProfitTransferLines(balances([
      ['4010', { type: 'revenue', balance: 0 }],
    ]), RE)
    expect(lines).toEqual([])
    expect(net).toBe(0)
  })

  it('逆残の科目（マイナス残高）は反対側に立てて打ち消す', () => {
    // 売上値引きで収益がマイナス残になったケース
    const { lines, net } = buildProfitTransferLines(balances([
      ['4010', { type: 'revenue', balance: -50000 }],
    ]), RE)
    expect(lines).toContainEqual({ side: 'credit', accountCode: '4010', amount: 50000 })
    expect(net).toBe(-50000)
    expect(debitTotal(lines)).toBe(creditTotal(lines))
  })
})
