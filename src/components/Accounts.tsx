import { useState } from 'react'
import { useApp } from '../store'
import type { Account, AccountType } from '../types'
import Modal from './Modal'

const TYPES: Record<AccountType, string> = {
  asset: '資産', liability: '負債', equity: '純資産', revenue: '収益', expense: '費用',
}
const TAG_CLASS: Record<AccountType, string> = {
  asset: 'tag-asset', liability: 'tag-liability', equity: 'tag-equity',
  revenue: 'tag-revenue', expense: 'tag-expense',
}

type AccountForm = Omit<Account, 'balance'> & { balance: string }

const emptyForm = (): AccountForm => ({ code: '', name: '', type: 'asset', balance: '0', hasSub: false })

export default function AccountsPage() {
  const { accounts, partners, addAccount, updateAccount, deleteAccount } = useApp()
  const [open, setOpen] = useState(false)
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [form, setForm] = useState<AccountForm>(emptyForm())

  const openNew = () => { setForm(emptyForm()); setEditIdx(null); setOpen(true) }
  const openEdit = (i: number) => {
    const a = accounts[i]
    setForm({ ...a, balance: String(a.balance) })
    setEditIdx(i)
    setOpen(true)
  }

  const handleSubmit = async () => {
    const { code, name, type, balance, hasSub } = form
    if (!code.trim() || !name.trim()) { alert('コードと科目名を入力してください'); return }
    const account: Account = { code: code.trim(), name: name.trim(), type, balance: parseInt(balance) || 0, hasSub }
    try {
      if (editIdx !== null) {
        await updateAccount(editIdx, account)
      } else {
        if (accounts.find(a => a.code === account.code)) { alert('同じコードの科目が既に存在します'); return }
        await addAccount(account)
      }
      setOpen(false)
    } catch (error) {
      alert(error instanceof Error ? error.message : '保存に失敗しました')
    }
  }

  const handleDelete = async (i: number) => {
    if (!confirm(`「${accounts[i].name}」を削除しますか？`)) return
    try {
      await deleteAccount(i)
    } catch (error) {
      alert(error instanceof Error ? error.message : '削除に失敗しました')
    }
  }

  const set = <K extends keyof AccountForm>(key: K, val: AccountForm[K]) =>
    setForm(f => ({ ...f, [key]: val }))

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="toolbar">
        <h2><i className="ti ti-list" />勘定科目マスタ</h2>
        <button className="primary" onClick={openNew}><i className="ti ti-plus" /> 科目追加</button>
      </div>
      <div className="content">
        <table>
          <thead>
            <tr>
              <th>コード</th><th>科目名</th><th>区分</th><th>補助科目対応</th>
              <th style={{ textAlign: 'right' }}>残高</th><th />
            </tr>
          </thead>
          <tbody>
            {accounts.map((a, i) => {
              const relCount = a.hasSub ? partners.filter(p => p.accountCode === a.code).length : 0
              return (
                <tr key={a.code}>
                  <td style={{ color: '#888', fontVariantNumeric: 'tabular-nums' }}>{a.code}</td>
                  <td>{a.name}</td>
                  <td><span className={`tag ${TAG_CLASS[a.type]}`}>{TYPES[a.type]}</span></td>
                  <td>
                    {a.hasSub
                      ? <><span className="tag tag-sub">有効</span>{relCount > 0 && <span style={{ fontSize: 11, color: '#888', marginLeft: 4 }}>{relCount}件</span>}</>
                      : <span style={{ color: '#ccc', fontSize: 12 }}>—</span>
                    }
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{a.balance.toLocaleString()}</td>
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
      </div>

      {open && (
        <Modal
          title={<><i className={`ti ti-${editIdx !== null ? 'pencil' : 'list'}`} />{editIdx !== null ? '勘定科目を編集' : '勘定科目の追加'}</>}
          onClose={() => setOpen(false)}
          onSubmit={handleSubmit}
          submitLabel={editIdx !== null ? '更新' : '追加'}
        >
          <div className="form-row-2">
            <div className="form-row" style={{ margin: 0 }}>
              <label>コード</label>
              <input style={{ width: '100%' }} value={form.code} onChange={e => set('code', e.target.value)} placeholder="例: 1030" />
            </div>
            <div className="form-row" style={{ margin: 0 }}>
              <label>区分</label>
              <select style={{ width: '100%' }} value={form.type} onChange={e => set('type', e.target.value as AccountType)}>
                {(Object.entries(TYPES) as [AccountType, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <label>科目名</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="例: 受取手形" />
          </div>
          <div className="form-row">
            <label>期初残高</label>
            <input type="number" value={form.balance} onChange={e => set('balance', e.target.value)} />
          </div>
          <div className="form-row">
            <label>補助科目（取引先紐づけ）を使用する</label>
            <select value={String(form.hasSub)} onChange={e => set('hasSub', e.target.value === 'true')}>
              <option value="false">使用しない</option>
              <option value="true">使用する</option>
            </select>
            <div className="form-hint">有効にすると仕訳入力時に取引先を指定できます</div>
          </div>
        </Modal>
      )}
    </div>
  )
}
