import { useState } from 'react'
import { useApp } from '../store'
import type { SubAccount } from '../types'
import Modal from './Modal'

type SubAccountForm = SubAccount

const emptyForm = (): SubAccountForm => ({ code: '', name: '', accountCode: '' })

export default function SubAccountsPage() {
  const { accounts, subAccounts, addSubAccount, updateSubAccount, deleteSubAccount } = useApp()
  const [open, setOpen] = useState(false)
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [form, setForm] = useState<SubAccountForm>(emptyForm())

  const subEnabledAccounts = accounts.filter(a => a.hasSub)

  const openNew  = () => { setForm(emptyForm()); setEditIdx(null); setOpen(true) }
  const openEdit = (i: number) => { setForm({ ...subAccounts[i] }); setEditIdx(i); setOpen(true) }

  const handleSubmit = async () => {
    if (!form.code.trim() || !form.name.trim()) { alert('コードと補助科目名を入力してください'); return }
    if (!form.accountCode) { alert('紐づける勘定科目を選択してください'); return }
    const s: SubAccount = { ...form, code: form.code.trim(), name: form.name.trim() }
    try {
      if (editIdx !== null) {
        await updateSubAccount(editIdx, s)
      } else {
        if (subAccounts.find(x => x.code === s.code)) { alert('同じコードの補助科目が既に存在します'); return }
        await addSubAccount(s)
      }
      setOpen(false)
    } catch (error) {
      alert(error instanceof Error ? error.message : '保存に失敗しました')
    }
  }

  const handleDelete = async (i: number) => {
    if (!confirm(`「${subAccounts[i].name}」を削除しますか？`)) return
    try {
      await deleteSubAccount(i)
    } catch (error) {
      alert(error instanceof Error ? error.message : '削除に失敗しました')
    }
  }

  const set = <K extends keyof SubAccountForm>(key: K, val: SubAccountForm[K]) =>
    setForm(f => ({ ...f, [key]: val }))

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="toolbar">
        <h2><i className="ti ti-list-tree" />補助科目マスタ</h2>
        <button className="primary" onClick={openNew}><i className="ti ti-plus" /> 補助科目追加</button>
      </div>
      <div className="content">
        {subEnabledAccounts.length === 0 ? (
          <div className="empty-state"><i className="ti ti-alert-circle" />補助科目対応の勘定科目がありません。先に科目マスタで「補助科目を使う」を有効にしてください</div>
        ) : subAccounts.length === 0 ? (
          <div className="empty-state"><i className="ti ti-list-tree" />補助科目がありません</div>
        ) : (
          <table>
            <thead>
              <tr><th>コード</th><th>補助科目名</th><th>所属する勘定科目</th><th /></tr>
            </thead>
            <tbody>
              {subAccounts.map((s, i) => {
                const acc = accounts.find(a => a.code === s.accountCode)
                return (
                  <tr key={s.code}>
                    <td style={{ color: '#888' }}>{s.code}</td>
                    <td><strong>{s.name}</strong></td>
                    <td>{acc ? <span className="sub-tag">{acc.code} {acc.name}</span> : <span style={{ color: '#ccc' }}>—</span>}</td>
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
          title={<><i className={`ti ti-${editIdx !== null ? 'pencil' : 'list-tree'}`} />{editIdx !== null ? '補助科目を編集' : '補助科目の追加'}</>}
          onClose={() => setOpen(false)}
          onSubmit={handleSubmit}
          submitLabel={editIdx !== null ? '更新' : '追加'}
        >
          <div className="form-row">
            <label>所属する勘定科目</label>
            <select style={{ width: '100%' }} value={form.accountCode} onChange={e => set('accountCode', e.target.value)}>
              <option value="">— 選択 —</option>
              {subEnabledAccounts.map(a => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
            </select>
            <div className="form-hint">補助科目対応が有効な科目のみ表示されます（例: 普通預金→口座別、旅費交通費→電車/タクシー）</div>
          </div>
          <div className="form-row-2">
            <div className="form-row" style={{ margin: 0 }}>
              <label>コード</label>
              <input style={{ width: '100%' }} value={form.code} onChange={e => set('code', e.target.value)} placeholder="例: S001" />
            </div>
            <div className="form-row" style={{ margin: 0 }}>
              <label>補助科目名</label>
              <input style={{ width: '100%' }} value={form.name} onChange={e => set('name', e.target.value)} placeholder="例: みずほ銀行" />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
