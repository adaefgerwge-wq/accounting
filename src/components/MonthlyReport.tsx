import { useState, useEffect } from 'react'
import { useApp } from '../store'
import { authFetch } from '../api'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'

interface MonthlyData {
  month: string
  revenue: number
  expense: number
  profit: number
}

interface AccountData {
  month: string
  code: string
  name: string
  type: string
  debitSum: number
  creditSum: number
}

const fmt = (v: number) => `¥${v.toLocaleString()}`

export default function MonthlyReportPage() {
  const { fiscalYears, currentFiscalYearId } = useApp()
  const [monthly,  setMonthly]  = useState<MonthlyData[]>([])
  const [accounts, setAccounts] = useState<AccountData[]>([])
  const [tab, setTab] = useState<'pl' | 'revenue' | 'expense'>('pl')
  const [loading, setLoading] = useState(true)

  const fy = fiscalYears.find(f => f.id === currentFiscalYearId)

  useEffect(() => {
    if (!currentFiscalYearId) return
    setLoading(true)
    Promise.all([
      authFetch(`/report/monthly?fiscalYearId=${currentFiscalYearId}`).then(r => r.json()),
      authFetch(`/report/monthly-accounts?fiscalYearId=${currentFiscalYearId}`).then(r => r.json()),
    ]).then(([m, a]) => {
      setMonthly(m)
      setAccounts(a)
      setLoading(false)
    })
  }, [currentFiscalYearId])

  // 月次PLグラフ用データ
  const plData = monthly.map(m => ({
    month: m.month.slice(5) + '月',
    '収益': m.revenue,
    '費用': m.expense,
    '利益': m.profit,
  }))

  // 科目別推移グラフ用データ
  const buildAccountChart = (type: 'revenue' | 'expense') => {
    const filtered = accounts.filter(a => a.type === type)
    const months = [...new Set(filtered.map(a => a.month))].sort()
    const names  = [...new Set(filtered.map(a => a.name))]
    const COLORS = ['#7F77DD','#27AE60','#E67E22','#E74C3C','#3498DB','#9B59B6','#1ABC9C']

    const data = months.map(month => {
      const row: Record<string, string | number> = { month: month.slice(5) + '月' }
      names.forEach(name => {
        const found = filtered.find(a => a.month === month && a.name === name)
        row[name] = found ? (type === 'revenue' ? found.creditSum : found.debitSum) : 0
      })
      return row
    })
    return { data, names, COLORS }
  }

  // サマリーカード
  const totalRevenue = monthly.reduce((s, m) => s + m.revenue, 0)
  const totalExpense = monthly.reduce((s, m) => s + m.expense, 0)
  const totalProfit  = totalRevenue - totalExpense

  if (loading) return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="toolbar"><h2><i className="ti ti-chart-line" />月次レポート</h2></div>
      <div className="content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>読み込み中...</div>
    </div>
  )

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="toolbar">
        <h2><i className="ti ti-chart-line" />月次レポート</h2>
        <span style={{ fontSize: 12, color: '#888' }}>{fy?.name}</span>
        <div style={{ display: 'flex', gap: 1, background: '#f0ede6', borderRadius: 6, padding: 2, marginLeft: 'auto' }}>
          {([['pl','損益推移'],['revenue','収益内訳'],['expense','費用内訳']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              style={{ fontSize: 12, border: 'none', borderRadius: 5, padding: '4px 12px',
                background: tab === key ? '#fff' : 'transparent', fontWeight: tab === key ? 500 : 400 }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="content">
        {/* サマリーカード */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: '累計収益', value: totalRevenue, color: '#27500A', bg: '#EAF3DE' },
            { label: '累計費用', value: totalExpense, color: '#633806', bg: '#FAEEDA' },
            { label: '累計利益', value: totalProfit,  color: totalProfit >= 0 ? '#3C3489' : '#993C1D', bg: totalProfit >= 0 ? '#EEEDFE' : '#FAECE7' },
          ].map(card => (
            <div key={card.label} style={{ background: card.bg, borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontSize: 11, color: card.color, fontWeight: 500, marginBottom: 4 }}>{card.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: card.color }}>{fmt(card.value)}</div>
            </div>
          ))}
        </div>

        {/* 損益推移グラフ */}
        {tab === 'pl' && (
          <>
            <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 12 }}>月次損益推移</div>
            {plData.length === 0
              ? <div className="empty-state"><i className="ti ti-chart-off" />データがありません</div>
              : <>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={plData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0ede6" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={v => `¥${(v/10000).toFixed(0)}万`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => fmt(Number(v))} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="収益" fill="#7F77DD" radius={[3,3,0,0]} />
                      <Bar dataKey="費用" fill="#F0A070" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ fontWeight: 500, fontSize: 13, margin: '20px 0 12px' }}>月次利益推移</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={plData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0ede6" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={v => `¥${(v/10000).toFixed(0)}万`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => fmt(Number(v))} />
                      <Line dataKey="利益" stroke="#7F77DD" strokeWidth={2} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>

                  {/* 月次テーブル */}
                  <div style={{ fontWeight: 500, fontSize: 13, margin: '20px 0 12px' }}>月次明細</div>
                  <table>
                    <thead>
                      <tr>
                        <th>月</th>
                        <th style={{ textAlign: 'right' }}>収益</th>
                        <th style={{ textAlign: 'right' }}>費用</th>
                        <th style={{ textAlign: 'right' }}>利益</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.map(m => (
                        <tr key={m.month}>
                          <td style={{ color: '#888' }}>{m.month}</td>
                          <td style={{ textAlign: 'right', color: '#27500A' }}>{fmt(m.revenue)}</td>
                          <td style={{ textAlign: 'right', color: '#633806' }}>{fmt(m.expense)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 500, color: m.profit >= 0 ? '#3C3489' : '#993C1D' }}>{fmt(m.profit)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ fontWeight: 500, background: '#fafaf7' }}>
                        <td style={{ padding: '7px 8px', borderTop: '0.5px solid #e8e5dc' }}>合計</td>
                        <td style={{ textAlign: 'right', padding: '7px 8px', borderTop: '0.5px solid #e8e5dc', color: '#27500A' }}>{fmt(totalRevenue)}</td>
                        <td style={{ textAlign: 'right', padding: '7px 8px', borderTop: '0.5px solid #e8e5dc', color: '#633806' }}>{fmt(totalExpense)}</td>
                        <td style={{ textAlign: 'right', padding: '7px 8px', borderTop: '0.5px solid #e8e5dc', color: totalProfit >= 0 ? '#3C3489' : '#993C1D' }}>{fmt(totalProfit)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </>
            }
          </>
        )}

        {/* 収益内訳 */}
        {tab === 'revenue' && (() => {
          const { data, names, COLORS } = buildAccountChart('revenue')
          return data.length === 0
            ? <div className="empty-state"><i className="ti ti-chart-off" />収益データがありません</div>
            : <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ede6" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `¥${(v/10000).toFixed(0)}万`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => fmt(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {names.map((name, i) => <Bar key={name} dataKey={name} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === names.length-1 ? [3,3,0,0] : [0,0,0,0]} />)}
                </BarChart>
              </ResponsiveContainer>
        })()}

        {/* 費用内訳 */}
        {tab === 'expense' && (() => {
          const { data, names, COLORS } = buildAccountChart('expense')
          return data.length === 0
            ? <div className="empty-state"><i className="ti ti-chart-off" />費用データがありません</div>
            : <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ede6" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `¥${(v/10000).toFixed(0)}万`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => fmt(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {names.map((name, i) => <Bar key={name} dataKey={name} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === names.length-1 ? [3,3,0,0] : [0,0,0,0]} />)}
                </BarChart>
              </ResponsiveContainer>
        })()}
      </div>
    </div>
  )
}
