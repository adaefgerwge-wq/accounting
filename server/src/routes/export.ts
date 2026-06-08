import { Router } from 'express'
import { pool } from '../db.js'
import { mapAccount, mapJournal, mapJournalLine } from '../mappers.js'

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
    const header = ['仕訳ID', '会計年度ID', '日付', '記入側', '科目コード', '科目名', '補助', '金額', '消費税区分', '摘要']
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
        jLines.forEach((l, i) => {
          const row = [
            jr.id, jr.fiscal_year_id,
            i === 0 ? date : '',
            l.side === 'debit' ? '借方' : '貸方',
            l.account_code, accMap.get(l.account_code) ?? '',
            partMap.get(l.partner_code) ?? '',
            l.amount,
            TAX_LABELS[l.tax_type] ?? l.tax_type,
            i === 0 ? jr.memo : '',
          ]
          lines.push(row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
        })
      }
    }

    const bom = '﻿'
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="journals.csv"')
    res.send(bom + lines.join('\r\n'))
  } catch (e) { next(e) }
})

// CSV出力：試算表
exportRouter.get('/trial-balance.csv', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM accounts ORDER BY code') as any
    const accounts = rows.map(mapAccount)
    const header = ['コード', '科目名', '区分', '借方残高', '貸方残高']
    const TYPE_LABELS: Record<string, string> = { asset:'資産', liability:'負債', equity:'純資産', revenue:'収益', expense:'費用' }
    const csvRows = accounts.map((a: any) => {
      const isDebitNormal = ['asset','expense'].includes(a.type)
      return [a.code, a.name, TYPE_LABELS[a.type], isDebitNormal ? a.balance : 0, isDebitNormal ? 0 : a.balance]
        .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    })
    const bom = '﻿'
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="trial-balance.csv"')
    res.send(bom + [header.join(','), ...csvRows].join('\r\n'))
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
