import { useState } from 'react'
import { useApp } from '../store'
import type { Partner, PartnerType } from '../types'
import Modal from './Modal'

const PARTNER_TYPES: Record<PartnerType, string> = {
  customer: '得意先', vendor: '仕入先', both: '両方',
}

type PartnerForm = Partner

const emptyForm = (): PartnerForm => ({ code: '', name: '', type: 'customer', accountCode: '' })

export default function PartnersPage() {
  const { accounts, partners, addPartner, updatePartner, deletePartner } = useApp()
  const [open, setOpen] = useState(false)
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [form, setForm] = useState<PartnerForm>(emptyForm())

  const subAccounts = accounts.filter(a => a.hasSub)

  const openNew = () => { setForm(emptyForm()); setEditIdx(null); setOpen(true) }
  const openEdit = (i: number) => { setForm({ ...partners[i] }); setEditIdx(i); setOpen(true) }

  const handleSubmit = () => {
    if (!form.code.trim() || !form.name.trim()) { alert('コードと取引先名を入力してください'); return }
    const p: Partner = { ...form, code: form.code.trim(), name: form.name.trim() }
    if (editIdx !== null) {
      updatePartner(editIdx, p)
    } else {
      if (partners.find(x => x.code === p.code)) { alert('同じコードの取引先が既に存在します'); return }
      addPartner(p)
    }
    setOpen(false)
  }

  const handleDelete = (i: number) => {
    if (!confirm(`「${partners[i].name}」を削除しますか？`)) return
    deletePartner(i)
  }

  const set = <K extends keyof PartnerForm>(key: K, val: PartnerForm[K]) =>
    setForm(f => ({ ...f, [key]: val }))

  const tagClass = (type: PartnerType) =>
    type === 'customer' ? 'tag-revenue' : type === 'vendor' ? 'tag-expense' : 'tag-asset'

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="toolbar">
        <h2><i className="ti ti-building" />取引先マスタ</h2>
        <button className="primary" onClick={openNew}><i className="ti ti-plus" /> 取引先追加</button>
      </div>
      <div className="content">
        {partners.length === 0 ? (
          <div className="empty-state"><i className="ti ti-building-off" />取引先がありません</div>
        ) : (
          <table>
            <thead>
              <tr><th>コード</th><th>取引先名</th><th>区分</th><th>関連科目</th><th /></tr>
            </thead>
            <tbody>
              {partners.map((p, i) => {
                const relAcc = accounts.find(a => a.code === p.accountCode)
                return (
                  <tr key={p.code}>
                    <td style={{ color: '#888' }}>{p.code}</td>
                    <td><strong>{p.name}</strong></td>
                    <td><span className={`tag ${tagClass(p.type)}`}>{PARTNER_TYPES[p.type]}</span></td>
                    <td>{relAcc ? <span className="sub-tag">{relAcc.code} {relAcc.name}</span> : <span style={{ color: '#ccc' }}>—</span>}</td>
                    <td>
                      <div className="actions-cell">
                        <button className="icon-btn" onClick={() => openEdit(i)} title="編集"><i className="ti ti-pencil" /></button>
                        <button className="icon-btn danger" onClick={() => handleDelete(i)} title="削除"><i className="ti ti-trash" /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <Modal
          title={<><i className={`ti ti-${editIdx !== null ? 'pencil' : 'building'}`} />{editIdx !== null ? '取引先を編集' : '取引先の追加'}</>}
          onClose={() => setOpen(false)}
          onSubmit={handleSubmit}
          submitLabel={editIdx !== null ? '更新' : '追加'}
        >
          <div className="form-row-2">
            <div className="form-row" style={{ margin: 0 }}>
              <label>コード</label>
              <input style={{ width: '100%' }} value={form.code} onChange={e => set('code', e.target.value)} placeholder="例: C003" />
            </div>
            <div className="form-row" style={{ margin: 0 }}>
              <label>区分</label>
              <select style={{ width: '100%' }} value={form.type} onChange={e => set('type', e.target.value as PartnerType)}>
                {(Object.entries(PARTNER_TYPES) as [PartnerType, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <label>取引先名</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="例: 株式会社〇〇" />
          </div>
          <div className="form-row">
            <label>関連勘定科目（補助科目として使用）</label>
            <select value={form.accountCode} onChange={e => set('accountCode', e.target.value)}>
              <option value="">—</option>
              {subAccounts.map(a => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
            </select>
            <div className="form-hint">補助科目対応が有効な科目のみ表示されます</div>
          </div>
        </Modal>
      )}
    </div>
  )
}
