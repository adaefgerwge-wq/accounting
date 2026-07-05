import { useState, useEffect } from 'react'
import { useApp } from '../store'
import { api } from '../api'
import type { BalanceReport, BalanceReportRow } from '../types'

// 期中の増減（正常残高側を正）：収益は貸方−借方、費用は借方−貸方
function periodAmount(r: BalanceReportRow): number {
  return r.type === 'revenue' ? r.periodCredit - r.periodDebit : r.periodDebit - r.periodCredit
}

function Section({ title, items, total }: { title: string; items: BalanceReportRow[]; total: number }) {
  return (
    <div className="section-card">
      <div className="section-header">
        <span>{title}</span>
        <span>{total.toLocaleString()} 円</span>
      </div>
      {items.map(a => (
        <div key={a.code} className="fs-row">
          <span>{a.name}</span>
          <span>{periodAmount(a).toLocaleString()}</span>
        </div>
      ))}
      <div className="fs-row subtotal">
        <span>合計</span><span>{total.toLocaleString()}</span>
      </div>
    </div>
  )
}

export default function PLPage() {
  const { fiscalYears, currentFiscalYearId, setCurrentFiscalYearId, journals } = useApp()
  const [report, setReport] = useState<BalanceReport | null>(null)

  // 決算振替仕訳を除外して集計（締め済み年度でも損益が見えるように）
  useEffect(() => {
    if (!currentFiscalYearId) return
    api.reportBalances(currentFiscalYearId, true).then(setReport).catch(() => setReport(null))
  }, [currentFiscalYearId, journals])

  const rows = report?.rows ?? []
  const revenues = rows.filter(a => a.type === 'revenue' && periodAmount(a) !== 0)
  const expenses = rows.filter(a => a.type === 'expense' && periodAmount(a) !== 0)
  const totalR = revenues.reduce((s, a) => s + periodAmount(a), 0)
  const totalE = expenses.reduce((s, a) => s + periodAmount(a), 0)
  const profit = totalR - totalE

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="toolbar">
        <h2><i className="ti ti-chart-bar" />損益計算書</h2>
        <select value={currentFiscalYearId ?? ''} onChange={e => setCurrentFiscalYearId(Number(e.target.value))} style={{ fontSize: 13 }}>
          {fiscalYears.map(f => <option key={f.id} value={f.id}>{f.name}{f.closed ? '（締済）' : ''}</option>)}
        </select>
        {report?.fiscalYear && (
          <span style={{ fontSize: 12, color: '#888' }}>{report.fiscalYear.startDate} 〜 {report.fiscalYear.endDate}</span>
        )}
      </div>
      <div className="content">
        <Section title="収益の部" items={revenues} total={totalR} />
        <Section title="費用の部" items={expenses} total={totalE} />
        <div className="fs-row total">
          <span>{profit >= 0 ? '当期純利益' : '当期純損失'}</span>
          <span>{Math.abs(profit).toLocaleString()} 円</span>
        </div>
      </div>
    </div>
  )
}
