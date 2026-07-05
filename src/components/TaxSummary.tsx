import { useState, useEffect } from 'react'
import { useApp } from '../store'
import { api } from '../api'
import { TAX_LABELS } from '../types'
import type { TaxSummaryReport } from '../types'

export default function TaxSummaryPage() {
  const { fiscalYears, currentFiscalYearId, setCurrentFiscalYearId, journals } = useApp()
  const [report, setReport] = useState<TaxSummaryReport | null>(null)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    if (!currentFiscalYearId) return
    api.taxSummary(currentFiscalYearId)
      .then(r => { setReport(r); setError(null) })
      .catch(e => setError(e instanceof Error ? e.message : '集計に失敗しました'))
  }, [currentFiscalYearId, journals])

  const sales     = report?.rows.filter(r => r.category === 'sales') ?? []
  const purchases = report?.rows.filter(r => r.category === 'purchase') ?? []
  const sumTax = (rows: typeof sales) => rows.reduce((s, r) => s + r.tax, 0)

  const Table = ({ title, rows }: { title: string; rows: typeof sales }) => (
    <div className="section-card" style={{ marginBottom: 16 }}>
      <div className="section-header"><span>{title}</span></div>
      <table>
        <thead>
          <tr>
            <th>税区分</th>
            <th style={{ textAlign: 'right' }}>税抜金額</th>
            <th style={{ textAlign: 'right' }}>消費税額</th>
            <th style={{ textAlign: 'right' }}>税込金額</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={4} style={{ color: '#aaa', textAlign: 'center', padding: 16 }}>対象取引がありません</td></tr>
            : rows.map(r => (
              <tr key={r.taxType}>
                <td><span className={`tax-tag tax-${r.taxType}`}>{TAX_LABELS[r.taxType]}</span></td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.base.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.tax.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.gross.toLocaleString()}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="toolbar">
        <h2><i className="ti ti-receipt-tax" />消費税集計</h2>
        <select value={currentFiscalYearId ?? ''} onChange={e => setCurrentFiscalYearId(Number(e.target.value))} style={{ fontSize: 13 }}>
          {fiscalYears.map(f => <option key={f.id} value={f.id}>{f.name}{f.closed ? '（締済）' : ''}</option>)}
        </select>
        {report && (
          <span style={{ fontSize: 12, color: '#888' }}>
            経理方式: {report.taxMethod === 'exclusive' ? '税抜' : '税込'}
          </span>
        )}
      </div>
      <div className="content">
        {error && <div className="alert alert-error">{error}</div>}

        <Table title="課税売上（税率別）" rows={sales} />
        <Table title="課税仕入・経費・資産取得（税率別）" rows={purchases} />

        <div className="section-card">
          <div className="section-header"><span>納付税額の見込み（概算）</span></div>
          <div style={{ padding: '12px 16px', fontSize: 13 }}>
            <div className="fs-row"><span>売上に係る消費税</span><span>{sumTax(sales).toLocaleString()} 円</span></div>
            <div className="fs-row"><span>仕入等に係る消費税</span><span>△ {sumTax(purchases).toLocaleString()} 円</span></div>
            {report?.taxMethod === 'exclusive' && (
              <div className="fs-row" style={{ color: '#888', fontSize: 12 }}>
                <span>（仮受消費税 {report.taxReceived.toLocaleString()} 円 ／ 仮払消費税 {report.taxPaid.toLocaleString()} 円）</span>
                <span />
              </div>
            )}
            <div className="fs-row total">
              <span>{(sumTax(sales) - sumTax(purchases)) >= 0 ? '差引納付見込額' : '差引還付見込額'}</span>
              <span>{Math.abs(sumTax(sales) - sumTax(purchases)).toLocaleString()} 円</span>
            </div>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>
              ※ 本則課税（全額控除）ベースの概算です。簡易課税・按分計算・端数処理の特例は考慮していません。
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
