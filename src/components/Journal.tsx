import { useState } from 'react'
import { useApp } from '../store'
import type { Journal } from '../types'
import Modal from './Modal'

type JournalForm = Omit<Journal, 'id'>

const emptyForm = (): JournalForm => ({
  date: new Date().toISOString().split('T')[0],
  debit: '',
  debitPartner: '',
  credit: '',
  creditPartner: '',
  amount: 0,
  memo: '',
})

export default function JournalPage() {
  const { accounts, partners, journals, addJournal, updateJournal, deleteJournal } = useApp()
  const [alertMsg, setAlertMsg] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<Journal | null>(null)
  const [form, setForm] = useState<JournalForm>(emptyForm())
  const [open, setOpen] = useState(false)

  const getAccountName = (code: string) => accounts.find(a => a.code === code)?.name ?? code
  const getPartnerName = (code: string) => partners.find(p => p.code === code)?.name ?? ''

  const partnersFor = (code: string) => {
    const acc = accounts.find(a => a.code === code)
    if (!acc?.hasSub) return []
    return partners.filter(p => p.accountCode === code)
  }

  const flash = (msg: string) => {
    setAlertMsg(msg)
    setTimeout(() => setAlertMsg(null), 2500)
  }

  const openNew = () => {
    const defaultDebit = accounts[0]?.code ?? ''
    setForm({ ...emptyForm(), debit: defaultDebit, credit: accounts[1]?.code ?? '' })
    setEditTarget(null)
    setOpen(true)
  }

  const openEdit = (j: Journal) => {
    setForm({ date: j.date, debit: j.debit, debitPartner: j.debitPartner, credit: j.credit, creditPartner: j.creditPartner, amount: j.amount, memo: j.memo })
    setEditTarget(j)
    setOpen(true)
  }

  const handleSubmit = () => {
    if (!form.date || !form.amount || form.amount <= 0) { alert('日付と正の金額を入力してください'); return }
    if (form.debit === form.credit) { alert('借方と貸方に同じ科目は使えません'); return }
    if (editTarget) {
      updateJournal({ ...form, id: editTarget.id })
      flash('仕訳を更新しました')
    } else {
      addJournal(form)
      flash('仕訳を保存しました')
    }
    setOpen(false)
  }

  const handleDelete = (id: number) => {
    if (!confirm('この仕訳を削除しますか？')) return
    deleteJournal(id)
  }

  const set = (key: keyof JournalForm, val: string | number) =>
    setForm(f => ({ ...f, [key]: val }))

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="toolbar">
        <h2><i className="ti ti-file-text" />仕訳帳</h2>
        <button className="primary" onClick={openNew}><i className="ti ti-plus" /> 新規仕訳</button>
      </div>
      <div className="content">
        {alertMsg && <div className="alert alert-success">{alertMsg}</div>}
        <table>
          <thead>
            <tr>
              <th>日付</th>
              <th>借方科目</th>
              <th>借方補助</th>
              <th>貸方科目</th>
              <th>貸方補助</th>
              <th style={{ textAlign: 'right' }}>金額</th>
              <th>摘要</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {journals.length === 0 ? (
              <tr><td colSpan={8}><div className="empty-state"><i className="ti ti-notes-off" />仕訳がありません</div></td></tr>
            ) : journals.map(j => (
              <tr key={j.id}>
                <td style={{ whiteSpace: 'nowrap', color: '#888' }}>{j.date}</td>
                <td>{getAccountName(j.debit)}</td>
                <td>{j.debitPartner ? <span className="partner-chip"><i className="ti ti-building" style={{ fontSize: 10 }} />{getPartnerName(j.debitPartner)}</span> : <span style={{ color: '#ccc' }}>—</span>}</td>
                <td>{getAccountName(j.credit)}</td>
                <td>{j.creditPartner ? <span className="partner-chip"><i className="ti ti-building" style={{ fontSize: 10 }} />{getPartnerName(j.creditPartner)}</span> : <span style={{ color: '#ccc' }}>—</span>}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{j.amount.toLocaleString()}</td>
                <td style={{ color: '#555', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.memo}</td>
                <td>
                  <div className="actions-cell">
                    <button className="icon-btn" onClick={() => openEdit(j)} title="編集"><i className="ti ti-pencil" /></button>
                    <button className="icon-btn danger" onClick={() => handleDelete(j.id)} title="削除"><i className="ti ti-trash" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal
          title={<><i className={`ti ti-${editTarget ? 'pencil' : 'file-text'}`} />{editTarget ? '仕訳を編集' : '新規仕訳'}</>}
          onClose={() => setOpen(false)}
          onSubmit={handleSubmit}
          submitLabel={editTarget ? '更新' : '保存'}
        >
          <div className="form-row">
            <label>日付</label>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div className="form-row">
            <label>借方科目</label>
            <select value={form.debit} onChange={e => { set('debit', e.target.value); set('debitPartner', '') }}>
              {accounts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>借方補助（取引先）</label>
            <select value={form.debitPartner} onChange={e => set('debitPartner', e.target.value)}>
              <option value="">—</option>
              {partnersFor(form.debit).map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
            <div className="form-hint">補助科目対応の科目のみ選択可</div>
          </div>
          <div className="form-row">
            <label>貸方科目</label>
            <select value={form.credit} onChange={e => { set('credit', e.target.value); set('creditPartner', '') }}>
              {accounts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>貸方補助（取引先）</label>
            <select value={form.creditPartner} onChange={e => set('creditPartner', e.target.value)}>
              <option value="">—</option>
              {partnersFor(form.credit).map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
            <div className="form-hint">補助科目対応の科目のみ選択可</div>
          </div>
          <div className="form-row">
            <label>金額</label>
            <input type="number" value={form.amount || ''} onChange={e => set('amount', parseInt(e.target.value) || 0)} placeholder="例: 100000" />
          </div>
          <div className="form-row">
            <label>摘要</label>
            <input type="text" value={form.memo} onChange={e => set('memo', e.target.value)} placeholder="例: 売上入金" />
          </div>
        </Modal>
      )}
    </div>
  )
}
