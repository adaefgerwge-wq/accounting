import { Router } from 'express'
import { pool } from '../db.js'
import { mapAccount, mapJournal, mapJournalLine } from '../mappers.js'
import { balanceSign } from '../balance.js'

export const exportRouter = Router()

const TAX_LABELS: Record<string, string> = {
  none: '対象外', taxable10: '課税10%', taxable8: '軽減8%', exempt: '非課税', non_taxable: '不課税'
}

// CSV出力：仕訳帳
exportRouter.get('/journals.csv', async (req, res, next) => {
  try {
    const { fiscalYearId } = req.query
    const where = fiscalYearId ? 'WHERE fiscal_year_id = ?' : ''
    const params = fiscalYearId ? [fiscalYearId] : []
    const [jRows] = await pool.query(`SELECT * FROM journals ${where} ORDER BY date, id`, params) as any

    const [accRows] = await pool.query('SELECT * FROM accounts ORDER BY code') as any
    const accounts = accRows.map(mapAccount)
    const accMap = new Map(accounts.map((a: any) => [a.code, a.name]))
    const [partRows] = await pool.query('SELECT code, name FROM partners') as any
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
      const [fyRows] = await pool.query('SELECT * FROM fiscal_years WHERE id = ?', [fiscalYearId]) as any
      if (fyRows[0]) {
        startDate = String(fyRows[0].start_date).slice(0,10)
        endDate   = String(fyRows[0].end_date).slice(0,10)
        periodLabel = `${fyRows[0].name}（${startDate} 〜 ${endDate}）`
      }
    }

    const [accRows] = await pool.query('SELECT * FROM accounts ORDER BY code') as any
    const accounts = accRows.map(mapAccount)
    const typeOf = new Map<string, string>(accounts.map((a: any) => [a.code, a.type]))

    // 全仕訳明細を日付付きで取得
    const [lineRows] = await pool.query(`
      SELECT jl.account_code, jl.side, jl.amount, j.date
      FROM journal_lines jl
      JOIN journals j ON jl.journal_id = j.id
    `) as any

    // 科目ごとに 期首残高(符号付)・期中借方・期中貸方・期末残高(符号付) を集計
    type Agg = { openingSigned: number; periodDebit: number; periodCredit: number; closingSigned: number }
    const agg = new Map<string, Agg>()
    for (const a of accounts) agg.set(a.code, { openingSigned: 0, periodDebit: 0, periodCredit: 0, closingSigned: 0 })

    for (const l of lineRows) {
      const d = String(l.date).slice(0,10)
      const type = typeOf.get(l.account_code)
      if (!agg.has(l.account_code)) agg.set(l.account_code, { openingSigned: 0, periodDebit: 0, periodCredit: 0, closingSigned: 0 })
      const a = agg.get(l.account_code)!
      const delta = l.amount * balanceSign(type, l.side)

      // 期首：開始日より前の仕訳
      if (startDate && d < startDate) {
        a.openingSigned += delta
        a.closingSigned += delta
        continue
      }
      // 期末より後の仕訳は集計しない（年度指定時）
      if (endDate && d > endDate) continue

      // 期中：期間内の仕訳
      if (l.side === 'debit') a.periodDebit += l.amount
      else                    a.periodCredit += l.amount
      a.closingSigned += delta
    }

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
        out.push([a.code, a.name, TYPE_LABELS[type], ag.openingSigned, ag.periodDebit, ag.periodCredit, ag.closingSigned].map(esc).join(','))
        sub.open += ag.openingSigned; sub.pd += ag.periodDebit; sub.pc += ag.periodCredit; sub.close += ag.closingSigned
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
exportRouter.get('/backup.json', async (_req, res, next) => {
  try {
    const [accounts]    = await pool.query('SELECT * FROM accounts ORDER BY code') as any
    const [partners]    = await pool.query('SELECT * FROM partners ORDER BY code') as any
    const [jRows]       = await pool.query('SELECT * FROM journals ORDER BY date, id') as any
    const [fiscalYears] = await pool.query('SELECT * FROM fiscal_years ORDER BY start_date') as any

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
    res.json({ exportedAt: new Date().toISOString(), accounts, partners, journals, fiscalYears })
  } catch (e) { next(e) }
})
