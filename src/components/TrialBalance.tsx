import { useApp } from '../store'
import { api } from '../api'

const TYPE_LABELS = { asset:'資産', liability:'負債', equity:'純資産', revenue:'収益', expense:'費用' } as const
const TYPE_ORDER  = ['asset','liability','equity','revenue','expense'] as const

export default function TrialBalancePage() {
  const { accounts, currentFiscalYearId } = useApp()

  const sorted = [...accounts].sort((a, b) => {
    const oi = TYPE_ORDER.indexOf(a.type as typeof TYPE_ORDER[number])
    const oj = TYPE_ORDER.indexOf(b.type as typeof TYPE_ORDER[number])
    if (oi !== oj) return oi - oj
    return a.code.localeCompare(b.code)
  })

  const totalDebit  = sorted.filter(a => ['asset','expense'].includes(a.type)).reduce((s,a) => s+a.balance, 0)
  const totalCredit = sorted.filter(a => ['liability','equity','revenue'].includes(a.type)).reduce((s,a) => s+a.balance, 0)

  return (
    <div className="page" style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div className="toolbar">
        <h2><i className="ti ti-table" />試算表</h2>
        <a href={api.exportTrialBalanceCsv(currentFiscalYearId ?? undefined)} download>
          <button><i className="ti ti-download" /> CSV出力</button>
        </a>
      </div>
      <div className="content">
        <div style={{ display:'flex', gap:24, marginBottom:12, fontSize:13, color:'#555' }}>
          <div>借方合計（資産・費用）: <strong>{totalDebit.toLocaleString()} 円</strong></div>
          <div>貸方合計（負債・純資産・収益）: <strong>{totalCredit.toLocaleString()} 円</strong></div>
        </div>
        <table>
          <thead>
            <tr>
              <th>コード</th><th>科目名</th><th>区分</th>
              <th style={{textAlign:'right'}}>借方残高</th>
              <th style={{textAlign:'right'}}>貸方残高</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(a => {
              const isDebitNormal = ['asset','expense'].includes(a.type)
              return (
                <tr key={a.code}>
                  <td style={{color:'#888'}}>{a.code}</td>
                  <td>{a.name}</td>
                  <td><span className={`tag tag-${a.type}`}>{TYPE_LABELS[a.type]}</span></td>
                  <td style={{textAlign:'right', fontVariantNumeric:'tabular-nums'}}>
                    {isDebitNormal ? a.balance.toLocaleString() : '—'}
                  </td>
                  <td style={{textAlign:'right', fontVariantNumeric:'tabular-nums'}}>
                    {!isDebitNormal ? a.balance.toLocaleString() : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{fontWeight:500, background:'#fafaf7'}}>
              <td colSpan={3} style={{padding:'7px 8px', borderTop:'0.5px solid #e8e5dc'}}>合計</td>
              <td style={{textAlign:'right', padding:'7px 8px', borderTop:'0.5px solid #e8e5dc'}}>{totalDebit.toLocaleString()}</td>
              <td style={{textAlign:'right', padding:'7px 8px', borderTop:'0.5px solid #e8e5dc'}}>{totalCredit.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
