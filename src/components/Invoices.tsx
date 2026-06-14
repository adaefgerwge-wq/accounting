import { useState, useEffect, useRef } from 'react'
import { useApp } from '../store'
import { authFetch } from '../api'
import Modal from './Modal'

// ローカルタイムゾーン基準の日付（YYYY-MM-DD）。toISOString()のUTCずれを防ぐ。
const localDate = (offsetDays = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const TAX_LABELS: Record<string, string> = { taxable10: '10%', taxable8: '8%', exempt: '非課税' }

interface InvoiceItem { id?: number; description: string; qty: number; unitPrice: number; taxType: 'taxable10'|'taxable8'|'exempt' }
interface Invoice {
  id: number; invoiceNo: string; partnerCode: string; partnerName: string; partnerAddr: string
  issueDate: string; dueDate: string; memo: string; status: 'draft'|'sent'|'paid'; items: InvoiceItem[]
}

const emptyInvoice = (): Omit<Invoice,'id'|'invoiceNo'|'status'> => ({
  partnerCode: '', partnerName: '', partnerAddr: '',
  issueDate: localDate(),
  dueDate: localDate(30),
  memo: '', items: [{ description: '', qty: 1, unitPrice: 0, taxType: 'taxable10' }]
})

function calcTotals(items: InvoiceItem[]) {
  const subtotal = items.reduce((s,i) => s + i.qty * i.unitPrice, 0)
  const tax10    = items.filter(i => i.taxType==='taxable10').reduce((s,i) => s + Math.floor(i.qty*i.unitPrice*0.1), 0)
  const tax8     = items.filter(i => i.taxType==='taxable8' ).reduce((s,i) => s + Math.floor(i.qty*i.unitPrice*0.08), 0)
  return { subtotal, tax10, tax8, total: subtotal + tax10 + tax8 }
}

export default function InvoicesPage() {
  const { partners } = useApp()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [open, setOpen]         = useState(false)
  const [editTarget, setEdit]   = useState<Invoice | null>(null)
  const [form, setForm]         = useState(emptyInvoice())
  const [previewId, setPreview] = useState<number | null>(null)

  useEffect(() => {
    authFetch('/invoices').then(r => r.json()).then(setInvoices)
  }, [])

  const openNew = () => { setForm(emptyInvoice()); setEdit(null); setOpen(true) }
  const openEdit = (inv: Invoice) => {
    setForm({ partnerCode: inv.partnerCode, partnerName: inv.partnerName, partnerAddr: inv.partnerAddr,
              issueDate: inv.issueDate, dueDate: inv.dueDate, memo: inv.memo, items: inv.items })
    setEdit(inv); setOpen(true)
  }

  const handlePartnerChange = (code: string) => {
    const p = partners.find(x => x.code === code)
    setForm(f => ({ ...f, partnerCode: code, partnerName: p?.name ?? f.partnerName }))
  }

  const setItem = (i: number, key: keyof InvoiceItem, val: string|number) =>
    setForm(f => ({ ...f, items: f.items.map((item, idx) => idx === i ? { ...item, [key]: val } : item) }))

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { description:'', qty:1, unitPrice:0, taxType:'taxable10' }] }))
  const removeItem = (i: number) => setForm(f => ({ ...f, items: f.items.filter((_,idx) => idx !== i) }))

  const handleSubmit = async () => {
    if (!form.partnerName || !form.items.length) { alert('取引先と明細を入力してください'); return }
    const res = editTarget
      ? await authFetch(`/invoices/${editTarget.id}`, { method:'PUT',  body: JSON.stringify(form) })
      : await authFetch('/invoices',                  { method:'POST', body: JSON.stringify(form) })
    if (!res.ok) { alert('保存に失敗しました'); return }
    const saved = await res.json()
    setInvoices(prev => editTarget ? prev.map(x => x.id===editTarget.id ? saved : x) : [saved, ...prev])
    setOpen(false)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('削除しますか？')) return
    await authFetch(`/invoices/${id}`, { method:'DELETE' })
    setInvoices(prev => prev.filter(x => x.id !== id))
  }

  const handleStatus = async (id: number, status: string) => {
    await authFetch(`/invoices/${id}/status`, { method:'PATCH', body: JSON.stringify({ status }) })
    setInvoices(prev => prev.map(x => x.id===id ? { ...x, status: status as Invoice['status'] } : x))
  }

  const STATUS_LABELS = { draft:'下書き', sent:'送付済', paid:'入金済' }
  const STATUS_COLORS = { draft:'#888', sent:'#3C3489', paid:'#27500A' }
  const STATUS_BG    = { draft:'#f5f4f0', sent:'#EEEDFE', paid:'#EAF3DE' }

  const preview = invoices.find(x => x.id === previewId)

  return (
    <div className="page" style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div className="toolbar">
        <h2><i className="ti ti-file-invoice" />請求書</h2>
        <button className="primary" onClick={openNew}><i className="ti ti-plus" /> 新規作成</button>
      </div>
      <div className="content" style={{ display:'flex', gap:16, overflow:'hidden' }}>
        {/* 一覧 */}
        <div style={{ flex:1, overflowY:'auto' }}>
          {invoices.length === 0
            ? <div className="empty-state"><i className="ti ti-file-invoice" />請求書がありません</div>
            : <table>
                <thead><tr><th>請求番号</th><th>取引先</th><th>発行日</th><th>支払期限</th><th style={{textAlign:'right'}}>合計</th><th>状態</th><th /></tr></thead>
                <tbody>
                  {invoices.map(inv => {
                    const { total } = calcTotals(inv.items)
                    return (
                      <tr key={inv.id} style={{ cursor:'pointer' }} onClick={() => setPreview(inv.id)}>
                        <td style={{ color:'#888', fontFamily:'monospace' }}>{inv.invoiceNo}</td>
                        <td><strong>{inv.partnerName}</strong></td>
                        <td style={{ color:'#888' }}>{inv.issueDate}</td>
                        <td style={{ color:'#888' }}>{inv.dueDate}</td>
                        <td style={{ textAlign:'right', fontVariantNumeric:'tabular-nums' }}>¥{total.toLocaleString()}</td>
                        <td>
                          <select value={inv.status} onClick={e => e.stopPropagation()}
                            onChange={e => handleStatus(inv.id, e.target.value)}
                            style={{ fontSize:11, padding:'1px 4px', background: STATUS_BG[inv.status], color: STATUS_COLORS[inv.status], border:'none', borderRadius:4, fontWeight:500 }}>
                            {Object.entries(STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </td>
                        <td><div className="actions-cell" onClick={e => e.stopPropagation()}>
                          <button className="icon-btn" onClick={() => openEdit(inv)}><i className="ti ti-pencil" /></button>
                          <button className="icon-btn danger" onClick={() => handleDelete(inv.id)}><i className="ti ti-trash" /></button>
                        </div></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
          }
        </div>

        {/* プレビュー */}
        {preview && <InvoicePreview invoice={preview} onClose={() => setPreview(null)} />}
      </div>

      {/* 編集モーダル */}
      {open && (
        <Modal title={<><i className="ti ti-file-invoice" />{editTarget ? '請求書を編集' : '請求書を作成'}</>}
          onClose={() => setOpen(false)} onSubmit={handleSubmit} submitLabel={editTarget ? '更新' : '作成'}>
          <div className="form-row">
            <label>取引先</label>
            <select value={form.partnerCode} onChange={e => handlePartnerChange(e.target.value)} style={{ width:'100%' }}>
              <option value="">— 選択または直接入力 —</option>
              {partners.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>取引先名（請求書に表示）</label>
            <input value={form.partnerName} onChange={e => setForm(f => ({...f, partnerName: e.target.value}))} placeholder="株式会社〇〇 御中" style={{width:'100%'}} />
          </div>
          <div className="form-row">
            <label>住所</label>
            <input value={form.partnerAddr} onChange={e => setForm(f => ({...f, partnerAddr: e.target.value}))} placeholder="東京都〇〇区..." style={{width:'100%'}} />
          </div>
          <div className="form-row-2">
            <div className="form-row" style={{margin:0}}><label>発行日</label><input style={{width:'100%'}} type="date" value={form.issueDate} onChange={e => setForm(f => ({...f, issueDate: e.target.value}))} /></div>
            <div className="form-row" style={{margin:0}}><label>支払期限</label><input style={{width:'100%'}} type="date" value={form.dueDate} onChange={e => setForm(f => ({...f, dueDate: e.target.value}))} /></div>
          </div>
          {/* 明細 */}
          <div className="form-row">
            <label>明細</label>
            <table style={{ width:'100%', fontSize:12 }}>
              <thead><tr><th>内容</th><th>数量</th><th>単価</th><th>税</th><th /></tr></thead>
              <tbody>
                {form.items.map((item, i) => (
                  <tr key={i}>
                    <td><input value={item.description} onChange={e => setItem(i,'description',e.target.value)} style={{width:'100%'}} placeholder="品目" /></td>
                    <td><input type="number" value={item.qty} onChange={e => setItem(i,'qty',Number(e.target.value))} style={{width:60}} /></td>
                    <td><input type="number" value={item.unitPrice} onChange={e => setItem(i,'unitPrice',Number(e.target.value))} style={{width:90}} /></td>
                    <td>
                      <select value={item.taxType} onChange={e => setItem(i,'taxType',e.target.value)} style={{fontSize:11}}>
                        {Object.entries(TAX_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td><button type="button" className="icon-btn danger" onClick={() => removeItem(i)}><i className="ti ti-x" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" onClick={addItem} style={{marginTop:6, fontSize:12}}><i className="ti ti-plus" /> 明細追加</button>
          </div>
          <div className="form-row">
            <label>備考</label>
            <input value={form.memo} onChange={e => setForm(f => ({...f, memo: e.target.value}))} style={{width:'100%'}} placeholder="振込先など" />
          </div>
          {/* 小計表示 */}
          {(() => { const t = calcTotals(form.items); return (
            <div style={{ background:'#fafaf7', borderRadius:6, padding:'8px 12px', fontSize:12, color:'#555' }}>
              <div style={{display:'flex',justifyContent:'space-between'}}><span>小計</span><span>¥{t.subtotal.toLocaleString()}</span></div>
              {t.tax10 > 0 && <div style={{display:'flex',justifyContent:'space-between'}}><span>消費税（10%）</span><span>¥{t.tax10.toLocaleString()}</span></div>}
              {t.tax8  > 0 && <div style={{display:'flex',justifyContent:'space-between'}}><span>消費税（8%）</span><span>¥{t.tax8.toLocaleString()}</span></div>}
              <div style={{display:'flex',justifyContent:'space-between',fontWeight:500,fontSize:13,marginTop:4,paddingTop:4,borderTop:'0.5px solid #e8e5dc'}}><span>合計</span><span>¥{t.total.toLocaleString()}</span></div>
            </div>
          )})()}
        </Modal>
      )}
    </div>
  )
}

function InvoicePreview({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null)
  const { total, subtotal, tax10, tax8 } = calcTotals(invoice.items)

  const handlePrint = () => {
    const content = printRef.current?.innerHTML
    if (!content) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${invoice.invoiceNo}</title>
    <style>
      body { font-family: 'Helvetica Neue', sans-serif; font-size: 13px; color: #1a1a1a; padding: 40px; max-width: 800px; margin: 0 auto; }
      h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
      table { width: 100%; border-collapse: collapse; margin: 16px 0; }
      th { background: #f5f4f0; padding: 8px; text-align: left; font-size: 12px; border-bottom: 1px solid #ddd; }
      td { padding: 8px; border-bottom: 0.5px solid #eee; }
      .total-row { font-weight: 700; font-size: 15px; }
      @media print { button { display: none; } }
    </style></head><body>${content}</body></html>`)
    w.document.close()
    w.print()
  }

  return (
    <div style={{ width:380, borderLeft:'0.5px solid #e8e5dc', paddingLeft:16, overflowY:'auto', flexShrink:0 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <strong style={{fontSize:13}}>プレビュー</strong>
        <div style={{display:'flex',gap:6}}>
          <button onClick={handlePrint}><i className="ti ti-printer" /> PDF印刷</button>
          <button onClick={onClose}><i className="ti ti-x" /></button>
        </div>
      </div>
      <div ref={printRef} style={{ fontSize:12 }}>
        <h1 style={{fontSize:20, fontWeight:700, marginBottom:4}}>請求書</h1>
        <div style={{color:'#888', marginBottom:16}}>{invoice.invoiceNo}</div>
        <div style={{marginBottom:16}}>
          <div style={{fontWeight:600, fontSize:14}}>{invoice.partnerName} 御中</div>
          {invoice.partnerAddr && <div style={{color:'#888', fontSize:11}}>{invoice.partnerAddr}</div>}
        </div>
        <div style={{display:'flex', gap:24, marginBottom:16, fontSize:11, color:'#666'}}>
          <div><span style={{color:'#aaa'}}>発行日: </span>{invoice.issueDate}</div>
          <div><span style={{color:'#aaa'}}>支払期限: </span>{invoice.dueDate}</div>
        </div>
        <div style={{ background:'#EEEDFE', color:'#3C3489', padding:'10px 14px', borderRadius:6, marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{fontWeight:500}}>ご請求金額</span>
          <span style={{fontSize:18, fontWeight:700}}>¥{total.toLocaleString()}</span>
        </div>
        <table>
          <thead><tr><th>内容</th><th style={{textAlign:'right'}}>数量</th><th style={{textAlign:'right'}}>単価</th><th style={{textAlign:'right'}}>金額</th></tr></thead>
          <tbody>
            {invoice.items.map((item, i) => (
              <tr key={i}>
                <td>{item.description}<span style={{fontSize:10, color:'#aaa', marginLeft:4}}>({TAX_LABELS[item.taxType]})</span></td>
                <td style={{textAlign:'right'}}>{item.qty}</td>
                <td style={{textAlign:'right'}}>¥{item.unitPrice.toLocaleString()}</td>
                <td style={{textAlign:'right'}}>¥{(item.qty * item.unitPrice).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ textAlign:'right', fontSize:12 }}>
          <div style={{color:'#888'}}>小計: ¥{subtotal.toLocaleString()}</div>
          {tax10 > 0 && <div style={{color:'#888'}}>消費税（10%）: ¥{tax10.toLocaleString()}</div>}
          {tax8  > 0 && <div style={{color:'#888'}}>消費税（8%）: ¥{tax8.toLocaleString()}</div>}
          <div style={{fontWeight:700, fontSize:14, marginTop:4}}>合計: ¥{total.toLocaleString()}</div>
        </div>
        {invoice.memo && <div style={{marginTop:16, padding:'8px 12px', background:'#fafaf7', borderRadius:4, fontSize:11, color:'#666'}}>{invoice.memo}</div>}
      </div>
    </div>
  )
}
