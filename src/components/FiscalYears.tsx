import { useState } from 'react'
import { useApp } from '../store'
import Modal from './Modal'
import type { FiscalYear } from '../types'

type FYForm = Omit<FiscalYear, 'id' | 'closed'>
const emptyForm = (): FYForm => ({ name: '', startDate: '', endDate: '' })

export default function FiscalYearsPage() {
  const { fiscalYears, addFiscalYear, closeFiscalYear, reopenFiscalYear, deleteFiscalYear } = useApp()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FYForm>(emptyForm())

  const set = (key: keyof FYForm, val: string) => setForm(f => ({ ...f, [key]: val }))

  const handleSubmit = async () => {
    if (!form.name || !form.startDate || !form.endDate) { alert('すべての項目を入力してください'); return }
    if (form.startDate >= form.endDate) { alert('開始日は終了日より前にしてください'); return }
    try { await addFiscalYear(form); setOpen(false); setForm(emptyForm()) }
    catch (e) { alert(e instanceof Error ? e.message : '保存に失敗しました') }
  }

  const handleClose = async (fy: FiscalYear) => {
    if (!confirm(`「${fy.name}」の決算処理を行いますか？\n\n・収益と費用を集計し、当期純利益を利益剰余金へ振り替えます\n・資産/負債/純資産の残高は翌年度へ繰り越されます\n・締め後は仕訳の追加・編集ができなくなります`)) return
    try { const msg = await closeFiscalYear(fy.id); alert(msg) }
    catch (e) { alert(e instanceof Error ? e.message : '処理に失敗しました') }
  }

  const handleReopen = async (fy: FiscalYear) => {
    if (!confirm(`「${fy.name}」の決算を取り消しますか？\n決算振替仕訳が削除され、締めが解除されます。`)) return
    try { const msg = await reopenFiscalYear(fy.id); alert(msg) }
    catch (e) { alert(e instanceof Error ? e.message : '処理に失敗しました') }
  }

  const handleDelete = async (fy: FiscalYear) => {
    if (!confirm(`「${fy.name}」を削除しますか？`)) return
    try { await deleteFiscalYear(fy.id) }
    catch (e) { alert(e instanceof Error ? e.message : '削除に失敗しました') }
  }

  return (
    <div className="page" style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div className="toolbar">
        <h2><i className="ti ti-calendar" />会計年度</h2>
        <button className="primary" onClick={() => setOpen(true)}><i className="ti ti-plus" /> 年度追加</button>
      </div>
      <div className="content">
        <table>
          <thead><tr><th>年度名</th><th>開始日</th><th>終了日</th><th>状態</th><th /></tr></thead>
          <tbody>
            {fiscalYears.map(fy => (
              <tr key={fy.id}>
                <td><strong>{fy.name}</strong></td>
                <td style={{color:'#888'}}>{fy.startDate}</td>
                <td style={{color:'#888'}}>{fy.endDate}</td>
                <td>{fy.closed
                  ? <span className="tag tag-liability">締済</span>
                  : <span className="tag tag-revenue">進行中</span>}
                </td>
                <td><div className="actions-cell">
                  {!fy.closed && <button className="icon-btn" onClick={() => handleClose(fy)} title="決算処理して締める"><i className="ti ti-lock" /></button>}
                  {fy.closed  && <button className="icon-btn" onClick={() => handleReopen(fy)} title="決算を取り消す"><i className="ti ti-lock-open" /></button>}
                  <button className="icon-btn danger" onClick={() => handleDelete(fy)} title="削除"><i className="ti ti-trash" /></button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <Modal title={<><i className="ti ti-calendar" />会計年度の追加</>} onClose={() => setOpen(false)} onSubmit={handleSubmit} submitLabel="追加">
          <div className="form-row"><label>年度名</label><input value={form.name} onChange={e => set('name', e.target.value)} placeholder="例: 2024年度" /></div>
          <div className="form-row-2">
            <div className="form-row" style={{margin:0}}><label>開始日</label><input style={{width:'100%'}} type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} /></div>
            <div className="form-row" style={{margin:0}}><label>終了日</label><input style={{width:'100%'}} type="date" value={form.endDate}   onChange={e => set('endDate',   e.target.value)} /></div>
          </div>
        </Modal>
      )}
    </div>
  )
}
