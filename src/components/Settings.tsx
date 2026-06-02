import { useRef, useState } from 'react'
import { useApp } from '../store'
import { api } from '../api'

export default function SettingsPage() {
  const { reload, currentFiscalYearId } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const [restoreMsg, setRestoreMsg] = useState<{type:'success'|'error', text:string} | null>(null)

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

        {/* CSV出力 */}
        <div className="section-card" style={{marginBottom:16}}>
          <div className="section-header"><span><i className="ti ti-download" style={{marginRight:6}} />CSV出力</span></div>
          <div style={{padding:'12px 14px', display:'flex', flexDirection:'column', gap:10}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <div>
                <div style={{fontWeight:500, fontSize:13}}>仕訳帳 CSV</div>
                <div style={{fontSize:12, color:'#888'}}>現在の会計年度の仕訳を出力</div>
              </div>
              <a href={api.exportJournalsCsv(currentFiscalYearId ?? undefined)} download>
                <button><i className="ti ti-file-spreadsheet" /> ダウンロード</button>
              </a>
            </div>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <div>
                <div style={{fontWeight:500, fontSize:13}}>全仕訳 CSV</div>
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
              <a href={api.exportTrialBalanceCsv()} download>
                <button><i className="ti ti-file-spreadsheet" /> ダウンロード</button>
              </a>
            </div>
          </div>
        </div>

        {/* バックアップ・復元 */}
        <div className="section-card">
          <div className="section-header"><span><i className="ti ti-database" style={{marginRight:6}} />バックアップ・復元</span></div>
          <div style={{padding:'12px 14px', display:'flex', flexDirection:'column', gap:10}}>
            {restoreMsg && (
              <div className={`alert alert-${restoreMsg.type}`}>{restoreMsg.text}</div>
            )}
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
                <div style={{fontSize:12, color:'#888', color:'#c0392b'}}>⚠ 現在のデータはすべて削除されます</div>
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
