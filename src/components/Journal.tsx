import { useState } from 'react'
import { useApp } from '../store'
import type { Journal, TaxType } from '../types'
import { TAX_LABELS } from '../types'
import Modal from './Modal'

type JournalForm = Omit<Journal, 'id'>

const TAX_OPTIONS = Object.entries(TAX_LABELS) as [TaxType, string][]

const TEMPLATES = [
  { label: '売上入金',  debitName: '普通預金', creditName: '売上高',  memo: '売上入金',  taxType: 'taxable10' as TaxType },
  { label: '掛売上',   debitName: '売掛金',   creditName: '売上高',  memo: '売上計上',  taxType: 'taxable10' as TaxType },
  { label: '掛仕入',   debitName: '仕入高',   creditName: '買掛金',  memo: '仕入計上',  taxType: 'taxable10' as TaxType },
  { label: '買掛支払', debitName: '買掛金',   creditName: '普通預金', memo: '買掛金支払', taxType: 'none'      as TaxType },
  { label: '給与支払', debitName: '給料手当', creditName: '普通預金', memo: '給与支払',  taxType: 'none'      as TaxType },
]

const emptyForm = (fiscalYearId: number): JournalForm => ({
  fiscalYearId,
  date: new Date().toISOString().split('T')[0],
  debit: '', debitPartner: '',
  credit: '', creditPartner: '',
  amount: 0, taxType: 'none', memo: '',
})

export default function JournalPage() {
  const { accounts, partners, journals, fiscalYears, currentFiscalYearId, setCurrentFiscalYearId, addJournal, updateJournal, deleteJournal } = useApp()
  const [alertMsg, setAlertMsg] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<Journal | null>(null)
  const [form, setForm] = useState<JournalForm>(emptyForm(currentFiscalYearId ?? 1))
  const [open, setOpen] = useState(false)

  const getAccountName = (code: string) => accounts.find(a => a.code === code)?.name ?? code
  const getPartnerName = (code: string) => partners.find(p => p.code === code)?.name ?? ''
  const accountByName  = (name: string) => accounts.find(a => a.name === name)
  const partnersFor    = (code: string) => { const a = accounts.find(x => x.code === code); if (!a?.hasSub) return []; return partners.filter(p => p.accountCode === code) }
  const needsPartner   = (code: string) => Boolean(accounts.find(a => a.code === code)?.hasSub)

  const filteredJournals = currentFiscalYearId
    ? journals.filter(j => j.fiscalYearId === currentFiscalYearId)
    : journals

  const flash = (msg: string) => { setAlertMsg(msg); setTimeout(() => setAlertMsg(null), 2500) }

  const openNew = () => {
    setForm({ ...emptyForm(currentFiscalYearId ?? 1), debit: accounts[0]?.code ?? '', credit: accounts[1]?.code ?? '' })
    setEditTarget(null); setOpen(true)
  }
  const openEdit = (j: Journal) => {
    setForm({ fiscalYearId: j.fiscalYearId, date: j.date, debit: j.debit, debitPartner: j.debitPartner, credit: j.credit, creditPartner: j.creditPartner, amount: j.amount, taxType: j.taxType, memo: j.memo })
    setEditTarget(j); setOpen(true)
  }

  const applyTemplate = (t: typeof TEMPLATES[number]) => {
    const debit  = accountByName(t.debitName)?.code  ?? form.debit
    const credit = accountByName(t.creditName)?.code ?? form.credit
    setForm(f => ({ ...f, debit, credit, debitPartner: '', creditPartner: '', memo: f.memo || t.memo, taxType: t.taxType }))
  }

  const set = (key: keyof JournalForm, val: string | number) => setForm(f => ({ ...f, [key]: val }))

  const handleSubmit = async () => {
    if (!form.date || !form.amount || form.amount <= 0) { alert('日付と正の金額を入力してください'); return }
    if (form.debit === form.credit) { alert('借方と貸方に同じ科目は使えません'); return }
    try {
      if (editTarget) { await updateJournal({ ...form, id: editTarget.id }); flash('仕訳を更新しました') }
      else             { await addJournal(form); flash('仕訳を保存しました') }
      setOpen(false)
    } catch (e) { alert(e instanceof Error ? e.message : '保存に失敗しました') }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('この仕訳を削除しますか？')) return
    try { await deleteJournal(id) } catch (e) { alert(e instanceof Error ? e.message : '削除に失敗しました') }
  }

  const currentFY = fiscalYears.find(f => f.id === currentFiscalYearId)
  const isClosed  = currentFY?.closed ?? false

  return (
    <div className="page" style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div className="toolbar">
        <h2><i className="ti ti-file-text" />仕訳帳</h2>
        <select value={currentFiscalYearId ?? ''} onChange={e => setCurrentFiscalYearId(Number(e.target.value))} style={{ fontSize:13 }}>
          {fiscalYears.map(f => <option key={f.id} value={f.id}>{f.name}{f.closed ? '（締済）' : ''}</option>)}
        </select>
        {!isClosed && <button className="primary" onClick={openNew}><i className="ti ti-plus" /> 新規仕訳</button>}
        {isClosed  && <span style={{ fontSize:12, color:'#c0392b', marginLeft:4 }}>この年度は締め済みです</span>}
      </div>
      <div className="content" style={{overflow:'auto'}}>
        {alertMsg && <div className="alert alert-success">{alertMsg}</div>}
        <div style={{overflowX:'auto'}}>
          <table style={{minWidth:900, whiteSpace:'nowrap'}}>
            <thead>
              <tr>
                <th rowSpan={2} style={{verticalAlign:'middle', borderRight:'0.5px solid #e8e5dc'}}>日付</th>
                <th colSpan={4} style={{textAlign:'center', borderBottom:'0.5px solid #e8e5dc', borderRight:'0.5px solid #e8e5dc', background:'#f0f0fa', color:'#3C3489'}}>借方</th>
                <th colSpan={4} style={{textAlign:'center', borderBottom:'0.5px solid #e8e5dc', borderRight:'0.5px solid #e8e5dc', background:'#fef0ee', color:'#993C1D'}}>貸方</th>
                <th rowSpan={2} style={{verticalAlign:'middle'}}>摘要</th>
                <th rowSpan={2} style={{verticalAlign:'middle'}} />
              </tr>
              <tr>
                <th style={{background:'#f7f7fd'}}>科目</th>
                <th style={{background:'#f7f7fd'}}>補助</th>
                <th style={{background:'#f7f7fd', textAlign:'right'}}>金額</th>
                <th style={{background:'#f7f7fd', borderRight:'0.5px solid #e8e5dc'}}>消費税</th>
                <th style={{background:'#fff8f7'}}>科目</th>
                <th style={{background:'#fff8f7'}}>補助</th>
                <th style={{background:'#fff8f7', textAlign:'right'}}>金額</th>
                <th style={{background:'#fff8f7', borderRight:'0.5px solid #e8e5dc'}}>消費税</th>
              </tr>
            </thead>
            <tbody>
              {filteredJournals.length === 0
                ? <tr><td colSpan={11}><div className="empty-state"><i className="ti ti-notes-off" />仕訳がありません</div></td></tr>
                : filteredJournals.map(j => (
                  <tr key={j.id}>
                    <td style={{color:'#888', borderRight:'0.5px solid #f0ede6'}}>{j.date}</td>
                    <td>{getAccountName(j.debit)}</td>
                    <td>{j.debitPartner ? <span className="partner-chip"><i className="ti ti-building" style={{fontSize:10}} />{getPartnerName(j.debitPartner)}</span> : <span style={{color:'#ccc'}}>—</span>}</td>
                    <td style={{textAlign:'right', fontVariantNumeric:'tabular-nums'}}>{j.amount.toLocaleString()}</td>
                    <td style={{borderRight:'0.5px solid #f0ede6'}}><span className={`tax-tag tax-${j.taxType}`}>{TAX_LABELS[j.taxType]}</span></td>
                    <td>{getAccountName(j.credit)}</td>
                    <td>{j.creditPartner ? <span className="partner-chip"><i className="ti ti-building" style={{fontSize:10}} />{getPartnerName(j.creditPartner)}</span> : <span style={{color:'#ccc'}}>—</span>}</td>
                    <td style={{textAlign:'right', fontVariantNumeric:'tabular-nums'}}>{j.amount.toLocaleString()}</td>
                    <td style={{borderRight:'0.5px solid #f0ede6'}}><span className={`tax-tag tax-${j.taxType}`}>{TAX_LABELS[j.taxType]}</span></td>
                    <td style={{color:'#555', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis'}}>{j.memo}</td>
                    <td><div className="actions-cell">
                      {!isClosed && <button className="icon-btn" onClick={() => openEdit(j)} title="編集"><i className="ti ti-pencil" /></button>}
                      {!isClosed && <button className="icon-btn danger" onClick={() => handleDelete(j.id)} title="削除"><i className="ti ti-trash" /></button>}
                    </div></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <Modal title={<><i className={`ti ti-${editTarget ? 'pencil' : 'file-text'}`} />{editTarget ? '仕訳を編集' : '新規仕訳'}</>} onClose={() => setOpen(false)} onSubmit={handleSubmit} submitLabel={editTarget ? '更新' : '保存'}>
          <div className="form-row">
            <label>よく使う仕訳</label>
            <div className="template-grid">{TEMPLATES.map(t => (
              <button key={t.label} type="button" className="template-btn" onClick={() => applyTemplate(t)}>
                <span>{t.label}</span><small>{t.debitName} / {t.creditName}</small>
              </button>
            ))}</div>
          </div>
          <div className="form-row"><label>日付</label><input type="date" value={form.date} onChange={e => set('date', e.target.value)} /></div>
          <div className="form-row">
            <label>借方科目</label>
            <select value={form.debit} onChange={e => { set('debit', e.target.value); set('debitPartner', '') }}>
              {accounts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>借方補助（取引先）{needsPartner(form.debit) && <strong className="required-mark">必須</strong>}</label>
            <select value={form.debitPartner} onChange={e => set('debitPartner', e.target.value)}>
              <option value="">—</option>
              {partnersFor(form.debit).map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>貸方科目</label>
            <select value={form.credit} onChange={e => { set('credit', e.target.value); set('creditPartner', '') }}>
              {accounts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>貸方補助（取引先）{needsPartner(form.credit) && <strong className="required-mark">必須</strong>}</label>
            <select value={form.creditPartner} onChange={e => set('creditPartner', e.target.value)}>
              <option value="">—</option>
              {partnersFor(form.credit).map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>消費税区分</label>
            <select value={form.taxType} onChange={e => set('taxType', e.target.value)}>
              {TAX_OPTIONS.map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>金額</label>
            <input type="number" value={form.amount || ''} onChange={e => set('amount', parseInt(e.target.value)||0)} placeholder="例: 100000" />
            <div className={`balance-check ${form.amount > 0 ? 'ok' : ''}`}>
              <span>借方 {form.amount.toLocaleString()} 円</span>
              <span>貸方 {form.amount.toLocaleString()} 円</span>
              <strong>{form.amount > 0 ? '貸借一致' : '金額未入力'}</strong>
            </div>
          </div>
          <div className="form-row"><label>摘要</label><input type="text" value={form.memo} onChange={e => set('memo', e.target.value)} placeholder="例: 売上入金" /></div>
        </Modal>
      )}
    </div>
  )
}
