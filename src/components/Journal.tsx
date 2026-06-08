import { useState } from 'react'
import { useApp } from '../store'
import type { Journal, TaxType, AccountType } from '../types'
import { TAX_LABELS } from '../types'
import Modal from './Modal'

type JournalForm = Omit<Journal, 'id'>

const TAX_OPTIONS = Object.entries(TAX_LABELS) as [TaxType, string][]

// 借方区分 → 選べる貸方区分
const CREDIT_ALLOWED: Record<AccountType, AccountType[]> = {
  asset:     ['liability', 'equity', 'revenue'],
  expense:   ['asset', 'liability', 'equity'],
  liability: ['asset', 'expense'],
  equity:    ['asset', 'expense'],
  revenue:   ['asset', 'expense'],
}
// 貸方区分 → 選べる借方区分
const DEBIT_ALLOWED: Record<AccountType, AccountType[]> = {
  liability: ['asset', 'expense'],
  equity:    ['asset', 'expense'],
  revenue:   ['asset', 'expense'],
  asset:     ['liability', 'equity', 'revenue', 'expense'],
  expense:   ['liability', 'equity', 'revenue', 'asset'],
}

const TYPE_LABELS: Record<AccountType, string> = {
  asset: '資産', liability: '負債', equity: '純資産', revenue: '収益', expense: '費用'
}
const TYPE_COLORS: Record<AccountType, string> = {
  asset: '#0C447C', liability: '#993C1D', equity: '#3C3489', revenue: '#27500A', expense: '#633806'
}
const TYPE_BG: Record<AccountType, string> = {
  asset: '#E6F1FB', liability: '#FAECE7', equity: '#EEEDFE', revenue: '#EAF3DE', expense: '#FAEEDA'
}

// 正しいテンプレート（消費税区分修正済み）
const TEMPLATES = [
  { label: '売上入金',  debitName: '普通預金', creditName: '売上高',   memo: '売上入金',   debitTax: 'none' as TaxType,       creditTax: 'taxable10' as TaxType },
  { label: '掛売上',   debitName: '売掛金',   creditName: '売上高',   memo: '売上計上',   debitTax: 'none' as TaxType,       creditTax: 'taxable10' as TaxType },
  { label: '掛仕入',   debitName: '仕入高',   creditName: '買掛金',   memo: '仕入計上',   debitTax: 'taxable10' as TaxType,  creditTax: 'none' as TaxType },
  { label: '買掛支払', debitName: '買掛金',   creditName: '普通預金', memo: '買掛金支払', debitTax: 'none' as TaxType,       creditTax: 'none' as TaxType },
  { label: '給与支払', debitName: '給料手当', creditName: '普通預金', memo: '給与支払',   debitTax: 'none' as TaxType,       creditTax: 'none' as TaxType },
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
  const [alertMsg, setAlertMsg]     = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<Journal | null>(null)
  const [form, setForm]             = useState<JournalForm>(emptyForm(currentFiscalYearId ?? 1))
  const [open, setOpen]             = useState(false)
  // 借方・貸方それぞれの消費税区分を別管理
  const [debitTax,  setDebitTax]  = useState<TaxType>('none')
  const [creditTax, setCreditTax] = useState<TaxType>('none')

  const getAccount     = (code: string) => accounts.find(a => a.code === code)
  const getAccountName = (code: string) => getAccount(code)?.name ?? code
  const getPartnerName = (code: string) => partners.find(p => p.code === code)?.name ?? ''
  const accountByName  = (name: string) => accounts.find(a => a.name === name)
  const partnersFor    = (code: string) => { const a = getAccount(code); if (!a?.hasSub) return []; return partners.filter(p => p.accountCode === code) }
  const needsPartner   = (code: string) => Boolean(getAccount(code)?.hasSub)

  const debitType  = getAccount(form.debit)?.type
  const creditType = getAccount(form.credit)?.type
  const allowedCredit = debitType  ? CREDIT_ALLOWED[debitType]  : null
  const allowedDebit  = creditType ? DEBIT_ALLOWED[creditType]  : null

  const availableCredits = allowedCredit
    ? accounts.filter(a => allowedCredit.includes(a.type) && a.code !== form.debit)
    : accounts.filter(a => a.code !== form.debit)

  const availableDebits = allowedDebit
    ? accounts.filter(a => allowedDebit.includes(a.type) && a.code !== form.credit)
    : accounts.filter(a => a.code !== form.credit)

  const filteredJournals = currentFiscalYearId
    ? journals.filter(j => j.fiscalYearId === currentFiscalYearId)
    : journals

  const flash = (msg: string) => { setAlertMsg(msg); setTimeout(() => setAlertMsg(null), 2500) }

  const openNew = () => {
    setForm(emptyForm(currentFiscalYearId ?? 1))
    setDebitTax('none'); setCreditTax('none')
    setEditTarget(null); setOpen(true)
  }

  const openEdit = (j: Journal) => {
    setForm({ fiscalYearId: j.fiscalYearId, date: j.date, debit: j.debit, debitPartner: j.debitPartner, credit: j.credit, creditPartner: j.creditPartner, amount: j.amount, taxType: j.taxType, memo: j.memo })
    // 編集時は貸方科目の税区分をtaxTypeとして使用、借方は対象外
    setDebitTax('none')
    setCreditTax(j.taxType)
    setEditTarget(j); setOpen(true)
  }

  const applyTemplate = (t: typeof TEMPLATES[number]) => {
    const debit  = accountByName(t.debitName)?.code  ?? ''
    const credit = accountByName(t.creditName)?.code ?? ''
    setDebitTax(t.debitTax)
    setCreditTax(t.creditTax)
    // taxTypeは課税科目側を使う
    const taxType = t.creditTax !== 'none' ? t.creditTax : t.debitTax
    setForm(f => ({ ...f, debit, credit, debitPartner: '', creditPartner: '', memo: f.memo || t.memo, taxType }))
  }

  const set = (key: keyof JournalForm, val: string | number) => setForm(f => ({ ...f, [key]: val }))

  const handleDebitChange = (code: string) => {
    const newDebitType = getAccount(code)?.type
    const allowed = newDebitType ? CREDIT_ALLOWED[newDebitType] : null
    const creditStillValid = !allowed || (creditType && allowed.includes(creditType))
    // 科目のデフォルト消費税区分を自動セット
    const defaultTax = getAccount(code)?.defaultTaxType ?? 'none'
    setDebitTax(defaultTax)
    // taxTypeは課税側を優先
    const newTaxType = defaultTax !== 'none' ? defaultTax : creditTax
    setForm(f => ({ ...f, debit: code, debitPartner: '', credit: creditStillValid ? f.credit : '', creditPartner: '', taxType: newTaxType }))
  }

  const handleCreditChange = (code: string) => {
    const newCreditType = getAccount(code)?.type
    const allowed = newCreditType ? DEBIT_ALLOWED[newCreditType] : null
    const debitStillValid = !allowed || (debitType && allowed.includes(debitType))
    const defaultTax = getAccount(code)?.defaultTaxType ?? 'none'
    setCreditTax(defaultTax)
    const newTaxType = defaultTax !== 'none' ? defaultTax : debitTax
    setForm(f => ({ ...f, credit: code, creditPartner: '', debit: debitStillValid ? f.debit : '', debitPartner: '', taxType: newTaxType }))
  }

  const handleSubmit = async () => {
    if (!form.date || !form.amount || form.amount <= 0) { alert('日付と正の金額を入力してください'); return }
    if (!form.debit || !form.credit) { alert('借方科目と貸方科目を選択してください'); return }
    if (form.debit === form.credit)  { alert('借方と貸方に同じ科目は使えません'); return }
    try {
      if (editTarget) { await updateJournal({ ...form, id: editTarget.id }); flash('仕訳を更新しました') }
      else            { await addJournal(form); flash('仕訳を保存しました') }
      setOpen(false)
    } catch (e) { alert(e instanceof Error ? e.message : '保存に失敗しました') }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('この仕訳を削除しますか？')) return
    try { await deleteJournal(id) } catch (e) { alert(e instanceof Error ? e.message : '削除に失敗しました') }
  }

  const currentFY = fiscalYears.find(f => f.id === currentFiscalYearId)
  const isClosed  = currentFY?.closed ?? false

  const AccountSelect = ({ value, onChange, candidates, placeholder }: {
    value: string; onChange: (code: string) => void; candidates: typeof accounts; placeholder: string
  }) => {
    const types: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense']
    return (
      <select value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%' }}>
        <option value="">{placeholder}</option>
        {types.map(type => {
          const group = candidates.filter(a => a.type === type)
          if (!group.length) return null
          return (
            <optgroup key={type} label={`── ${TYPE_LABELS[type]}`}>
              {group.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
            </optgroup>
          )
        })}
      </select>
    )
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="toolbar">
        <h2><i className="ti ti-file-text" />仕訳帳</h2>
        <select value={currentFiscalYearId ?? ''} onChange={e => setCurrentFiscalYearId(Number(e.target.value))} style={{ fontSize: 13 }}>
          {fiscalYears.map(f => <option key={f.id} value={f.id}>{f.name}{f.closed ? '（締済）' : ''}</option>)}
        </select>
        {!isClosed && <button className="primary" onClick={openNew}><i className="ti ti-plus" /> 新規仕訳</button>}
        {isClosed  && <span style={{ fontSize: 12, color: '#c0392b', marginLeft: 4 }}>この年度は締め済みです</span>}
      </div>

      <div className="content" style={{ overflow: 'auto' }}>
        {alertMsg && <div className="alert alert-success">{alertMsg}</div>}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: 900, whiteSpace: 'nowrap' }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ verticalAlign: 'middle', borderRight: '0.5px solid #e8e5dc' }}>日付</th>
                <th colSpan={4} style={{ textAlign: 'center', borderBottom: '0.5px solid #e8e5dc', borderRight: '0.5px solid #e8e5dc', background: '#f0f0fa', color: '#3C3489' }}>借方</th>
                <th colSpan={4} style={{ textAlign: 'center', borderBottom: '0.5px solid #e8e5dc', borderRight: '0.5px solid #e8e5dc', background: '#fef0ee', color: '#993C1D' }}>貸方</th>
                <th rowSpan={2} style={{ verticalAlign: 'middle' }}>摘要</th>
                <th rowSpan={2} style={{ verticalAlign: 'middle' }} />
              </tr>
              <tr>
                <th style={{ background: '#f7f7fd' }}>科目</th>
                <th style={{ background: '#f7f7fd' }}>補助</th>
                <th style={{ background: '#f7f7fd', textAlign: 'right' }}>金額</th>
                <th style={{ background: '#f7f7fd', borderRight: '0.5px solid #e8e5dc' }}>消費税</th>
                <th style={{ background: '#fff8f7' }}>科目</th>
                <th style={{ background: '#fff8f7' }}>補助</th>
                <th style={{ background: '#fff8f7', textAlign: 'right' }}>金額</th>
                <th style={{ background: '#fff8f7', borderRight: '0.5px solid #e8e5dc' }}>消費税</th>
              </tr>
            </thead>
            <tbody>
              {filteredJournals.length === 0
                ? <tr><td colSpan={11}><div className="empty-state"><i className="ti ti-notes-off" />仕訳がありません</div></td></tr>
                : filteredJournals.map(j => {
                  const da = getAccount(j.debit)
                  const ca = getAccount(j.credit)
                  // 借方・貸方の消費税区分を科目のデフォルトから推定
                  const jDebitTax  = da?.defaultTaxType === j.taxType ? j.taxType : (da?.defaultTaxType ?? 'none')
                  const jCreditTax = ca?.defaultTaxType === j.taxType ? j.taxType : (ca?.defaultTaxType !== 'none' ? ca?.defaultTaxType ?? 'none' : j.taxType)
                  return (
                    <tr key={j.id}>
                      <td style={{ color: '#888', borderRight: '0.5px solid #f0ede6' }}>{j.date}</td>
                      <td>{da && <span className="account-badge" style={{ background: TYPE_BG[da.type], color: TYPE_COLORS[da.type] }}>{getAccountName(j.debit)}</span>}</td>
                      <td>{j.debitPartner ? <span className="partner-chip"><i className="ti ti-building" style={{ fontSize: 10 }} />{getPartnerName(j.debitPartner)}</span> : <span style={{ color: '#ccc' }}>—</span>}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{j.amount.toLocaleString()}</td>
                      <td style={{ borderRight: '0.5px solid #f0ede6' }}><span className={`tax-tag tax-${jDebitTax}`}>{TAX_LABELS[jDebitTax as keyof typeof TAX_LABELS]}</span></td>
                      <td>{ca && <span className="account-badge" style={{ background: TYPE_BG[ca.type], color: TYPE_COLORS[ca.type] }}>{getAccountName(j.credit)}</span>}</td>
                      <td>{j.creditPartner ? <span className="partner-chip"><i className="ti ti-building" style={{ fontSize: 10 }} />{getPartnerName(j.creditPartner)}</span> : <span style={{ color: '#ccc' }}>—</span>}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{j.amount.toLocaleString()}</td>
                      <td style={{ borderRight: '0.5px solid #f0ede6' }}><span className={`tax-tag tax-${jCreditTax}`}>{TAX_LABELS[jCreditTax as keyof typeof TAX_LABELS]}</span></td>
                      <td style={{ color: '#555', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.memo}</td>
                      <td><div className="actions-cell">
                        {!isClosed && <button className="icon-btn" onClick={() => openEdit(j)} title="編集"><i className="ti ti-pencil" /></button>}
                        {!isClosed && <button className="icon-btn danger" onClick={() => handleDelete(j.id)} title="削除"><i className="ti ti-trash" /></button>}
                      </div></td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <Modal
          title={<><i className={`ti ti-${editTarget ? 'pencil' : 'file-text'}`} />{editTarget ? '仕訳を編集' : '新規仕訳'}</>}
          onClose={() => setOpen(false)} onSubmit={handleSubmit} submitLabel={editTarget ? '更新' : '保存'}>

          <div className="form-row">
            <label>よく使う仕訳から選ぶ</label>
            <div className="template-grid">
              {TEMPLATES.map(t => (
                <button key={t.label} type="button" className="template-btn" onClick={() => applyTemplate(t)}>
                  <span>{t.label}</span>
                  <small>{t.debitName} / {t.creditName}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="form-row"><label>日付</label><input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={{ width: '100%' }} /></div>

          {/* 借方 */}
          <div style={{ background: '#f7f7fd', border: '0.5px solid #d0cdf5', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#3C3489', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>借方（何が増えた・何を使った）</div>
            <div className="form-row" style={{ marginBottom: 8 }}>
              <label>科目</label>
              <AccountSelect value={form.debit} onChange={handleDebitChange} candidates={form.credit ? availableDebits : accounts} placeholder="科目を選択" />
              {debitType && (
                <div style={{ marginTop: 4, fontSize: 11, color: TYPE_COLORS[debitType] }}>
                  ▶ {TYPE_LABELS[debitType]}科目 — 貸方は{allowedCredit?.map(t => TYPE_LABELS[t]).join('・')}から選べます
                </div>
              )}
            </div>
            {form.debit && (
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label>消費税区分</label>
                <select value={debitTax} onChange={e => { setDebitTax(e.target.value as TaxType); if (e.target.value !== 'none') set('taxType', e.target.value) }} style={{ width: '100%' }}>
                  {TAX_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            )}
            {needsPartner(form.debit) && (
              <div className="form-row" style={{ marginBottom: 0, marginTop: 8 }}>
                <label>取引先 <strong className="required-mark">必須</strong></label>
                <select value={form.debitPartner} onChange={e => set('debitPartner', e.target.value)} style={{ width: '100%' }}>
                  <option value="">— 選択 —</option>
                  {partnersFor(form.debit).map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* 貸方 */}
          <div style={{ background: '#fff8f7', border: '0.5px solid #f5c0bc', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#993C1D', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>貸方（何が減った・何から来た）</div>
            <div className="form-row" style={{ marginBottom: 8 }}>
              <label>科目</label>
              <AccountSelect value={form.credit} onChange={handleCreditChange} candidates={form.debit ? availableCredits : accounts} placeholder="科目を選択" />
              {creditType && (
                <div style={{ marginTop: 4, fontSize: 11, color: TYPE_COLORS[creditType] }}>
                  ▶ {TYPE_LABELS[creditType]}科目
                </div>
              )}
            </div>
            {form.credit && (
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label>消費税区分</label>
                <select value={creditTax} onChange={e => { setCreditTax(e.target.value as TaxType); if (e.target.value !== 'none') set('taxType', e.target.value) }} style={{ width: '100%' }}>
                  {TAX_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            )}
            {needsPartner(form.credit) && (
              <div className="form-row" style={{ marginBottom: 0, marginTop: 8 }}>
                <label>取引先 <strong className="required-mark">必須</strong></label>
                <select value={form.creditPartner} onChange={e => set('creditPartner', e.target.value)} style={{ width: '100%' }}>
                  <option value="">— 選択 —</option>
                  {partnersFor(form.credit).map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="form-row">
            <label>金額</label>
            <input type="number" value={form.amount || ''} onChange={e => set('amount', parseInt(e.target.value) || 0)} placeholder="例: 100000" style={{ width: '100%' }} />
            {form.amount > 0 && (
              <div className="balance-check ok">
                <span>借方 {form.amount.toLocaleString()} 円</span>
                <span>貸方 {form.amount.toLocaleString()} 円</span>
                <strong>貸借一致</strong>
              </div>
            )}
          </div>

          <div className="form-row">
            <label>摘要</label>
            <input type="text" value={form.memo} onChange={e => set('memo', e.target.value)} placeholder="例: 売上入金" style={{ width: '100%' }} />
          </div>
        </Modal>
      )}
    </div>
  )
}
