import { useState, useEffect } from 'react'
import { useApp } from '../store'
import { api } from '../api'
import type { BalanceReport, BalanceReportRow } from '../types'

const TYPE_LABELS = { asset:'資産', liability:'負債', equity:'純資産', revenue:'収益', expense:'費用' } as const
const TYPE_ORDER  = ['asset','liability','equity','revenue','expense'] as const

export default function TrialBalancePage() {
  const { fiscalYears, currentFiscalYearId, setCurrentFiscalYearId, journals } = useApp()
  const [report, setReport] = useState<BalanceReport | null>(null)
  const [error, setError]   = useState<string | null>(null)

  // journals を依存に入れて、仕訳の追加・決算処理後に自動で再集計する
  useEffect(() => {
    if (!currentFiscalYearId) return
    api.reportBalances(currentFiscalYearId)
      .then(r => { setReport(r); setError(null) })
      .catch(e => setError(e instanceof Error ? e.message : '集計に失敗しました'))
  }, [currentFiscalYearId, journals])

  const rows = report?.rows ?? []
  const sorted = [...rows].sort((a, b) => {
    const oi = TYPE_ORDER.indexOf(a.type)
    const oj = TYPE_ORDER.indexOf(b.type)
    if (oi !== oj) return oi - oj
    return a.code.localeCompare(b.code)
  }).filter(r => r.opening !== 0 || r.periodDebit !== 0 || r.periodCredit !== 0 || r.closing !== 0)

  const total = (f: (r: BalanceReportRow) => number) => sorted.reduce((s, r) => s + f(r), 0)
  // 借方正常科目（資産・費用）は正の残高を借方に、貸方正常科目は貸方に表示する
  const isDebitNormal = (r: BalanceReportRow) => r.type === 'asset' || r.type === 'expense'
  const debitBal  = (v: number, dn: boolean) => dn ? v : -v // 借方列に出す値（正なら表示）

  const totalOpeningD = sorted.reduce((s, r) => s + Math.max(debitBal(r.opening, isDebitNormal(r)), 0), 0)
  const totalOpeningC = sorted.reduce((s, r) => s + Math.max(-debitBal(r.opening, isDebitNormal(r)), 0), 0)
  const totalClosingD = sorted.reduce((s, r) => s + Math.max(debitBal(r.closing, isDebitNormal(r)), 0), 0)
  const totalClosingC = sorted.reduce((s, r) => s + Math.max(-debitBal(r.closing, isDebitNormal(r)), 0), 0)

  const fmt = (v: number) => v === 0 ? '—' : v.toLocaleString()

  return (
    <div className="page" style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div className="toolbar">
        <h2><i className="ti ti-table" />試算表</h2>
        <select value={currentFiscalYearId ?? ''} onChange={e => setCurrentFiscalYearId(Number(e.target.value))} style={{ fontSize: 13 }}>
          {fiscalYears.map(f => <option key={f.id} value={f.id}>{f.name}{f.closed ? '（締済）' : ''}</option>)}
        </select>
        {report?.fiscalYear && (
          <span style={{ fontSize: 12, color: '#888' }}>{report.fiscalYear.startDate} 〜 {report.fiscalYear.endDate}</span>
        )}
        <button onClick={() => api.download(api.exportTrialBalanceCsv(currentFiscalYearId ?? undefined), 'trial-balance.csv')}>
          <i className="ti ti-download" /> CSV出力
        </button>
      </div>
      <div className="content">
        {error && <div className="alert alert-error">{error}</div>}
        <table>
          <thead>
            <tr>
              <th>コード</th><th>科目名</th><th>区分</th>
              <th style={{textAlign:'right'}}>期首残高</th>
              <th style={{textAlign:'right'}}>期中借方</th>
              <th style={{textAlign:'right'}}>期中貸方</th>
              <th style={{textAlign:'right'}}>期末借方残高</th>
              <th style={{textAlign:'right'}}>期末貸方残高</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => {
              const dn = isDebitNormal(r)
              const closingD = debitBal(r.closing, dn)
              return (
                <tr key={r.code}>
                  <td style={{color:'#888'}}>{r.code}</td>
                  <td>{r.name}</td>
                  <td><span className={`tag tag-${r.type}`}>{TYPE_LABELS[r.type]}</span></td>
                  <td style={{textAlign:'right', fontVariantNumeric:'tabular-nums', color:'#888'}}>{fmt(r.opening)}</td>
                  <td style={{textAlign:'right', fontVariantNumeric:'tabular-nums'}}>{fmt(r.periodDebit)}</td>
                  <td style={{textAlign:'right', fontVariantNumeric:'tabular-nums'}}>{fmt(r.periodCredit)}</td>
                  <td style={{textAlign:'right', fontVariantNumeric:'tabular-nums'}}>{closingD > 0 ? closingD.toLocaleString() : '—'}</td>
                  <td style={{textAlign:'right', fontVariantNumeric:'tabular-nums'}}>{closingD < 0 ? (-closingD).toLocaleString() : '—'}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{fontWeight:500, background:'#fafaf7'}}>
              <td colSpan={3} style={{padding:'7px 8px', borderTop:'0.5px solid #e8e5dc'}}>合計</td>
              <td style={{textAlign:'right', padding:'7px 8px', borderTop:'0.5px solid #e8e5dc', color:'#888'}}>
                借 {totalOpeningD.toLocaleString()} ／ 貸 {totalOpeningC.toLocaleString()}
              </td>
              <td style={{textAlign:'right', padding:'7px 8px', borderTop:'0.5px solid #e8e5dc'}}>{total(r => r.periodDebit).toLocaleString()}</td>
              <td style={{textAlign:'right', padding:'7px 8px', borderTop:'0.5px solid #e8e5dc'}}>{total(r => r.periodCredit).toLocaleString()}</td>
              <td style={{textAlign:'right', padding:'7px 8px', borderTop:'0.5px solid #e8e5dc'}}>{totalClosingD.toLocaleString()}</td>
              <td style={{textAlign:'right', padding:'7px 8px', borderTop:'0.5px solid #e8e5dc'}}>{totalClosingC.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
