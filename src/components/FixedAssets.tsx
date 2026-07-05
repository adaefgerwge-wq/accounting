import { useState, useEffect, useCallback } from 'react'
import { useApp } from '../store'
import { api } from '../api'
import type { FixedAsset } from '../types'
import Modal from './Modal'

type AssetForm = { name: string; acquisitionDate: string; cost: string; usefulLifeYears: string; memo: string }
const emptyForm = (): AssetForm => ({ name: '', acquisitionDate: '', cost: '', usefulLifeYears: '4', memo: '' })

export default function FixedAssetsPage() {
  const { fiscalYears, currentFiscalYearId, setCurrentFiscalYearId, journals } = useApp()
  const [assets, setAssets] = useState<FixedAsset[]>([])
  const [open, setOpen]     = useState(false)
  const [editTarget, setEditTarget] = useState<FixedAsset | null>(null)
  const [form, setForm]     = useState<AssetForm>(emptyForm())
  const [error, setError]   = useState<string | null>(null)

  const load = useCallback(() => {
    api.fixedAssets(currentFiscalYearId ?? undefined)
      .then(a => { setAssets(a); setError(null) })
      .catch(e => setError(e instanceof Error ? e.message : '読み込みに失敗しました'))
  }, [currentFiscalYearId])

  useEffect(() => { load() }, [load, journals])

  const openNew = () => { setForm(emptyForm()); setEditTarget(null); setOpen(true) }
  const openEdit = (a: FixedAsset) => {
    setForm({ name: a.name, acquisitionDate: a.acquisitionDate, cost: String(a.cost), usefulLifeYears: String(a.usefulLifeYears), memo: a.memo })
    setEditTarget(a); setOpen(true)
  }

  const handleSubmit = async () => {
    const body = {
      name: form.name, acquisitionDate: form.acquisitionDate,
      cost: parseInt(form.cost) || 0, usefulLifeYears: parseInt(form.usefulLifeYears) || 0, memo: form.memo,
    }
    try {
      if (editTarget) await api.updateFixedAsset({ ...body, id: editTarget.id })
      else            await api.addFixedAsset(body)
      setOpen(false); load()
    } catch (e) { alert(e instanceof Error ? e.message : '保存に失敗しました') }
  }

  const handleDelete = async (a: FixedAsset) => {
    if (!confirm(`「${a.name}」を台帳から削除しますか？\n（計上済みの償却仕訳は削除されません）`)) return
    await api.deleteFixedAsset(a.id); load()
  }

  const totalPeriodDep = assets.reduce((s, a) => s + (a.periodDepreciation ?? 0), 0)

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="toolbar">
        <h2><i className="ti ti-building-warehouse" />固定資産台帳</h2>
        <select value={currentFiscalYearId ?? ''} onChange={e => setCurrentFiscalYearId(Number(e.target.value))} style={{ fontSize: 13 }}>
          {fiscalYears.map(f => <option key={f.id} value={f.id}>{f.name}{f.closed ? '（締済）' : ''}</option>)}
        </select>
        <button className="primary" onClick={openNew}><i className="ti ti-plus" /> 資産追加</button>
      </div>
      <div className="content">
        {error && <div className="alert alert-error">{error}</div>}
        <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
          定額法・月割で計算します。決算処理を実行すると、選択年度の償却額（合計 {totalPeriodDep.toLocaleString()} 円）が
          「減価償却費／減価償却累計額」として自動計上されます。
        </div>
        <table>
          <thead>
            <tr>
              <th>資産名</th><th>取得日</th>
              <th style={{ textAlign: 'right' }}>取得価額</th>
              <th style={{ textAlign: 'right' }}>耐用年数</th>
              <th style={{ textAlign: 'right' }}>当期償却額</th>
              <th style={{ textAlign: 'right' }}>償却累計額</th>
              <th style={{ textAlign: 'right' }}>期末簿価</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {assets.length === 0
              ? <tr><td colSpan={8}><div className="empty-state"><i className="ti ti-building-warehouse" />固定資産が登録されていません</div></td></tr>
              : assets.map(a => (
                <tr key={a.id}>
                  <td><strong>{a.name}</strong>{a.memo && <span style={{ fontSize: 11, color: '#aaa', marginLeft: 6 }}>{a.memo}</span>}</td>
                  <td style={{ color: '#888' }}>{a.acquisitionDate}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{a.cost.toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{a.usefulLifeYears}年</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{(a.periodDepreciation ?? 0).toLocaleString()}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#888' }}>{(a.accumulatedDepreciation ?? 0).toLocaleString()}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{(a.bookValue ?? a.cost).toLocaleString()}</td>
                  <td>
                    <div className="actions-cell">
                      <button className="icon-btn" onClick={() => openEdit(a)} title="編集"><i className="ti ti-pencil" /></button>
                      <button className="icon-btn danger" onClick={() => handleDelete(a)} title="削除"><i className="ti ti-trash" /></button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal
          title={<><i className={`ti ti-${editTarget ? 'pencil' : 'building-warehouse'}`} />{editTarget ? '固定資産を編集' : '固定資産の登録'}</>}
          onClose={() => setOpen(false)} onSubmit={handleSubmit} submitLabel={editTarget ? '更新' : '登録'}>
          <div className="form-row">
            <label>資産名</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="例: ノートPC" style={{ width: '100%' }} />
          </div>
          <div className="form-row-2">
            <div className="form-row" style={{ margin: 0 }}>
              <label>取得日</label>
              <input type="date" value={form.acquisitionDate} onChange={e => setForm(f => ({ ...f, acquisitionDate: e.target.value }))} style={{ width: '100%' }} />
            </div>
            <div className="form-row" style={{ margin: 0 }}>
              <label>取得価額（円）</label>
              <input type="number" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} style={{ width: '100%' }} />
            </div>
          </div>
          <div className="form-row">
            <label>耐用年数（年）</label>
            <input type="number" min={2} max={100} value={form.usefulLifeYears} onChange={e => setForm(f => ({ ...f, usefulLifeYears: e.target.value }))} />
            <div className="form-hint">例: パソコン4年、車両6年、備品8年（法定耐用年数を参考に）</div>
          </div>
          <div className="form-row">
            <label>備考</label>
            <input value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} style={{ width: '100%' }} />
          </div>
          <div className="form-hint">
            取得時の購入仕訳（例: 備品／普通預金）は仕訳帳で別途入力してください。この台帳は償却計算と決算時の自動計上に使われます。
          </div>
        </Modal>
      )}
    </div>
  )
}
