import { useState, useMemo } from 'react'
import { useApp } from '../store'
import type { AccountType } from '../types'

const TYPE_LABELS: Record<AccountType, string> = { asset:'資産', liability:'負債', equity:'純資産', revenue:'収益', expense:'費用' }

// 正常残高側を正とする符号
function balanceSign(type: AccountType | undefined, side: 'debit' | 'credit'): 1 | -1 {
  const debitNormal = type === 'asset' || type === 'expense'
  return (side === 'debit') === debitNormal ? 1 : -1
}

export default function LedgerPage() {
  const { accounts, partners, subAccounts, journals, fiscalYears, currentFiscalYearId } = useApp()
  const [accountCode, setAccountCode] = useState('')
  const [subCode, setSubCode]         = useState('')

  const account = accounts.find(a => a.code === accountCode)
  const fy = fiscalYears.find(f => f.id === currentFiscalYearId)

  // 選択科目に紐づく補助科目候補（取引先＋汎用補助科目）
  const subOptions = useMemo(() => {
    if (!account?.hasSub) return []
    return [
      ...partners.filter(p => p.accountCode === accountCode).map(p => ({ code: p.code, name: p.name, kind: '取引先' })),
      ...subAccounts.filter(s => s.accountCode === accountCode).map(s => ({ code: s.code, name: s.name, kind: '補助' })),
    ]
  }, [account, accountCode, partners, subAccounts])

  const accountName = (code: string) => accounts.find(a => a.code === code)?.name ?? code

  // 元帳明細を構築
  const { openingBalance, rows, periodDebit, periodCredit, closingBalance } = useMemo(() => {
    if (!accountCode) return { openingBalance: 0, rows: [], periodDebit: 0, periodCredit: 0, closingBalance: 0 }

    const matches = (partnerCode: string) => subCode ? partnerCode === subCode : true

    // 該当科目(＋補助)を含む明細を、所属仕訳とともに収集
    type Entry = { date: string; journalId: number; memo: string; side: 'debit'|'credit'; amount: number; counter: string }
    const entries: Entry[] = []
    for (const j of journals) {
      for (const l of j.lines) {
        if (l.accountCode !== accountCode || !matches(l.partnerCode)) continue
        // 相手科目：反対側の明細
        const opp = j.lines.filter(x => x.side !== l.side)
        const counter = opp.length === 0 ? '' : opp.length === 1 ? accountName(opp[0].accountCode) : '諸口'
        entries.push({ date: j.date, journalId: j.id, memo: j.memo, side: l.side, amount: l.amount, counter })
      }
    }
    // 日付→仕訳IDで安定ソート
    entries.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.journalId - b.journalId)

    const start = fy?.startDate ?? ''
    const end   = fy?.endDate   ?? ''
    const type  = account?.type

    // 期首繰越：期間開始前の符号付き累計
    let opening = 0
    const periodEntries: Entry[] = []
    for (const e of entries) {
      if (start && e.date < start) { opening += e.amount * balanceSign(type, e.side); continue }
      if (end && e.date > end) continue
      periodEntries.push(e)
    }

    // 期中：残高を走らせる
    let running = opening
    let pd = 0, pc = 0
    const built = periodEntries.map(e => {
      running += e.amount * balanceSign(type, e.side)
      if (e.side === 'debit') pd += e.amount; else pc += e.amount
      return { ...e, balance: running, debit: e.side === 'debit' ? e.amount : 0, credit: e.side === 'credit' ? e.amount : 0 }
    })

    return { openingBalance: opening, rows: built, periodDebit: pd, periodCredit: pc, closingBalance: running }
  }, [accountCode, subCode, journals, account, fy])

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="toolbar">
        <h2><i className="ti ti-book-2" />総勘定元帳・補助元帳</h2>
        <select value={accountCode} onChange={e => { setAccountCode(e.target.value); setSubCode('') }} style={{ fontSize: 13 }}>
          <option value="">勘定科目を選択</option>
          {(['asset','liability','equity','revenue','expense'] as AccountType[]).map(type => {
            const group = accounts.filter(a => a.type === type)
            if (!group.length) return null
            return (
              <optgroup key={type} label={`── ${TYPE_LABELS[type]}`}>
                {group.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
              </optgroup>
            )
          })}
        </select>
        {account?.hasSub && subOptions.length > 0 && (
          <select value={subCode} onChange={e => setSubCode(e.target.value)} style={{ fontSize: 13 }}>
            <option value="">補助科目: すべて</option>
            {subOptions.map(s => <option key={s.code} value={s.code}>{s.kind}: {s.name}</option>)}
          </select>
        )}
        {fy && <span style={{ fontSize: 12, color: '#888' }}>{fy.name}（{fy.startDate} 〜 {fy.endDate}）</span>}
      </div>

      <div className="content" style={{ overflow: 'auto' }}>
        {!accountCode ? (
          <div className="empty-state"><i className="ti ti-book" />勘定科目を選択してください</div>
        ) : (
          <table style={{ minWidth: 760, whiteSpace: 'nowrap' }}>
            <thead>
              <tr>
                <th style={{ width: 100 }}>日付</th>
                <th>相手科目</th>
                <th>摘要</th>
                <th style={{ textAlign: 'right', width: 110 }}>借方</th>
                <th style={{ textAlign: 'right', width: 110 }}>貸方</th>
                <th style={{ textAlign: 'right', width: 120 }}>残高</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: '#faf8f3' }}>
                <td colSpan={5} style={{ color: '#888' }}>前期繰越</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{openingBalance.toLocaleString()}</td>
              </tr>
              {rows.length === 0 ? (
                <tr><td colSpan={6}><div className="empty-state" style={{ padding: 24 }}><i className="ti ti-notes-off" />この期間に取引がありません</div></td></tr>
              ) : rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ color: '#888' }}>{r.date}</td>
                  <td>{r.counter ? <span className="sub-tag">{r.counter}</span> : <span style={{ color: '#ccc' }}>—</span>}</td>
                  <td style={{ color: '#555', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.memo}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.debit ? r.debit.toLocaleString() : ''}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.credit ? r.credit.toLocaleString() : ''}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.balance.toLocaleString()}</td>
                </tr>
              ))}
              <tr style={{ background: '#f5f3ee', fontWeight: 600 }}>
                <td colSpan={3}>期間計</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{periodDebit.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{periodCredit.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{closingBalance.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
