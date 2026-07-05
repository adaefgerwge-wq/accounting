import { Router } from 'express'
import { pool } from '../db.js'
import { aggregateBalances, type ReportLineRow } from '../domain/reporting.js'
import { summarizeTax, type TaxSummaryLine } from '../domain/tax-summary.js'
import { balanceSign } from '../balance.js'
import { STD_CODES } from '../journal-service.js'

export const reportRouter = Router()

async function getFiscalYear(userId: number, fiscalYearId: any) {
  if (!fiscalYearId) return null
  const [rows] = await pool.query('SELECT * FROM fiscal_years WHERE id = ? AND user_id = ?', [fiscalYearId, userId]) as any
  if (!rows.length) return null
  const fy = rows[0]
  return {
    id: fy.id, name: fy.name, closed: Boolean(fy.closed),
    startDate: String(fy.start_date).slice(0, 10),
    endDate: String(fy.end_date).slice(0, 10),
  }
}

async function fetchReportLines(userId: number): Promise<ReportLineRow[]> {
  const [rows] = await pool.query(
    `SELECT jl.account_code, jl.side, jl.amount, j.date, j.kind
     FROM journal_lines jl JOIN journals j ON jl.journal_id = j.id
     WHERE j.user_id = ?`, [userId]
  ) as any
  return rows.map((r: any) => ({
    accountCode: r.account_code, side: r.side, amount: r.amount,
    date: String(r.date).slice(0, 10), kind: r.kind ?? 'normal',
  }))
}

// 科目別の期首・期中・期末残高（BS/PL/試算表用）
// excludeClosing=1 で決算振替仕訳を除外（損益計算書向け）
reportRouter.get('/balances', async (req, res, next) => {
  try {
    const fy = await getFiscalYear(req.userId, req.query.fiscalYearId)
    const [accRows] = await pool.query('SELECT code, name, type FROM accounts WHERE user_id = ? ORDER BY code', [req.userId]) as any
    const lines = await fetchReportLines(req.userId)
    const rows = aggregateBalances(accRows, lines, {
      start: fy?.startDate, end: fy?.endDate,
      excludeClosing: req.query.excludeClosing === '1',
    })
    res.json({ fiscalYear: fy, rows })
  } catch (e) { next(e) }
})

// 税区分別の課税売上・課税仕入集計（消費税申告の下ごしらえ用）
reportRouter.get('/tax-summary', async (req, res, next) => {
  try {
    const fy = await getFiscalYear(req.userId, req.query.fiscalYearId)
    const [settingRows] = await pool.query(
      "SELECT value FROM settings WHERE key_name = 'tax_method' AND user_id = ?", [req.userId]
    ) as any
    const taxMethod: 'inclusive' | 'exclusive' = settingRows[0]?.value === 'exclusive' ? 'exclusive' : 'inclusive'

    const conds = ['j.user_id = ?', "j.kind = 'normal'"]
    const params: any[] = [req.userId, req.userId]
    if (fy) { conds.push('j.date >= ? AND j.date <= ?'); params.push(fy.startDate, fy.endDate) }

    const [rows] = await pool.query(
      `SELECT jl.id AS line_id, jl.journal_id, jl.side, jl.account_code, jl.amount, jl.tax_type, a.type AS account_type
       FROM journal_lines jl
       JOIN journals j ON jl.journal_id = j.id
       LEFT JOIN accounts a ON a.code = jl.account_code AND a.user_id = ?
       WHERE ${conds.join(' AND ')}`, params
    ) as any
    const lines: TaxSummaryLine[] = rows.map((r: any) => ({
      journalId: r.journal_id, lineId: r.line_id, side: r.side,
      accountCode: r.account_code, accountType: r.account_type ?? undefined,
      amount: r.amount, taxType: r.tax_type,
    }))
    const summary = summarizeTax(lines, taxMethod)

    // 仮払・仮受消費税の残高（期末時点）
    const [taxAccRows] = await pool.query(
      `SELECT jl.account_code, jl.side, jl.amount, a.type
       FROM journal_lines jl
       JOIN journals j ON jl.journal_id = j.id
       JOIN accounts a ON a.code = jl.account_code AND a.user_id = ?
       WHERE j.user_id = ? AND jl.account_code IN (?, ?)${fy ? ' AND j.date <= ?' : ''}`,
      fy
        ? [req.userId, req.userId, STD_CODES.taxPaid, STD_CODES.taxReceived, fy.endDate]
        : [req.userId, req.userId, STD_CODES.taxPaid, STD_CODES.taxReceived]
    ) as any
    let paid = 0, received = 0
    for (const r of taxAccRows) {
      const d = r.amount * balanceSign(r.type, r.side)
      if (r.account_code === STD_CODES.taxPaid) paid += d
      else received += d
    }

    res.json({ fiscalYear: fy, taxMethod, rows: summary, taxPaid: paid, taxReceived: received, estimatedPayment: received - paid })
  } catch (e) { next(e) }
})

// 月次PL集計
reportRouter.get('/monthly', async (req, res, next) => {
  try {
    const { fiscalYearId } = req.query
    // 決算振替仕訳を含めると締め済み年度の損益が0になるため除外する
    const cond = fiscalYearId ? 'AND j.fiscal_year_id = ?' : ''
    const params: any[] = [req.userId, req.userId]
    if (fiscalYearId) params.push(fiscalYearId)

    const [rows] = await pool.query(`
      SELECT
        DATE_FORMAT(j.date, '%Y-%m') AS month,
        a.type                        AS account_type,
        l.side,
        SUM(l.amount)                 AS total
      FROM journal_lines l
      JOIN journals j  ON j.id = l.journal_id
      JOIN accounts a  ON a.code = l.account_code AND a.user_id = ?
      WHERE j.user_id = ? AND j.kind != 'closing' ${cond}
      GROUP BY month, a.type, l.side
      ORDER BY month
    `, params) as any

    const monthMap: Record<string, { revenue: number; expense: number }> = {}
    for (const row of rows) {
      const m = row.month
      if (!monthMap[m]) monthMap[m] = { revenue: 0, expense: 0 }
      if (row.account_type === 'revenue' && row.side === 'credit') monthMap[m].revenue += Number(row.total)
      if (row.account_type === 'expense' && row.side === 'debit')  monthMap[m].expense += Number(row.total)
    }

    res.json(Object.entries(monthMap).map(([month, v]) => ({
      month, revenue: v.revenue, expense: v.expense, profit: v.revenue - v.expense,
    })))
  } catch (e) { next(e) }
})

// 科目別月次推移
reportRouter.get('/monthly-accounts', async (req, res, next) => {
  try {
    const { fiscalYearId, type } = req.query
    const params: any[] = [req.userId]
    const conditions = ['j.user_id = ?', "j.kind != 'closing'"]
    params.push(req.userId)
    if (fiscalYearId) { conditions.push('j.fiscal_year_id = ?'); params.push(fiscalYearId) }
    if (type)         { conditions.push('a.type = ?'); params.push(type) }

    const [rows] = await pool.query(`
      SELECT
        DATE_FORMAT(j.date, '%Y-%m') AS month,
        a.code, a.name, a.type,
        SUM(CASE WHEN l.side = 'debit'  THEN l.amount ELSE 0 END) AS debit_sum,
        SUM(CASE WHEN l.side = 'credit' THEN l.amount ELSE 0 END) AS credit_sum
      FROM journal_lines l
      JOIN journals j ON j.id = l.journal_id
      JOIN accounts a ON a.code = l.account_code AND a.user_id = ?
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
