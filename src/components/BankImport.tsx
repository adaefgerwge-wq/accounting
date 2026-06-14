import { useState, useEffect, useRef } from 'react'
import { useApp } from '../store'
import { authFetch } from '../api'
import Modal from './Modal'
import Papa from 'papaparse'

interface BankRule { id: number; name: string; keyword: string; debitCode: string; creditCode: string; memoTpl: string; priority: number }
interface BankRow   { date: string; amount: number; description: string; ruleId: number|null; ruleName: string|null; debitCode: string; creditCode: string; memo: string; fiscalYearId: number; matched: boolean; selected: boolean }

export default function BankImportPage() {
  const { accounts, currentFiscalYearId, addJournal } = useApp()
  const [rules, setRules]     = useState<BankRule[]>([])
  const [rows,  setRows]      = useState<BankRow[]>([])
  const [tab,   setTab]       = useState<'import'|'rules'>('import')
  const [ruleOpen, setRuleOpen] = useState(false)
  const [editRule, setEditRule] = useState<BankRule | null>(null)
  const [ruleForm, setRuleForm] = useState({ name:'', keyword:'', debitCode:'', creditCode:'', memoTpl:'{description}', priority:0 })
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { authFetch('/bank-rules').then(r => r.json()).then(setRules) }, [])

  const getAccountName = (code: string) => accounts.find(a => a.code === code)?.name ?? code

  // CSVアップロード
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (result) => {
        // 一般的な銀行CSV列名を推測してマッピング
        const raw = (result.data as Record<string,string>[]).map(row => {
          const keys = Object.keys(row)
          const dateKey   = keys.find(k => /日付|date/i.test(k)) ?? keys[0]
          const amountKey = keys.find(k => /金額|amount|入金|出金/i.test(k)) ?? keys[1]
          const descKey   = keys.find(k => /摘要|内容|description|memo/i.test(k)) ?? keys[2]
          const rawAmt = String(row[amountKey] ?? '0').replace(/,/g,'')
          return { date: row[dateKey]?.trim() ?? '', amount: parseInt(rawAmt) || 0, description: row[descKey]?.trim() ?? '' }
        }).filter(r => r.date && r.amount)

        const res = await authFetch('/bank-rules/match', {
          method: 'POST',
          body: JSON.stringify({ rows: raw, fiscalYearId: currentFiscalYearId ?? 1 })
        })
        const matched = await res.json()
        setRows(matched.map((r: any) => ({ ...r, selected: r.matched })))
      }
    })
    e.target.value = ''
  }

  const toggleRow = (i: number) => setRows(prev => prev.map((r,idx) => idx===i ? {...r, selected: !r.selected} : r))
  const setRowField = (i: number, key: keyof BankRow, val: string) =>
    setRows(prev => prev.map((r,idx) => idx===i ? {...r, [key]: val} : r))

  const handleImport = async () => {
    const selected = rows.filter(r => r.selected && r.debitCode && r.creditCode)
    if (!selected.length) { alert('取り込む行を選択してください'); return }
    if (!confirm(`${selected.length}件の仕訳を登録しますか？`)) return
    setImporting(true)
    for (const r of selected) {
      const amt = Math.abs(r.amount)
      await addJournal({ fiscalYearId: r.fiscalYearId, date: r.date, memo: r.memo, lines: [
        { id: 0, journalId: 0, side: 'debit',  accountCode: r.debitCode,  partnerCode: '', amount: amt, taxType: 'none' },
        { id: 0, journalId: 0, side: 'credit', accountCode: r.creditCode, partnerCode: '', amount: amt, taxType: 'none' },
      ]})
    }
    setImporting(false)
    setRows([])
    alert(`${selected.length}件の仕訳を登録しました`)
  }

  // ルール保存
  const handleRuleSubmit = async () => {
    if (!ruleForm.name || !ruleForm.keyword || !ruleForm.debitCode || !ruleForm.creditCode) { alert('全項目を入力してください'); return }
    const res = editRule
      ? await authFetch(`/bank-rules/${editRule.id}`, { method:'PUT',  body: JSON.stringify(ruleForm) })
      : await authFetch('/bank-rules',                 { method:'POST', body: JSON.stringify(ruleForm) })
    setRules(await res.json())
    setRuleOpen(false)
  }
  const handleRuleDelete = async (id: number) => {
    if (!confirm('削除しますか？')) return
    const res = await authFetch(`/bank-rules/${id}`, { method:'DELETE' })
    setRules(await res.json())
  }
  const openNewRule = () => { setRuleForm({ name:'', keyword:'', debitCode:'', creditCode:'', memoTpl:'{description}', priority:0 }); setEditRule(null); setRuleOpen(true) }
  const openEditRule = (r: BankRule) => { setRuleForm({ name:r.name, keyword:r.keyword, debitCode:r.debitCode, creditCode:r.creditCode, memoTpl:r.memoTpl, priority:r.priority }); setEditRule(r); setRuleOpen(true) }

  return (
    <div className="page" style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div className="toolbar">
        <h2><i className="ti ti-building-bank" />銀行明細取り込み</h2>
        <div style={{ display:'flex', gap:1, background:'#f0ede6', borderRadius:6, padding:2 }}>
          {(['import','rules'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ fontSize:12, border:'none', borderRadius:5, padding:'4px 12px', background: tab===t ? '#fff' : 'transparent', fontWeight: tab===t ? 500 : 400 }}>
              {t==='import' ? '取り込み' : 'ルール設定'}
            </button>
          ))}
        </div>
      </div>

      <div className="content">
        {tab === 'import' && (
          <>
            <div style={{ display:'flex', gap:12, marginBottom:16, alignItems:'center' }}>
              <input ref={fileRef} type="file" accept=".csv" style={{display:'none'}} onChange={handleFile} />
              <button className="primary" onClick={() => fileRef.current?.click()}><i className="ti ti-upload" /> CSVアップロード</button>
              <span style={{ fontSize:12, color:'#aaa' }}>対応フォーマット: 日付・金額・摘要の列を含むCSV</span>
              {rows.length > 0 && (
                <button className="primary" onClick={handleImport} disabled={importing} style={{ marginLeft:'auto' }}>
                  <i className="ti ti-check" /> {rows.filter(r=>r.selected).length}件を仕訳登録
                </button>
              )}
            </div>
            {rows.length > 0 && (
              <div style={{ overflowX:'auto' }}>
                <table style={{ minWidth:800 }}>
                  <thead>
                    <tr>
                      <th style={{width:32}}><input type="checkbox" onChange={e => setRows(prev => prev.map(r => ({...r, selected: e.target.checked})))} /></th>
                      <th>日付</th><th style={{textAlign:'right'}}>金額</th><th>摘要</th>
                      <th>借方科目</th><th>貸方科目</th><th>摘要（仕訳）</th><th>マッチ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} style={{ background: row.matched ? '' : '#fffbf0' }}>
                        <td><input type="checkbox" checked={row.selected} onChange={() => toggleRow(i)} /></td>
                        <td style={{color:'#888', whiteSpace:'nowrap'}}>{row.date}</td>
                        <td style={{textAlign:'right', fontVariantNumeric:'tabular-nums', color: row.amount < 0 ? '#c0392b' : '#27500A'}}>{row.amount.toLocaleString()}</td>
                        <td style={{maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'#555'}}>{row.description}</td>
                        <td>
                          <select value={row.debitCode} onChange={e => setRowField(i,'debitCode',e.target.value)} style={{fontSize:12, width:'100%'}}>
                            <option value="">—</option>
                            {accounts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
                          </select>
                        </td>
                        <td>
                          <select value={row.creditCode} onChange={e => setRowField(i,'creditCode',e.target.value)} style={{fontSize:12, width:'100%'}}>
                            <option value="">—</option>
                            {accounts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
                          </select>
                        </td>
                        <td><input value={row.memo} onChange={e => setRowField(i,'memo',e.target.value)} style={{fontSize:12, width:'100%'}} /></td>
                        <td style={{textAlign:'center'}}>
                          {row.matched
                            ? <span className="tag tag-revenue" style={{fontSize:10}}>{row.ruleName}</span>
                            : <span style={{color:'#e67e22', fontSize:11}}>未マッチ</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === 'rules' && (
          <>
            <div style={{ marginBottom:12 }}>
              <button className="primary" onClick={openNewRule}><i className="ti ti-plus" /> ルール追加</button>
            </div>
            {rules.length === 0
              ? <div className="empty-state"><i className="ti ti-filter-off" />ルールがありません</div>
              : <table>
                  <thead><tr><th>ルール名</th><th>キーワード</th><th>借方</th><th>貸方</th><th>優先度</th><th /></tr></thead>
                  <tbody>
                    {rules.map(r => (
                      <tr key={r.id}>
                        <td><strong>{r.name}</strong></td>
                        <td><span className="sub-tag">{r.keyword}</span></td>
                        <td>{getAccountName(r.debitCode)}</td>
                        <td>{getAccountName(r.creditCode)}</td>
                        <td style={{color:'#888'}}>{r.priority}</td>
                        <td><div className="actions-cell">
                          <button className="icon-btn" onClick={() => openEditRule(r)}><i className="ti ti-pencil" /></button>
                          <button className="icon-btn danger" onClick={() => handleRuleDelete(r.id)}><i className="ti ti-trash" /></button>
                        </div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            }
          </>
        )}
      </div>

      {ruleOpen && (
        <Modal title={<><i className="ti ti-filter" />{editRule ? 'ルールを編集' : 'ルールを追加'}</>} onClose={() => setRuleOpen(false)} onSubmit={handleRuleSubmit} submitLabel={editRule ? '更新' : '追加'}>
          <div className="form-row"><label>ルール名</label><input value={ruleForm.name} onChange={e => setRuleForm(f=>({...f,name:e.target.value}))} placeholder="例: 電気代" style={{width:'100%'}} /></div>
          <div className="form-row">
            <label>キーワード（摘要に含まれる文字）</label>
            <input value={ruleForm.keyword} onChange={e => setRuleForm(f=>({...f,keyword:e.target.value}))} placeholder="例: 東京電力" style={{width:'100%'}} />
            <div className="form-hint">摘要にこのキーワードが含まれていれば自動マッチします</div>
          </div>
          <div className="form-row"><label>借方科目</label>
            <select value={ruleForm.debitCode} onChange={e => setRuleForm(f=>({...f,debitCode:e.target.value}))} style={{width:'100%'}}>
              <option value="">— 選択 —</option>
              {accounts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
            </select>
          </div>
          <div className="form-row"><label>貸方科目</label>
            <select value={ruleForm.creditCode} onChange={e => setRuleForm(f=>({...f,creditCode:e.target.value}))} style={{width:'100%'}}>
              <option value="">— 選択 —</option>
              {accounts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
            </select>
          </div>
          <div className="form-row"><label>摘要テンプレート</label>
            <input value={ruleForm.memoTpl} onChange={e => setRuleForm(f=>({...f,memoTpl:e.target.value}))} style={{width:'100%'}} />
            <div className="form-hint">{'{description}'} で元の摘要に置換されます</div>
          </div>
          <div className="form-row"><label>優先度（数値が大きいほど先にマッチ）</label>
            <input type="number" value={ruleForm.priority} onChange={e => setRuleForm(f=>({...f,priority:Number(e.target.value)}))} style={{width:80}} />
          </div>
        </Modal>
      )}
    </div>
  )
}
