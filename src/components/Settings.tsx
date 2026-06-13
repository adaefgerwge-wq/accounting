import { useRef, useState, useEffect } from 'react'
import { useApp } from '../store'
import { api, API_BASE } from '../api'

export default function SettingsPage() {
  const { reload, currentFiscalYearId } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const [restoreMsg,    setRestoreMsg]    = useState<{type:'success'|'error', text:string} | null>(null)
  const [recalcMsg,     setRecalcMsg]     = useState<{type:'success'|'error', text:string} | null>(null)
  const [taxMethod,     setTaxMethod]     = useState<'inclusive'|'exclusive'>('inclusive')
  const [taxSaving,     setTaxSaving]     = useState(false)
  const [recalculating, setRecalculating] = useState(false)

  useEffect(() => {
    fetch(`${API_BASE}/settings`).then(r => r.json()).then(s => {
      if (s.tax_method) setTaxMethod(s.tax_method)
    })
  }, [])

  const handleTaxMethodChange = async (method: 'inclusive'|'exclusive') => {
    setTaxSaving(true)
    await fetch(`${API_BASE}/settings/tax_method`, {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ value: method })
    })
    setTaxMethod(method)
    setTaxSaving(false)
  }

  const handleRecalculate = async () => {
    if (!confirm('全仕訳を現在の経理方式で再計算します。\n既存の消費税仕訳は削除され再生成されます。\nよろしいですか？')) return
    setRecalculating(true)
    setRecalcMsg(null)
    try {
      const res = await fetch(`${API_BASE}/recalculate`, { method: 'POST' })
      const data = await res.json()
      await reload()
      setRecalcMsg({ type: 'success', text: data.message })
    } catch {
      setRecalcMsg({ type: 'error', text: '再計算に失敗しました' })
    }
    setRecalculating(false)
  }

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!confirm('現在の全データを削除してバックアップから復元します。よろしいですか？')) {
      e.target.value = ''; return
    }
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const result = await api.restore(data)
      await reload()
      setRestoreMsg({ type:'success', text: `復元完了: ${result.message}` })
    } catch (err) {
      setRestoreMsg({ type:'error', text: err instanceof Error ? err.message : '復元に失敗しました' })
    }
    e.target.value = ''
  }

  return (
    <div className="page" style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div className="toolbar"><h2><i className="ti ti-settings" />設定・バックアップ</h2></div>
      <div className="content">

        {/* 消費税経理方式 */}
        <div className="section-card" style={{marginBottom:16}}>
          <div className="section-header"><span><i className="ti ti-receipt-tax" style={{marginRight:6}} />消費税経理方式</span></div>
          <div style={{padding:'14px 16px', display:'flex', flexDirection:'column', gap:12}}>
            <div style={{fontSize:12, color:'#888'}}>
              方式を変更後、「既存仕訳を再計算」ボタンで過去の仕訳にも反映できます。
            </div>
            {[
              { value: 'inclusive', label: '税込経理', desc: '消費税込みの金額をそのまま売上・仕入に計上。シンプルで個人事業主向け。' },
              { value: 'exclusive', label: '税抜経理', desc: '税抜金額を売上・仕入に計上し、消費税を仮受/仮払消費税で管理。法人・消費税申告向け。' },
            ].map(opt => (
              <div
                key={opt.value}
                onClick={() => handleTaxMethodChange(opt.value as 'inclusive'|'exclusive')}
                style={{
                  display:'flex', alignItems:'flex-start', gap:12, padding:'12px 14px',
                  border: `1.5px solid ${taxMethod === opt.value ? '#7F77DD' : '#e8e5dc'}`,
                  borderRadius:8, cursor:'pointer',
                  background: taxMethod === opt.value ? '#EEEDFE' : '#fff',
                  opacity: taxSaving ? 0.6 : 1,
                }}
              >
                <div style={{
                  width:18, height:18, borderRadius:'50%',
                  border: `2px solid ${taxMethod === opt.value ? '#7F77DD' : '#ccc'}`,
                  background: taxMethod === opt.value ? '#7F77DD' : '#fff',
                  flexShrink:0, marginTop:1,
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  {taxMethod === opt.value && <div style={{width:8,height:8,borderRadius:'50%',background:'#fff'}} />}
                </div>
                <div>
                  <div style={{fontWeight:500, fontSize:13, color: taxMethod === opt.value ? '#3C3489' : '#1a1a1a'}}>{opt.label}</div>
                  <div style={{fontSize:12, color:'#888', marginTop:2}}>{opt.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{padding:'0 16px 14px'}}>
            {recalcMsg && <div className={`alert alert-${recalcMsg.type}`} style={{marginBottom:10}}>{recalcMsg.text}</div>}
            <button
              onClick={handleRecalculate}
              disabled={recalculating}
              style={{
                width:'100%', padding:'8px',
                background: recalculating ? '#f5f4f0' : '#fff',
                color:'#c0392b', border:'1px solid #f5c0bc',
                borderRadius:6, cursor: recalculating ? 'not-allowed' : 'pointer',
                fontSize:13, fontWeight:500
              }}
            >
              <i className="ti ti-refresh" /> {recalculating ? '再計算中...' : '既存仕訳を現在の経理方式で再計算'}
            </button>
            <div style={{fontSize:11, color:'#aaa', marginTop:4}}>消費税仕訳を削除して全仕訳を再処理します</div>
          </div>
        </div>

        {/* CSV出力 */}
        <div className="section-card" style={{marginBottom:16}}>
          <div className="section-header"><span><i className="ti ti-download" style={{marginRight:6}} />CSV出力</span></div>
          <div style={{padding:'12px 14px', display:'flex', flexDirection:'column', gap:10}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <div>
                <div style={{fontWeight:500, fontSize:13}}>仕訳帳 CSV（今期）</div>
                <div style={{fontSize:12, color:'#888'}}>現在の会計年度の仕訳を出力</div>
              </div>
              <a href={api.exportJournalsCsv(currentFiscalYearId ?? undefined)} download>
                <button><i className="ti ti-file-spreadsheet" /> ダウンロード</button>
              </a>
            </div>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <div>
                <div style={{fontWeight:500, fontSize:13}}>仕訳帳 CSV（全期間）</div>
                <div style={{fontSize:12, color:'#888'}}>全会計年度の仕訳を出力</div>
              </div>
              <a href={api.exportJournalsCsv()} download>
                <button><i className="ti ti-file-spreadsheet" /> ダウンロード</button>
              </a>
            </div>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <div>
                <div style={{fontWeight:500, fontSize:13}}>試算表 CSV</div>
                <div style={{fontSize:12, color:'#888'}}>勘定科目の残高一覧を出力</div>
              </div>
              <a href={api.exportTrialBalanceCsv(currentFiscalYearId ?? undefined)} download>
                <button><i className="ti ti-file-spreadsheet" /> ダウンロード</button>
              </a>
            </div>
          </div>
        </div>

        {/* バックアップ・復元 */}
        <div className="section-card">
          <div className="section-header"><span><i className="ti ti-database" style={{marginRight:6}} />バックアップ・復元</span></div>
          <div style={{padding:'12px 14px', display:'flex', flexDirection:'column', gap:10}}>
            {restoreMsg && <div className={`alert alert-${restoreMsg.type}`}>{restoreMsg.text}</div>}
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <div>
                <div style={{fontWeight:500, fontSize:13}}>バックアップ（JSON）</div>
                <div style={{fontSize:12, color:'#888'}}>全データをJSONファイルとして保存</div>
              </div>
              <a href={api.exportBackup()} download>
                <button className="primary"><i className="ti ti-cloud-download" /> バックアップ</button>
              </a>
            </div>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <div>
                <div style={{fontWeight:500, fontSize:13}}>復元</div>
                <div style={{fontSize:12, color:'#c0392b'}}>⚠ 現在のデータはすべて削除されます</div>
              </div>
              <div>
                <input ref={fileRef} type="file" accept=".json" style={{display:'none'}} onChange={handleRestore} />
                <button onClick={() => fileRef.current?.click()}><i className="ti ti-cloud-upload" /> JSONから復元</button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
