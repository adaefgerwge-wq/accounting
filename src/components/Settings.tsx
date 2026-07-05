import { useRef, useState, useEffect } from 'react'
import { useApp } from '../store'
import { api, authFetch } from '../api'

export default function SettingsPage() {
  const { reload, currentFiscalYearId } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const [restoreMsg,    setRestoreMsg]    = useState<{type:'success'|'error', text:string} | null>(null)
  const [recalcMsg,     setRecalcMsg]     = useState<{type:'success'|'error', text:string} | null>(null)
  const [taxMethod,     setTaxMethod]     = useState<'inclusive'|'exclusive'>('inclusive')
  const [taxSaving,     setTaxSaving]     = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  // 請求書に印字する事業者情報（適格請求書発行事業者）
  const [issuer, setIssuer] = useState({ name: '', addr: '', regNo: '' })
  const [issuerSaved, setIssuerSaved] = useState(false)

  useEffect(() => {
    authFetch('/settings').then(r => r.json()).then(s => {
      if (s.tax_method) setTaxMethod(s.tax_method)
      setIssuer({ name: s.issuer_name ?? '', addr: s.issuer_addr ?? '', regNo: s.issuer_reg_no ?? '' })
    })
  }, [])

  const handleIssuerSave = async () => {
    await authFetch('/settings/issuer_name',   { method: 'PUT', body: JSON.stringify({ value: issuer.name }) })
    await authFetch('/settings/issuer_addr',   { method: 'PUT', body: JSON.stringify({ value: issuer.addr }) })
    await authFetch('/settings/issuer_reg_no', { method: 'PUT', body: JSON.stringify({ value: issuer.regNo }) })
    setIssuerSaved(true)
    setTimeout(() => setIssuerSaved(false), 2000)
  }

  const handleDownload = async (path: string, filename: string) => {
    try {
      await api.download(path, filename)
    } catch (err) {
      setRestoreMsg({ type: 'error', text: err instanceof Error ? err.message : 'ダウンロードに失敗しました' })
    }
  }

  const handleTaxMethodChange = async (method: 'inclusive'|'exclusive') => {
    setTaxSaving(true)
    await authFetch('/settings/tax_method', {
      method: 'PUT',
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
      const res = await authFetch('/recalculate', { method: 'POST' })
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

        {/* 事業者情報（請求書印字用） */}
        <div className="section-card" style={{marginBottom:16}}>
          <div className="section-header"><span><i className="ti ti-building-store" style={{marginRight:6}} />事業者情報（請求書に印字）</span></div>
          <div style={{padding:'12px 14px', display:'flex', flexDirection:'column', gap:10}}>
            <div className="form-row" style={{margin:0}}>
              <label>事業者名</label>
              <input value={issuer.name} onChange={e => setIssuer(v => ({...v, name: e.target.value}))} placeholder="例: 株式会社サンプル" style={{width:'100%'}} />
            </div>
            <div className="form-row" style={{margin:0}}>
              <label>住所</label>
              <input value={issuer.addr} onChange={e => setIssuer(v => ({...v, addr: e.target.value}))} placeholder="例: 東京都〇〇区..." style={{width:'100%'}} />
            </div>
            <div className="form-row" style={{margin:0}}>
              <label>適格請求書発行事業者 登録番号</label>
              <input value={issuer.regNo} onChange={e => setIssuer(v => ({...v, regNo: e.target.value}))} placeholder="例: T1234567890123" style={{width:'100%'}} />
              <div className="form-hint">インボイス制度の登録番号（T＋13桁）。請求書の印刷に表示されます</div>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <button className="primary" onClick={handleIssuerSave}><i className="ti ti-device-floppy" /> 保存</button>
              {issuerSaved && <span style={{fontSize:12, color:'#27500A'}}>保存しました ✓</span>}
            </div>
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
              <button onClick={() => handleDownload(api.exportJournalsCsv(currentFiscalYearId ?? undefined), 'journals.csv')}>
                <i className="ti ti-file-spreadsheet" /> ダウンロード
              </button>
            </div>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <div>
                <div style={{fontWeight:500, fontSize:13}}>仕訳帳 CSV（全期間）</div>
                <div style={{fontSize:12, color:'#888'}}>全会計年度の仕訳を出力</div>
              </div>
              <button onClick={() => handleDownload(api.exportJournalsCsv(), 'journals-all.csv')}>
                <i className="ti ti-file-spreadsheet" /> ダウンロード
              </button>
            </div>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <div>
                <div style={{fontWeight:500, fontSize:13}}>試算表 CSV</div>
                <div style={{fontSize:12, color:'#888'}}>勘定科目の残高一覧を出力</div>
              </div>
              <button onClick={() => handleDownload(api.exportTrialBalanceCsv(currentFiscalYearId ?? undefined), 'trial-balance.csv')}>
                <i className="ti ti-file-spreadsheet" /> ダウンロード
              </button>
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
              <button className="primary" onClick={() => handleDownload(api.exportBackup(), `accounting-backup-${new Date().toISOString().slice(0,10)}.json`)}>
                <i className="ti ti-cloud-download" /> バックアップ
              </button>
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
