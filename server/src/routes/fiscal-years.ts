import { Router } from 'express'
import { pool } from '../db.js'
import { mapFiscalYear } from '../mappers.js'
import { balanceSign } from '../balance.js'

export const fiscalYearsRouter = Router()

const CLOSING_MEMO = '決算振替仕訳'

// 全科目残高を journal_lines から再計算（conn 上のトランザクション内で実行）
async function recomputeBalances(conn: any) {
  await conn.query('UPDATE accounts SET balance = 0')
  const [accRows] = await conn.query('SELECT code, type FROM accounts') as any
  const typeOf = new Map<string, string>(accRows.map((r: any) => [r.code, r.type]))
  const [lines] = await conn.query('SELECT account_code, side, amount FROM journal_lines') as any
  const deltas = new Map<string, number>()
  for (const l of lines) {
    const d = l.amount * balanceSign(typeOf.get(l.account_code), l.side)
    deltas.set(l.account_code, (deltas.get(l.account_code) ?? 0) + d)
  }
  for (const [code, d] of deltas) {
    await conn.query('UPDATE accounts SET balance = balance + ? WHERE code = ?', [d, code])
  }
}

const allFiscalYears = async (conn: any = pool) => {
  const [rows] = await conn.query('SELECT * FROM fiscal_years ORDER BY start_date DESC')
  return (rows as Parameters<typeof mapFiscalYear>[0][]).map(mapFiscalYear)
}

fiscalYearsRouter.get('/', async (_req, res, next) => {
  try { res.json(await allFiscalYears()) } catch (e) { next(e) }
})

fiscalYearsRouter.post('/', async (req, res, next) => {
  const { name, startDate, endDate } = req.body
  if (!name || !startDate || !endDate) { res.status(400).json({ message: '必須項目が不足しています' }); return }
  try {
    await pool.query('INSERT INTO fiscal_years (name, start_date, end_date) VALUES (?, ?, ?)', [name, startDate, endDate])
    res.status(201).json(await allFiscalYears())
  } catch (e) { next(e) }
})

// 決算処理：損益振替仕訳を作成し、年度を締める
fiscalYearsRouter.put('/:id/close', async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [fyRows] = await conn.query('SELECT * FROM fiscal_years WHERE id = ?', [req.params.id]) as any
    const fy = fyRows[0]
    if (!fy) { await conn.rollback(); res.status(404).json({ message: '会計年度が見つかりません' }); return }
    if (fy.closed) { await conn.rollback(); res.status(400).json({ message: '既に締め済みです' }); return }

    const endDate = String(fy.end_date).slice(0, 10)

    // 損益科目（収益・費用）の年度末時点の残高を集計
    const [accRows] = await conn.query("SELECT code, type FROM accounts WHERE type IN ('revenue','expense','equity')") as any
    const typeOf = new Map<string, string>(accRows.map((r: any) => [r.code, r.type]))
    const [lineRows] = await conn.query(
      `SELECT jl.account_code, jl.side, jl.amount
       FROM journal_lines jl JOIN journals j ON jl.journal_id = j.id
       WHERE j.date <= ?`, [endDate]
    ) as any

    const plBalance = new Map<string, number>() // 正常残高側を正
    for (const l of lineRows) {
      const t = typeOf.get(l.account_code)
      if (t !== 'revenue' && t !== 'expense') continue
      const d = l.amount * balanceSign(t, l.side)
      plBalance.set(l.account_code, (plBalance.get(l.account_code) ?? 0) + d)
    }

    // 振替先：利益剰余金（3020優先、無ければ任意のequity）
    const [reRows] = await conn.query(
      "SELECT code FROM accounts WHERE type='equity' AND (code='3020' OR name LIKE '%利益剰余金%') ORDER BY (code='3020') DESC LIMIT 1"
    ) as any
    const reCode = reRows[0]?.code
    if (!reCode) { await conn.rollback(); res.status(400).json({ message: '利益剰余金（純資産）科目が見つかりません' }); return }

    // 振替明細を構築：収益は借方、費用は貸方で打ち消し、差額を利益剰余金へ
    const lines: { side: 'debit'|'credit'; code: string; amount: number }[] = []
    let revenueTotal = 0, expenseTotal = 0
    for (const [code, bal] of plBalance) {
      if (bal === 0) continue
      const t = typeOf.get(code)
      if (t === 'revenue') { lines.push({ side: 'debit',  code, amount: bal }); revenueTotal  += bal }
      else                 { lines.push({ side: 'credit', code, amount: bal }); expenseTotal  += bal }
    }
    const net = revenueTotal - expenseTotal // 当期純利益（プラス=黒字）
    if (net > 0)      lines.push({ side: 'credit', code: reCode, amount: net })
    else if (net < 0) lines.push({ side: 'debit',  code: reCode, amount: -net })

    // 損益がある場合のみ振替仕訳を作成
    if (lines.length > 0) {
      const [result] = await conn.query(
        'INSERT INTO journals (fiscal_year_id, date, memo) VALUES (?, ?, ?)',
        [fy.id, endDate, `${CLOSING_MEMO}（当期純利益 ${net.toLocaleString()}）`]
      ) as any
      const jid = result.insertId
      await conn.query(
        'INSERT INTO journal_lines (journal_id, side, account_code, partner_code, amount, tax_type) VALUES ?',
        [lines.map(l => [jid, l.side, l.code, '', l.amount, 'none'])]
      )
    }

    await conn.query('UPDATE fiscal_years SET closed = 1 WHERE id = ?', [fy.id])
    await recomputeBalances(conn)
    await conn.commit()
    res.json({ message: `決算処理が完了しました（当期純利益: ${net.toLocaleString()} 円）`, fiscalYears: await allFiscalYears(conn) })
  } catch (e) { await conn.rollback(); next(e) } finally { conn.release() }
})

// 決算取消：損益振替仕訳を削除し、締めを解除
fiscalYearsRouter.put('/:id/reopen', async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    await conn.query(
      'DELETE FROM journals WHERE fiscal_year_id = ? AND memo LIKE ?',
      [req.params.id, `${CLOSING_MEMO}%`]
    )
    await conn.query('UPDATE fiscal_years SET closed = 0 WHERE id = ?', [req.params.id])
    await recomputeBalances(conn)
    await conn.commit()
    res.json({ message: '決算を取り消しました', fiscalYears: await allFiscalYears(conn) })
  } catch (e) { await conn.rollback(); next(e) } finally { conn.release() }
})

fiscalYearsRouter.delete('/:id', async (req, res, next) => {
  try {
    const [journals] = await pool.query('SELECT COUNT(*) AS count FROM journals WHERE fiscal_year_id = ?', [req.params.id]) as any
    if (journals[0].count > 0) { res.status(400).json({ message: 'この会計年度に仕訳があるため削除できません' }); return }
    await pool.query('DELETE FROM fiscal_years WHERE id = ?', [req.params.id])
    res.json(await allFiscalYears())
  } catch (e) { next(e) }
})
