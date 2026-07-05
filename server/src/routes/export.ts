import { Router } from 'express'
import { pool } from '../db.js'
import { mapAccount } from '../mappers.js'
import { aggregateBalances, type ReportLineRow } from '../domain/reporting.js'

export const exportRouter = Router()

const TAX_LABELS: Record<string, string> = {
  none: '対象外', taxable10: '課税10%', taxable8: '軽減8%', exempt: '非課税', non_taxable: '不課税'
}

// CSV出力：仕訳帳
exportRouter.get('/journals.csv', async (req, res, next) => {
  try {
    const { fiscalYearId } = req.query
    const conds = ['user_id = ?']
    const params: any[] = [req.userId]
    if (fiscalYearId) { conds.push('fiscal_year_id = ?'); params.push(fiscalYearId) }
    const [jRows] = await pool.query(`SELECT * FROM journals WHERE ${conds.join(' AND ')} ORDER BY date, id`, params) as any

    const [accRows] = await pool.query('SELECT * FROM accounts WHERE user_id = ? ORDER BY code', [req.userId]) as any
    const accounts = accRows.map(mapAccount)
    const accMap = new Map(accounts.map((a: any) => [a.code, a.name]))
    const [partRows] = await pool.query('SELECT code, name FROM partners WHERE user_id = ?', [req.userId]) as any
    const partMap = new Map((partRows as any[]).map((p: any) => [p.code, p.name]))

    const lines: string[] = []
    const header = ['仕訳ID', '日付', '借方科目コード', '借方科目名', '借方補助', '借方金額', '借方消費税', '貸方科目コード', '貸方科目名', '貸方補助', '貸方金額', '貸方消費税', '摘要']
    lines.push(header.join(','))

    if (jRows.length) {
      const ids = jRows.map((r: any) => r.id)
      const [lRows] = await pool.query('SELECT * FROM journal_lines WHERE journal_id IN (?) ORDER BY journal_id, id', [ids]) as any
      const linesByJournal = new Map<number, any[]>()
      for (const r of lRows) {
        if (!linesByJournal.has(r.journal_id)) linesByJournal.set(r.journal_id, [])
        linesByJournal.get(r.journal_id)!.push(r)
      }
      for (const jr of jRows) {
        const jLines = linesByJournal.get(jr.id) ?? []
        const date = String(jr.date).slice(0,10)
        const debits  = jLines.filter((l: any) => l.side === 'debit')
        const credits = jLines.filter((l: any) => l.side === 'credit')
        const rowCount = Math.max(debits.length, credits.length)
        for (let i = 0; i < rowCount; i++) {
          const d = debits[i]
          const c = credits[i]
          const row = [
            i === 0 ? jr.id : '',
            i === 0 ? date  : '',
            d ? d.account_code : '', d ? (accMap.get(d.account_code) ?? '') : '',
            d ? (partMap.get(d.partner_code) ?? '') : '',
            d ? d.amount : '', d ? (TAX_LABELS[d.tax_type] ?? d.tax_type) : '',
            c ? c.account_code : '', c ? (accMap.get(c.account_code) ?? '') : '',
            c ? (partMap.get(c.partner_code) ?? '') : '',
            c ? c.amount : '', c ? (TAX_LABELS[c.tax_type] ?? c.tax_type) : '',
            i === 0 ? jr.memo : '',
          ]
          lines.push(row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
        }
      }
    }

    const bom = '﻿'
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="journals.csv"')
    res.send(bom + lines.join('\r\n'))
  } catch (e) { next(e) }
})

// CSV出力：試算表（期首残高・期中増減・期末残高、カテゴリ合計付き）
exportRouter.get('/trial-balance.csv', async (req, res, next) => {
  try {
    const { fiscalYearId } = req.query
    const TYPE_LABELS: Record<string, string> = { asset:'資産', liability:'負債', equity:'純資産', revenue:'収益', expense:'費用' }
    const TYPE_ORDER = ['asset','liability','equity','revenue','expense']

    // 会計年度の期間を取得（指定があれば）
    let startDate: string | null = null
    let endDate: string | null = null
    let periodLabel = '全期間'
    if (fiscalYearId) {
      const [fyRows] = await pool.query('SELECT * FROM fiscal_years WHERE id = ? AND user_id = ?', [fiscalYearId, req.userId]) as any
      if (fyRows[0]) {
        startDate = String(fyRows[0].start_date).slice(0,10)
        endDate   = String(fyRows[0].end_date).slice(0,10)
        periodLabel = `${fyRows[0].name}（${startDate} 〜 ${endDate}）`
      }
    }

    const [accRows] = await pool.query('SELECT * FROM accounts WHERE user_id = ? ORDER BY code', [req.userId]) as any
    const accounts = accRows.map(mapAccount)

    // 全仕訳明細を日付付きで取得し、画面と同じ共通ロジックで集計する
    const [lineRows] = await pool.query(`
      SELECT jl.account_code, jl.side, jl.amount, j.date, j.kind
      FROM journal_lines jl
      JOIN journals j ON jl.journal_id = j.id
      WHERE j.user_id = ?
    `, [req.userId]) as any
    const lines: ReportLineRow[] = lineRows.map((r: any) => ({
      accountCode: r.account_code, side: r.side, amount: r.amount,
      date: String(r.date).slice(0, 10), kind: r.kind ?? 'normal',
    }))
    const balanceRows = aggregateBalances(accounts, lines, {
      start: startDate ?? undefined, end: endDate ?? undefined,
    })
    const agg = new Map(balanceRows.map(r => [r.code, r]))

    const esc = (v: any) => `"${String(v).replace(/"/g, '""')}"`
    // 期首・期末は「正常残高側を正」の符号付き残高を1列にまとめて出力
    const header = ['コード','科目名','区分','期首残高','期中借方','期中貸方','期末残高']
    const out: string[] = []
    out.push(`"期間: ${periodLabel}"`)
    out.push(header.join(','))

    // 総合計
    const grand = { open:0, pd:0, pc:0, close:0 }

    for (const type of TYPE_ORDER) {
      const inType = accounts.filter((a: any) => a.type === type)
      if (!inType.length) continue
      const sub = { open:0, pd:0, pc:0, close:0 }

      for (const a of inType) {
        const ag = agg.get(a.code)!
        out.push([a.code, a.name, TYPE_LABELS[type], ag.opening, ag.periodDebit, ag.periodCredit, ag.closing].map(esc).join(','))
        sub.open += ag.opening; sub.pd += ag.periodDebit; sub.pc += ag.periodCredit; sub.close += ag.closing
      }
      // カテゴリ合計行
      out.push(['', `【${TYPE_LABELS[type]} 合計】`, '', sub.open, sub.pd, sub.pc, sub.close].map(esc).join(','))
      grand.open += sub.open; grand.pd += sub.pd; grand.pc += sub.pc; grand.close += sub.close
    }

    // 総合計行
    out.push(['', '《総合計》', '', grand.open, grand.pd, grand.pc, grand.close].map(esc).join(','))

    const bom = '﻿'
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="trial-balance.csv"')
    res.send(bom + out.join('\r\n'))
  } catch (e) { next(e) }
})

// バックアップ：全データをJSON出力（journals に lines をネスト）
exportRouter.get('/backup.json', async (req, res, next) => {
  try {
    const [accounts]    = await pool.query('SELECT * FROM accounts WHERE user_id = ? ORDER BY code', [req.userId]) as any
    const [partners]    = await pool.query('SELECT * FROM partners WHERE user_id = ? ORDER BY code', [req.userId]) as any
    const [subAccounts] = await pool.query('SELECT * FROM sub_accounts WHERE user_id = ? ORDER BY account_code, code', [req.userId]) as any
    const [jRows]       = await pool.query('SELECT * FROM journals WHERE user_id = ? ORDER BY date, id', [req.userId]) as any
    const [fiscalYears] = await pool.query('SELECT * FROM fiscal_years WHERE user_id = ? ORDER BY start_date', [req.userId]) as any
    const [fixedAssets] = await pool.query('SELECT * FROM fixed_assets WHERE user_id = ? ORDER BY acquisition_date, id', [req.userId]) as any

    let journals: any[] = []
    if (jRows.length) {
      const ids = jRows.map((r: any) => r.id)
      const [lRows] = await pool.query('SELECT * FROM journal_lines WHERE journal_id IN (?) ORDER BY id', [ids]) as any
      const linesByJournal = new Map<number, any[]>()
      for (const r of lRows) {
        if (!linesByJournal.has(r.journal_id)) linesByJournal.set(r.journal_id, [])
        linesByJournal.get(r.journal_id)!.push(r)
      }
      journals = jRows.map((r: any) => ({ ...r, lines: linesByJournal.get(r.id) ?? [] }))
    }

    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="accounting-backup-${new Date().toISOString().slice(0,10)}.json"`)
    res.json({ exportedAt: new Date().toISOString(), accounts, partners, subAccounts, journals, fiscalYears, fixedAssets })
  } catch (e) { next(e) }
})
