import { useState, useEffect, useMemo } from 'react'
import { useApp } from '../store'
import { api } from '../api'
import type { AccountType, BalanceReport, BalanceReportRow } from '../types'

// 正常残高側を正とする符号（資産・費用は借方が＋、それ以外は貸方が＋）
function balanceSign(type: AccountType, side: 'debit' | 'credit'): 1 | -1 {
  const debitNormal = type === 'asset' || type === 'expense'
  return (side === 'debit') === debitNormal ? 1 : -1
}

interface SubItem { code: string; name: string; accountCode: string }

function Section({ title, items, total, subBalance }: {
  title: string
  items: (BalanceReportRow & { subs: SubItem[] })[]
  total: number
  subBalance: (accountCode: string, subCode: string, type: AccountType) => number
}) {
  return (
    <div className="section-card">
      <div className="section-header">
        <span>{title}</span>
        <span>{total.toLocaleString()} 円</span>
      </div>
      {items.map(a => (
        <div key={a.code}>
          <div className="fs-row">
            <span>{a.name}</span>
            <span>{a.closing.toLocaleString()}</span>
          </div>
          {a.subs.map(p => {
            const bal = subBalance(a.code, p.code, a.type)
            return (
              <div key={p.code} className="fs-row indent">
                <span>└ {p.name}</span>
                <span>{bal.toLocaleString()}</span>
              </div>
            )
          })}
        </div>
      ))}
      <div className="fs-row subtotal">
        <span>合計</span><span>{total.toLocaleString()}</span>
      </div>
    </div>
  )
}

export default function BSPage() {
  const { accounts, partners, subAccounts, journals, fiscalYears, currentFiscalYearId, setCurrentFiscalYearId } = useApp()
  const [report, setReport] = useState<BalanceReport | null>(null)

  useEffect(() => {
    if (!currentFiscalYearId) return
    api.reportBalances(currentFiscalYearId).then(setReport).catch(() => setReport(null))
  }, [currentFiscalYearId, journals])

  const fyEnd = report?.fiscalYear?.endDate

  // 補助科目内訳は取引先＋汎用補助科目の両方。年度末までの明細から集計する。
  const subItems: SubItem[] = [...partners, ...subAccounts]
  const subBalance = useMemo(() => (accountCode: string, subCode: string, type: AccountType) =>
    journals
      .filter(j => !fyEnd || j.date <= fyEnd)
      .flatMap(j => j.lines)
      .filter(l => l.accountCode === accountCode && l.partnerCode === subCode)
      .reduce((s, l) => s + l.amount * balanceSign(type, l.side), 0),
    [journals, fyEnd])

  const rows = report?.rows ?? []
  const hasSubOf = (code: string) => accounts.find(a => a.code === code)?.hasSub ?? false
  const withSubs = (r: BalanceReportRow) => ({
    ...r,
    subs: hasSubOf(r.code) ? subItems.filter(s => s.accountCode === r.code) : [],
  })
  const nonZero = (r: BalanceReportRow) => r.closing !== 0 || r.opening !== 0 || r.periodDebit !== 0 || r.periodCredit !== 0

  const assets      = rows.filter(r => r.type === 'asset' && nonZero(r)).map(withSubs)
  const liabilities = rows.filter(r => r.type === 'liability' && nonZero(r)).map(withSubs)
  const equities    = rows.filter(r => r.type === 'equity' && nonZero(r)).map(withSubs)

  // 当期純利益（未振替分）：決算前は収益−費用、決算後は振替済みなので0になる
  const netIncome = rows.filter(r => r.type === 'revenue').reduce((s, r) => s + r.closing, 0)
                  - rows.filter(r => r.type === 'expense').reduce((s, r) => s + r.closing, 0)

  const totalA = assets.reduce((s, a) => s + a.closing, 0)
  const totalL = liabilities.reduce((s, a) => s + a.closing, 0)
  const totalE = equities.reduce((s, a) => s + a.closing, 0) + netIncome

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="toolbar">
        <h2><i className="ti ti-layout-columns" />貸借対照表</h2>
        <select value={currentFiscalYearId ?? ''} onChange={e => setCurrentFiscalYearId(Number(e.target.value))} style={{ fontSize: 13 }}>
          {fiscalYears.map(f => <option key={f.id} value={f.id}>{f.name}{f.closed ? '（締済）' : ''}</option>)}
        </select>
        {report?.fiscalYear && (
          <span style={{ fontSize: 12, color: '#888' }}>{report.fiscalYear.endDate} 時点</span>
        )}
      </div>
      <div className="content">
        <div className="grid2">
          <div>
            <div className="fs-col-label">借方（資産）</div>
            <Section title="資産の部" items={assets} total={totalA} subBalance={subBalance} />
          </div>
          <div>
            <div className="fs-col-label">貸方（負債・純資産）</div>
            <Section title="負債の部" items={liabilities} total={totalL} subBalance={subBalance} />
            <div className="section-card">
              <div className="section-header">
                <span>純資産の部</span>
                <span>{totalE.toLocaleString()} 円</span>
              </div>
              {equities.map(a => (
                <div key={a.code} className="fs-row">
                  <span>{a.name}</span>
                  <span>{a.closing.toLocaleString()}</span>
                </div>
              ))}
              {netIncome !== 0 && (
                <div className="fs-row">
                  <span>{netIncome >= 0 ? '当期純利益' : '当期純損失'}</span>
                  <span>{netIncome.toLocaleString()}</span>
                </div>
              )}
              <div className="fs-row subtotal">
                <span>合計</span><span>{totalE.toLocaleString()}</span>
              </div>
            </div>
            <div className="fs-row total">
              <span>負債・純資産合計</span>
              <span>{(totalL + totalE).toLocaleString()}</span>
            </div>
            {totalA !== totalL + totalE && (
              <div className="alert alert-error" style={{ marginTop: 8, fontSize: 12 }}>
                貸借が一致していません（差額 {(totalA - totalL - totalE).toLocaleString()} 円）。仕訳データを確認してください。
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
