import { Router } from 'express'
import { pool } from '../db.js'

export const reportRouter = Router()

// 月次PL集計
reportRouter.get('/monthly', async (req, res, next) => {
  try {
    const { fiscalYearId } = req.query
    const where = fiscalYearId ? 'WHERE j.fiscal_year_id = ?' : ''
    const params = fiscalYearId ? [fiscalYearId] : []

    // 月ごとに借方・貸方の科目区分合計を集計
    const [rows] = await pool.query(`
      SELECT
        DATE_FORMAT(j.date, '%Y-%m') AS month,
        a.type                        AS account_type,
        SUM(CASE WHEN j.debit  = a.code THEN j.amount ELSE 0 END) AS debit_sum,
        SUM(CASE WHEN j.credit = a.code THEN j.amount ELSE 0 END) AS credit_sum
      FROM journals j
      JOIN accounts a ON a.code IN (j.debit, j.credit)
      ${where}
      GROUP BY month, a.type
      ORDER BY month
    `, params) as any

    // 月ごとに整理
    const monthMap: Record<string, Record<string, number>> = {}
    for (const row of rows) {
      const m = row.month
      if (!monthMap[m]) monthMap[m] = { revenue: 0, expense: 0, asset: 0, liability: 0, equity: 0 }
      if (row.account_type === 'revenue') monthMap[m].revenue += Number(row.credit_sum)
      if (row.account_type === 'expense') monthMap[m].expense += Number(row.debit_sum)
    }

    const result = Object.entries(monthMap).map(([month, v]) => ({
      month,
      revenue: v.revenue,
      expense: v.expense,
      profit:  v.revenue - v.expense,
    }))

    res.json(result)
  } catch (e) { next(e) }
})

// 科目別月次推移
reportRouter.get('/monthly-accounts', async (req, res, next) => {
  try {
    const { fiscalYearId, type } = req.query
    const conditions = ['1=1']
    const params: any[] = []
    if (fiscalYearId) { conditions.push('j.fiscal_year_id = ?'); params.push(fiscalYearId) }
    if (type)         { conditions.push('a.type = ?'); params.push(type) }

    const [rows] = await pool.query(`
      SELECT
        DATE_FORMAT(j.date, '%Y-%m') AS month,
        a.code, a.name, a.type,
        SUM(CASE WHEN j.debit  = a.code THEN j.amount ELSE 0 END) AS debit_sum,
        SUM(CASE WHEN j.credit = a.code THEN j.amount ELSE 0 END) AS credit_sum
      FROM journals j
      JOIN accounts a ON a.code IN (j.debit, j.credit)
      WHERE ${conditions.join(' AND ')}
      GROUP BY month, a.code, a.name, a.type
      ORDER BY month, a.code
    `, params) as any

    res.json(rows.map((r: any) => ({
      month: r.month, code: r.code, name: r.name, type: r.type,
      debitSum: Number(r.debit_sum), creditSum: Number(r.credit_sum),
    })))
  } catch (e) { next(e) }
})
