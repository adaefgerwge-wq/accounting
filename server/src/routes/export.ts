import { Router } from 'express'
import { pool } from '../db.js'
import { mapAccount, mapJournal } from '../mappers.js'

export const exportRouter = Router()

// CSV出力：仕訳帳
exportRouter.get('/journals.csv', async (req, res, next) => {
  try {
    const { fiscalYearId } = req.query
    const where = fiscalYearId ? 'WHERE fiscal_year_id = ?' : ''
    const params = fiscalYearId ? [fiscalYearId] : []
    const [rows] = await pool.query(`SELECT * FROM journals ${where} ORDER BY date, id`, params)
    const journals = (rows as Parameters<typeof mapJournal>[0][]).map(mapJournal)

    const [accRows] = await pool.query('SELECT * FROM accounts ORDER BY code')
    const accounts = (accRows as Parameters<typeof mapAccount>[0][]).map(mapAccount)
    const accMap = new Map(accounts.map(a => [a.code, a.name]))

    const [partRows] = await pool.query('SELECT code, name FROM partners') as any
    const partMap = new Map((partRows as any[]).map((p: any) => [p.code, p.name]))

    const TAX_LABELS: Record<string, string> = {
      none: '対象外', taxable10: '課税10%', taxable8: '軽減8%', exempt: '非課税', non_taxable: '不課税'
    }

    const header = ['ID', '会計年度ID', '日付', '借方科目', '借方科目名', '借方補助', '貸方科目', '貸方科目名', '貸方補助', '金額', '消費税区分', '摘要']
    const csvRows = journals.map(j => [
      j.id, j.fiscalYearId, j.date,
      j.debit, accMap.get(j.debit) ?? '', partMap.get(j.debitPartner) ?? '',
      j.credit, accMap.get(j.credit) ?? '', partMap.get(j.creditPartner) ?? '',
      j.amount, TAX_LABELS[j.taxType] ?? j.taxType, j.memo
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))

    const bom = '\uFEFF'
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="journals.csv"')
    res.send(bom + [header.join(','), ...csvRows].join('\r\n'))
  } catch (e) { next(e) }
})

// CSV出力：試算表
exportRouter.get('/trial-balance.csv', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM accounts ORDER BY code')
    const accounts = (rows as Parameters<typeof mapAccount>[0][]).map(mapAccount)

    const header = ['コード', '科目名', '区分', '借方残高', '貸方残高']
    const TYPE_LABELS: Record<string, string> = { asset:'資産', liability:'負債', equity:'純資産', revenue:'収益', expense:'費用' }
    const csvRows = accounts.map(a => {
      const isDebitNormal = ['asset','expense'].includes(a.type)
      const debit  = isDebitNormal ? a.balance : 0
      const credit = isDebitNormal ? 0 : a.balance
      return [a.code, a.name, TYPE_LABELS[a.type], debit, credit]
        .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    })

    const bom = '\uFEFF'
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="trial-balance.csv"')
    res.send(bom + [header.join(','), ...csvRows].join('\r\n'))
  } catch (e) { next(e) }
})

// バックアップ：全データをJSON出力
exportRouter.get('/backup.json', async (_req, res, next) => {
  try {
    const [accounts]    = await pool.query('SELECT * FROM accounts ORDER BY code')
    const [partners]    = await pool.query('SELECT * FROM partners ORDER BY code')
    const [journals]    = await pool.query('SELECT * FROM journals ORDER BY date, id')
    const [fiscalYears] = await pool.query('SELECT * FROM fiscal_years ORDER BY start_date')
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="accounting-backup-${new Date().toISOString().slice(0,10)}.json"`)
    res.json({ exportedAt: new Date().toISOString(), accounts, partners, journals, fiscalYears })
  } catch (e) { next(e) }
})
