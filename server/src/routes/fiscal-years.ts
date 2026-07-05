import { Router } from 'express'
import { pool } from '../db.js'
import { mapFiscalYear } from '../mappers.js'
import { balanceSign } from '../balance.js'
import { buildProfitTransferLines, type PlBalance } from '../domain/closing.js'
import { buildTaxSettlementLines } from '../domain/tax-settlement.js'
import { depreciationForPeriod } from '../domain/depreciation.js'
import { insertJournal, ensureAccount, recomputeBalances, STD_CODES } from '../journal-service.js'

export const fiscalYearsRouter = Router()

const allFiscalYears = async (userId: number, conn: any = pool) => {
  const [rows] = await conn.query('SELECT * FROM fiscal_years WHERE user_id = ? ORDER BY start_date DESC', [userId])
  return (rows as Parameters<typeof mapFiscalYear>[0][]).map(mapFiscalYear)
}

fiscalYearsRouter.get('/', async (req, res, next) => {
  try { res.json(await allFiscalYears(req.userId)) } catch (e) { next(e) }
})

fiscalYearsRouter.post('/', async (req, res, next) => {
  const { name, startDate, endDate } = req.body
  if (!name || !startDate || !endDate) { res.status(400).json({ message: '必須項目が不足しています' }); return }
  if (startDate >= endDate) { res.status(400).json({ message: '開始日は終了日より前にしてください' }); return }
  try {
    // 期間が既存年度と重なる場合は拒否（仕訳の帰属が曖昧になるため）
    const [overlaps] = await pool.query(
      'SELECT name FROM fiscal_years WHERE user_id = ? AND start_date <= ? AND end_date >= ? LIMIT 1',
      [req.userId, endDate, startDate]
    ) as any
    if (overlaps.length) {
      res.status(400).json({ message: `期間が「${overlaps[0].name}」と重複しています` }); return
    }
    await pool.query('INSERT INTO fiscal_years (user_id, name, start_date, end_date) VALUES (?, ?, ?, ?)', [req.userId, name, startDate, endDate])
    res.status(201).json(await allFiscalYears(req.userId))
  } catch (e) { next(e) }
})

// 科目の期末残高（正常残高側を正）を種別指定で集計する
async function balancesAsOf(conn: any, userId: number, endDate: string, types: string[]) {
  const [accRows] = await conn.query(
    'SELECT code, type FROM accounts WHERE user_id = ? AND type IN (?)', [userId, types]
  ) as any
  const typeOf = new Map<string, string>(accRows.map((r: any) => [r.code, r.type]))
  const [lineRows] = await conn.query(
    `SELECT jl.account_code, jl.side, jl.amount
     FROM journal_lines jl JOIN journals j ON jl.journal_id = j.id
     WHERE j.user_id = ? AND j.date <= ?`, [userId, endDate]
  ) as any
  const balances = new Map<string, number>()
  for (const l of lineRows) {
    const t = typeOf.get(l.account_code)
    if (!t) continue
    const d = l.amount * balanceSign(t, l.side)
    balances.set(l.account_code, (balances.get(l.account_code) ?? 0) + d)
  }
  return { balances, typeOf }
}

/**
 * 決算処理：
 *  1. 減価償却費の計上（固定資産台帳から・決算整理仕訳）
 *  2. 消費税の整理（仮受・仮払の相殺 → 未払/未収還付消費税・決算整理仕訳）
 *  3. 損益振替（収益・費用 → 利益剰余金・決算振替仕訳）
 * を行い、年度を締める。
 */
fiscalYearsRouter.put('/:id/close', async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [fyRows] = await conn.query('SELECT * FROM fiscal_years WHERE id = ? AND user_id = ?', [req.params.id, req.userId]) as any
    const fy = fyRows[0]
    if (!fy) { await conn.rollback(); res.status(404).json({ message: '会計年度が見つかりません' }); return }
    if (fy.closed) { await conn.rollback(); res.status(400).json({ message: '既に締め済みです' }); return }

    const startDate = String(fy.start_date).slice(0, 10)
    const endDate   = String(fy.end_date).slice(0, 10)
    const notes: string[] = []

    // ── 1. 減価償却（定額法・月割） ──
    const [assetRows] = await conn.query('SELECT * FROM fixed_assets WHERE user_id = ?', [req.userId]) as any
    let depTotal = 0
    for (const a of assetRows) {
      depTotal += depreciationForPeriod(
        { acquisitionDate: String(a.acquisition_date).slice(0, 10), cost: a.cost, usefulLifeYears: a.useful_life },
        startDate, endDate,
      )
    }
    if (depTotal > 0) {
      await ensureAccount(conn, req.userId, STD_CODES.depreciationExpense, '減価償却費', 'expense')
      await ensureAccount(conn, req.userId, STD_CODES.accumulatedDep, '減価償却累計額', 'asset')
      await insertJournal(conn, req.userId, {
        fiscalYearId: fy.id, date: endDate, memo: '減価償却費計上（決算整理）', kind: 'adjusting',
        lines: [
          { side: 'debit',  accountCode: STD_CODES.depreciationExpense, partnerCode: '', amount: depTotal, taxType: 'none' },
          { side: 'credit', accountCode: STD_CODES.accumulatedDep,      partnerCode: '', amount: depTotal, taxType: 'none' },
        ],
      })
      notes.push(`減価償却費 ${depTotal.toLocaleString()}円`)
    }

    // ── 2. 消費税の決算整理 ──
    {
      const { balances } = await balancesAsOf(conn, req.userId, endDate, ['asset', 'liability'])
      const paid     = balances.get(STD_CODES.taxPaid) ?? 0
      const received = balances.get(STD_CODES.taxReceived) ?? 0
      const taxLines = buildTaxSettlementLines(paid, received, {
        paid: STD_CODES.taxPaid, received: STD_CODES.taxReceived,
        payable: STD_CODES.taxPayable, receivable: STD_CODES.taxReceivable,
      })
      if (taxLines.length) {
        await ensureAccount(conn, req.userId, STD_CODES.taxPayable, '未払消費税', 'liability')
        await ensureAccount(conn, req.userId, STD_CODES.taxReceivable, '未収還付消費税', 'asset')
        await insertJournal(conn, req.userId, {
          fiscalYearId: fy.id, date: endDate, memo: '消費税決算整理仕訳', kind: 'adjusting',
          lines: taxLines.map(l => ({ ...l, partnerCode: '', taxType: 'none' as const })),
        })
        const net = received - paid
        notes.push(net >= 0 ? `未払消費税 ${net.toLocaleString()}円` : `未収還付消費税 ${(-net).toLocaleString()}円`)
      }
    }

    // ── 3. 損益振替 ──
    // 振替先：利益剰余金（3020優先、無ければ名前で検索）
    const [reRows] = await conn.query(
      "SELECT code FROM accounts WHERE user_id = ? AND type='equity' AND (code=? OR name LIKE '%利益剰余金%') ORDER BY (code=?) DESC LIMIT 1",
      [req.userId, STD_CODES.retainedEarnings, STD_CODES.retainedEarnings]
    ) as any
    const reCode = reRows[0]?.code
    if (!reCode) { await conn.rollback(); res.status(400).json({ message: '利益剰余金（純資産）科目が見つかりません' }); return }

    // 償却費計上後の損益残高を集計（このトランザクション内の追加仕訳も含む）
    const { balances: plRaw, typeOf } = await balancesAsOf(conn, req.userId, endDate, ['revenue', 'expense'])
    const plBalances = new Map<string, PlBalance>()
    for (const [code, balance] of plRaw) {
      plBalances.set(code, { type: typeOf.get(code) as 'revenue' | 'expense', balance })
    }
    const { lines: transferLines, net } = buildProfitTransferLines(plBalances, reCode)
    if (transferLines.length) {
      await insertJournal(conn, req.userId, {
        fiscalYearId: fy.id, date: endDate,
        memo: `決算振替仕訳（当期純利益 ${net.toLocaleString()}）`, kind: 'closing',
        lines: transferLines.map(l => ({ ...l, partnerCode: '', taxType: 'none' as const })),
      })
    }

    await conn.query('UPDATE fiscal_years SET closed = 1 WHERE id = ? AND user_id = ?', [fy.id, req.userId])
    await recomputeBalances(conn, req.userId)
    await conn.commit()

    const detail = notes.length ? `、${notes.join('、')}` : ''
    res.json({
      message: `決算処理が完了しました（当期純利益: ${net.toLocaleString()} 円${detail}）`,
      fiscalYears: await allFiscalYears(req.userId),
    })
  } catch (e) { await conn.rollback(); next(e) } finally { conn.release() }
})

// 決算取消：決算整理・振替仕訳（kind で判定）を削除し、締めを解除
fiscalYearsRouter.put('/:id/reopen', async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    await conn.query(
      "DELETE FROM journals WHERE fiscal_year_id = ? AND user_id = ? AND kind IN ('adjusting','closing')",
      [req.params.id, req.userId]
    )
    await conn.query('UPDATE fiscal_years SET closed = 0 WHERE id = ? AND user_id = ?', [req.params.id, req.userId])
    await recomputeBalances(conn, req.userId)
    await conn.commit()
    res.json({ message: '決算を取り消しました', fiscalYears: await allFiscalYears(req.userId, conn) })
  } catch (e) { await conn.rollback(); next(e) } finally { conn.release() }
})

fiscalYearsRouter.delete('/:id', async (req, res, next) => {
  try {
    const [journals] = await pool.query('SELECT COUNT(*) AS count FROM journals WHERE fiscal_year_id = ? AND user_id = ?', [req.params.id, req.userId]) as any
    if (journals[0].count > 0) { res.status(400).json({ message: 'この会計年度に仕訳があるため削除できません' }); return }
    await pool.query('DELETE FROM fiscal_years WHERE id = ? AND user_id = ?', [req.params.id, req.userId])
    res.json(await allFiscalYears(req.userId))
  } catch (e) { next(e) }
})
