import { useState } from 'react'
import { useApp } from '../store'
import type { Journal, JournalLine, TaxType } from '../types'
import { TAX_LABELS } from '../types'
import Modal from './Modal'

type LineDraft = Omit<JournalLine, 'id' | 'journalId'>
type JournalForm = { fiscalYearId: number; date: string; memo: string; lines: LineDraft[] }

const TAX_OPTIONS = Object.entries(TAX_LABELS) as [TaxType, string][]

const TEMPLATES: { label: string; lines: LineDraft[] }[] = [
  { label: '売上入金',  lines: [
    { side: 'debit',  accountCode: '1020', partnerCode: '', amount: 0, taxType: 'none' },
    { side: 'credit', accountCode: '4010', partnerCode: '', amount: 0, taxType: 'taxable10' },
  ]},
  { label: '掛売上',   lines: [
    { side: 'debit',  accountCode: '1100', partnerCode: '', amount: 0, taxType: 'none' },
    { side: 'credit', accountCode: '4010', partnerCode: '', amount: 0, taxType: 'taxable10' },
  ]},
  { label: '掛仕入',   lines: [
    { side: 'debit',  accountCode: '5010', partnerCode: '', amount: 0, taxType: 'taxable10' },
    { side: 'credit', accountCode: '2010', partnerCode: '', amount: 0, taxType: 'none' },
  ]},
  { label: '買掛支払', lines: [
    { side: 'debit',  accountCode: '2010', partnerCode: '', amount: 0, taxType: 'none' },
    { side: 'credit', accountCode: '1020', partnerCode: '', amount: 0, taxType: 'none' },
  ]},
  { label: '給与支払', lines: [
    { side: 'debit',  accountCode: '5020', partnerCode: '', amount: 0, taxType: 'none' },
    { side: 'credit', accountCode: '1020', partnerCode: '', amount: 0, taxType: 'none' },
  ]},
]

const TYPE_LABELS: Record<string, string> = {
  asset: '資産', liability: '負債', equity: '純資産', revenue: '収益', expense: '費用'
}
const TYPE_COLORS: Record<string, string> = {
  asset: '#0C447C', liability: '#993C1D', equity: '#3C3489', revenue: '#27500A', expense: '#633806'
}
const TYPE_BG: Record<string, string> = {
  asset: '#E6F1FB', liability: '#FAECE7', equity: '#EEEDFE', revenue: '#EAF3DE', expense: '#FAEEDA'
}

const emptyLine = (side: 'debit' | 'credit'): LineDraft =>
  ({ side, accountCode: '', partnerCode: '', amount: 0, taxType: 'none' })

// ローカルタイムゾーンの今日の日付（YYYY-MM-DD）。
// toISOString() はUTC基準のため、JSTの朝など時刻によって前日になるのを防ぐ。
const todayLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const emptyForm = (fiscalYearId: number): JournalForm => ({
  fiscalYearId, date: todayLocal(), memo: '',
  lines: [emptyLine('debit'), emptyLine('credit')],
})

export default function JournalPage() {
  const { accounts, partners, subAccounts, journals, fiscalYears, currentFiscalYearId, setCurrentFiscalYearId, addJournal, updateJournal, deleteJournal } = useApp()
  const [alertMsg, setAlertMsg]     = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<Journal | null>(null)
  const [form, setForm]             = useState<JournalForm>(emptyForm(currentFiscalYearId ?? 1))
  const [open, setOpen]             = useState(false)

  const getAccount     = (code: string) => accounts.find(a => a.code === code)
  // 補助科目名は取引先・汎用補助科目の両方から検索
  const getPartnerName = (code: string) =>
    partners.find(p => p.code === code)?.name ?? subAccounts.find(s => s.code === code)?.name ?? ''
  // 科目に紐づく取引先・補助科目を分けて取得
  const partnerOptionsFor = (code: string) => {
    const a = getAccount(code); if (!a?.hasSub) return []
    return partners.filter(p => p.accountCode === code)
  }
  const subOptionsFor = (code: string) => {
    const a = getAccount(code); if (!a?.hasSub) return []
    return subAccounts.filter(s => s.accountCode === code)
  }
  // 補助科目欄に表示する候補が1件でもあるか
  const hasAnySub = (code: string) => partnerOptionsFor(code).length > 0 || subOptionsFor(code).length > 0
  // コードが取引先か補助科目かを判定してラベルを返す
  const subKindLabel = (code: string) =>
    partners.some(p => p.code === code) ? '取引先' : subAccounts.some(s => s.code === code) ? '補助' : ''

  const filteredJournals = currentFiscalYearId
    ? journals.filter(j => j.fiscalYearId === currentFiscalYearId)
    : journals

  const flash = (msg: string) => { setAlertMsg(msg); setTimeout(() => setAlertMsg(null), 2500) }

  const openNew = () => {
    setForm(emptyForm(currentFiscalYearId ?? 1))
    setEditTarget(null); setOpen(true)
  }

  const openEdit = (j: Journal) => {
    setForm({
      fiscalYearId: j.fiscalYearId, date: j.date, memo: j.memo,
      lines: j.lines.map(l => ({ side: l.side, accountCode: l.accountCode, partnerCode: l.partnerCode, amount: l.amount, taxType: l.taxType })),
    })
    setEditTarget(j); setOpen(true)
  }

  const applyTemplate = (t: typeof TEMPLATES[number]) => {
    setForm(f => ({
      ...f,
      lines: t.lines.map(l => {
        const acc = accounts.find(a => a.code === l.accountCode)
        return { ...l, taxType: acc?.defaultTaxType ?? l.taxType }
      }),
    }))
  }

  const updateLine = (i: number, patch: Partial<LineDraft>) => {
    setForm(f => {
      const lines = [...f.lines]
      lines[i] = { ...lines[i], ...patch }
      // 科目変更時にデフォルト税区分を自動セット
      if (patch.accountCode !== undefined) {
        const acc = accounts.find(a => a.code === patch.accountCode)
        lines[i].taxType = acc?.defaultTaxType ?? 'none'
        lines[i].partnerCode = ''
      }
      return { ...f, lines }
    })
  }
  const addLine    = (side: 'debit' | 'credit') => setForm(f => ({ ...f, lines: [...f.lines, emptyLine(side)] }))
  const removeLine = (i: number)                => setForm(f => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))

  const debitTotal  = form.lines.filter(l => l.side === 'debit') .reduce((s, l) => s + (l.amount || 0), 0)
  const creditTotal = form.lines.filter(l => l.side === 'credit').reduce((s, l) => s + (l.amount || 0), 0)
  const balanced    = debitTotal > 0 && debitTotal === creditTotal

  const handleSubmit = async () => {
    if (!form.date) { alert('日付を入力してください'); return }
    if (form.lines.length < 2) { alert('明細行は2行以上必要です'); return }
    if (!balanced) { alert(`借方合計(${debitTotal.toLocaleString()})と貸方合計(${creditTotal.toLocaleString()})が一致しません`); return }
    try {
      if (editTarget) { await updateJournal({ ...form, id: editTarget.id, lines: form.lines.map((l, i) => ({ ...l, id: editTarget.lines[i]?.id ?? 0, journalId: editTarget.id })) }); flash('仕訳を更新しました') }
      else            { await addJournal({ ...form, lines: form.lines.map(l => ({ ...l, id: 0, journalId: 0 })) }); flash('仕訳を保存しました') }
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
                <th style={{ width: 90 }}>日付</th>
                <th>借方科目</th>
                <th style={{ textAlign: 'right', width: 100 }}>借方金額</th>
                <th style={{ width: 80 }}>借方消費税</th>
                <th style={{ width: 1, padding: 0 }} />
                <th>貸方科目</th>
                <th style={{ textAlign: 'right', width: 100 }}>貸方金額</th>
                <th style={{ width: 80 }}>貸方消費税</th>
                <th>摘要</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredJournals.length === 0
                ? <tr><td colSpan={10}><div className="empty-state"><i className="ti ti-notes-off" />仕訳がありません</div></td></tr>
                : filteredJournals.map(j => {
                  const debits  = j.lines.filter(l => l.side === 'debit')
                  const credits = j.lines.filter(l => l.side === 'credit')
                  const rows    = Math.max(debits.length, credits.length)
                  return Array.from({ length: rows }).map((_, ri) => {
                    const d = debits[ri]
                    const c = credits[ri]
                    const dAcc = d ? getAccount(d.accountCode) : null
                    const cAcc = c ? getAccount(c.accountCode) : null
                    return (
                      <tr key={`${j.id}-${ri}`} style={{ borderTop: ri === 0 ? '1.5px solid #e8e5dc' : '0.5px solid #f5f3ee' }}>
                        {ri === 0 && <td rowSpan={rows} style={{ color: '#888', verticalAlign: 'middle', borderRight: '0.5px solid #f0ede6' }}>{j.date}</td>}
                        {/* 借方 */}
                        <td style={{ background: '#f9f9fd' }}>
                          {dAcc && <span className="account-badge" style={{ background: TYPE_BG[dAcc.type], color: TYPE_COLORS[dAcc.type] }}>{dAcc.name}</span>}
                          {d?.partnerCode && <span className="partner-chip" style={{ fontSize: 11, marginLeft: 4 }}><span style={{ opacity: 0.6, marginRight: 3 }}>{subKindLabel(d.partnerCode)}:</span>{getPartnerName(d.partnerCode)}</span>}
                        </td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', background: '#f9f9fd' }}>
                          {d ? d.amount.toLocaleString() : ''}
                        </td>
                        <td style={{ background: '#f9f9fd' }}>
                          {d && <span className={`tax-tag tax-${d.taxType}`}>{TAX_LABELS[d.taxType]}</span>}
                        </td>
                        {/* 区切り */}
                        <td style={{ padding: 0, borderLeft: '1.5px solid #e0ddd5' }} />
                        {/* 貸方 */}
                        <td style={{ background: '#fff8f7' }}>
                          {cAcc && <span className="account-badge" style={{ background: TYPE_BG[cAcc.type], color: TYPE_COLORS[cAcc.type] }}>{cAcc.name}</span>}
                          {c?.partnerCode && <span className="partner-chip" style={{ fontSize: 11, marginLeft: 4 }}><span style={{ opacity: 0.6, marginRight: 3 }}>{subKindLabel(c.partnerCode)}:</span>{getPartnerName(c.partnerCode)}</span>}
                        </td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', background: '#fff8f7' }}>
                          {c ? c.amount.toLocaleString() : ''}
                        </td>
                        <td style={{ background: '#fff8f7' }}>
                          {c && <span className={`tax-tag tax-${c.taxType}`}>{TAX_LABELS[c.taxType]}</span>}
                        </td>
                        {ri === 0 && <td rowSpan={rows} style={{ color: '#555', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'middle' }}>{j.memo}</td>}
                        {ri === 0 && <td rowSpan={rows} style={{ verticalAlign: 'middle' }}>
                          <div className="actions-cell">
                            {!isClosed && <button className="icon-btn" onClick={() => openEdit(j)} title="編集"><i className="ti ti-pencil" /></button>}
                            {!isClosed && <button className="icon-btn danger" onClick={() => handleDelete(j.id)} title="削除"><i className="ti ti-trash" /></button>}
                          </div>
                        </td>}
                      </tr>
                    )
                  })
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
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <div className="form-row" style={{ flex: 1, marginBottom: 0 }}>
              <label>日付</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={{ width: '100%' }} />
            </div>
            <div className="form-row" style={{ flex: 2, marginBottom: 0 }}>
              <label>摘要</label>
              <input type="text" value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} placeholder="例: 売上入金" style={{ width: '100%' }} />
            </div>
          </div>

          {/* 明細行テーブル */}
          <div style={{ border: '0.5px solid #e8e5dc', borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
            <table style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#fafaf7' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', width: 60 }}>記入側</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', minWidth: 140 }}>科目</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', width: 100 }}>補助</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', width: 110 }}>金額</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', width: 110 }}>消費税</th>
                  <th style={{ width: 28 }} />
                </tr>
              </thead>
              <tbody>
                {form.lines.map((l, i) => {
                  const acc = getAccount(l.accountCode)
                  const partnerOpts = partnerOptionsFor(l.accountCode)
                  const subOpts     = subOptionsFor(l.accountCode)
                  return (
                    <tr key={i} style={{ borderTop: '0.5px solid #f0ede6', background: l.side === 'debit' ? '#f9f9fd' : '#fff8f7' }}>
                      <td style={{ padding: '4px 6px' }}>
                        <select value={l.side} onChange={e => updateLine(i, { side: e.target.value as 'debit'|'credit' })}
                          style={{ fontSize: 12, color: l.side === 'debit' ? '#3C3489' : '#993C1D', fontWeight: 600, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                          <option value="debit">借方</option>
                          <option value="credit">貸方</option>
                        </select>
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <select value={l.accountCode} onChange={e => updateLine(i, { accountCode: e.target.value })} style={{ width: '100%', fontSize: 12 }}>
                          <option value="">科目を選択</option>
                          {['asset','liability','equity','revenue','expense'].map(type => {
                            const group = accounts.filter(a => a.type === type)
                            if (!group.length) return null
                            return (
                              <optgroup key={type} label={`── ${TYPE_LABELS[type]}`}>
                                {group.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
                              </optgroup>
                            )
                          })}
                        </select>
                        {acc && hasAnySub(l.accountCode) && (
                          <select value={l.partnerCode} onChange={e => updateLine(i, { partnerCode: e.target.value })}
                            style={{ width: '100%', fontSize: 11, marginTop: 2 }}>
                            <option value="">— 取引先・補助科目 —</option>
                            {partnerOpts.length > 0 && (
                              <optgroup label="取引先">
                                {partnerOpts.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
                              </optgroup>
                            )}
                            {subOpts.length > 0 && (
                              <optgroup label="補助科目">
                                {subOpts.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                              </optgroup>
                            )}
                          </select>
                        )}
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        {l.partnerCode && (
                          <span className="partner-chip" style={{ fontSize: 11 }}>
                            <span style={{ opacity: 0.6, marginRight: 3 }}>{subKindLabel(l.partnerCode)}:</span>
                            {getPartnerName(l.partnerCode)}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <input type="number" value={l.amount || ''} min={0}
                          onChange={e => updateLine(i, { amount: parseInt(e.target.value) || 0 })}
                          style={{ width: '100%', textAlign: 'right', fontSize: 13 }} />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <select value={l.taxType} onChange={e => updateLine(i, { taxType: e.target.value as TaxType })} style={{ width: '100%', fontSize: 12 }}>
                          {TAX_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '4px 2px', textAlign: 'center' }}>
                        {form.lines.length > 2 && (
                          <button type="button" onClick={() => removeLine(i)}
                            style={{ background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 14, padding: 2 }}>✕</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button type="button" onClick={() => addLine('debit')}
              style={{ flex: 1, padding: '5px 0', fontSize: 12, color: '#3C3489', background: '#f7f7fd', border: '0.5px solid #d0cdf5', borderRadius: 6, cursor: 'pointer' }}>
              <i className="ti ti-plus" /> 借方行を追加
            </button>
            <button type="button" onClick={() => addLine('credit')}
              style={{ flex: 1, padding: '5px 0', fontSize: 12, color: '#993C1D', background: '#fff8f7', border: '0.5px solid #f5c0bc', borderRadius: 6, cursor: 'pointer' }}>
              <i className="ti ti-plus" /> 貸方行を追加
            </button>
          </div>

          <div className={`balance-check ${balanced ? 'ok' : 'ng'}`}>
            <span>借方合計 {debitTotal.toLocaleString()} 円</span>
            <span>貸方合計 {creditTotal.toLocaleString()} 円</span>
            <strong>{balanced ? '貸借一致 ✓' : '貸借不一致 ✗'}</strong>
          </div>
        </Modal>
      )}
    </div>
  )
}
