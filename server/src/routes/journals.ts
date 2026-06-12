import { Router } from 'express'
import { pool } from '../db.js'
import { mapAccount, mapJournal, mapJournalLine } from '../mappers.js'
import type { Journal, JournalLine } from '../types.js'
import { planTax, calcTax } from '../tax.js'
import { balanceSign } from '../balance.js'

export const journalsRouter = Router()

async function getTaxMethod(): Promise<'inclusive' | 'exclusive'> {
  const [rows] = await pool.query("SELECT value FROM settings WHERE key_name = 'tax_method'") as any
  return rows[0]?.value === 'exclusive' ? 'exclusive' : 'inclusive'
}

// journal_lines 全件を取得して Journal[] に組み立てる
async function fetchJournals(conn?: any): Promise<Journal[]> {
  const q = conn ?? pool
  const [jRows] = await q.query('SELECT * FROM journals ORDER BY date DESC, id DESC') as any
  if (!jRows.length) return []
  const ids = jRows.map((r: any) => r.id)
  const [lRows] = await q.query('SELECT * FROM journal_lines WHERE journal_id IN (?) ORDER BY id', [ids]) as any
  const linesByJournal = new Map<number, JournalLine[]>()
  for (const r of lRows) {
    const l = mapJournalLine(r)
    if (!linesByJournal.has(l.journalId)) linesByJournal.set(l.journalId, [])
    linesByJournal.get(l.journalId)!.push(l)
  }
  return jRows.map((r: any) => mapJournal(r, linesByJournal.get(r.id) ?? []))
}

async function readState(conn?: any) {
  const q = conn ?? pool
  const [accountRows] = await q.query('SELECT * FROM accounts ORDER BY code') as any
  return {
    accounts: accountRows.map(mapAccount),
    journals: await fetchJournals(conn),
  }
}

// 税抜モード：課税行を税抜金額に分割し、消費税行を追加して返す
async function splitTaxLines(lines: Omit<JournalLine,'id'|'journalId'>[], conn: any): Promise<Omit<JournalLine,'id'|'journalId'>[]> {
  const result: Omit<JournalLine,'id'|'journalId'>[] = []
  for (const line of lines) {
    const { taxAmount } = calcTax(line.amount, line.taxType)
    if (!taxAmount) { result.push(line); continue }

    const [accRows] = await conn.query('SELECT type FROM accounts WHERE code = ?', [line.accountCode]) as any
    const accType = accRows[0]?.type as string | undefined
    const plan = planTax(
      line.side === 'debit'  ? line.accountCode : '__other__',
      line.side === 'credit' ? line.accountCode : '__other__',
      line.side === 'debit'  ? accType : undefined,
      line.side === 'credit' ? accType : undefined,
      line.taxType, line.amount
    )
    if (!plan) { result.push(line); continue }

    // 課税行を税抜金額に補正
    result.push({ ...line, amount: line.amount - taxAmount })
    // 消費税行を追加（仮受 or 仮払）
    result.push({
      side: line.side,
      accountCode: plan.taxCode,
      partnerCode: '',
      amount: taxAmount,
      taxType: 'none',
    })
  }
  return result
}

// 残高に lines の増減を適用（sign=1で加算、-1で逆算）
async function applyLines(conn: any, lines: Pick<JournalLine, 'side'|'accountCode'|'amount'>[], sign: 1|-1) {
  const codes = [...new Set(lines.map(l => l.accountCode))]
  const [rows] = await conn.query('SELECT code, type FROM accounts WHERE code IN (?)', [codes]) as any
  const typeOf = new Map<string, string>(rows.map((r: any) => [r.code, r.type]))
  for (const l of lines) {
    const delta = l.amount * sign * balanceSign(typeOf.get(l.accountCode), l.side)
    await conn.query('UPDATE accounts SET balance = balance + ? WHERE code = ?', [delta, l.accountCode])
  }
}

async function validateJournalInput(body: any, fiscalYearId: number, date: string, memo: string, lines: any[]) {
  const errors: string[] = []
  if (!date) errors.push('日付を入力してください')
  if (!lines || lines.length < 2) errors.push('明細行は2行以上必要です')

  const debitTotal  = lines.filter((l: any) => l.side === 'debit') .reduce((s: number, l: any) => s + (l.amount||0), 0)
  const creditTotal = lines.filter((l: any) => l.side === 'credit').reduce((s: number, l: any) => s + (l.amount||0), 0)
  if (debitTotal !== creditTotal) errors.push(`借方合計(${debitTotal.toLocaleString()})と貸方合計(${creditTotal.toLocaleString()})が一致しません`)
  if (lines.some((l: any) => !l.amount || l.amount <= 0)) errors.push('金額は正の数を入力してください')
  if (lines.some((l: any) => !l.accountCode)) errors.push('すべての行に科目を指定してください')

  const codes = [...new Set(lines.map((l: any) => l.accountCode as string))]
  const [accRows] = await pool.query('SELECT code, name, has_sub FROM accounts WHERE code IN (?)', [codes]) as any
  const accMap = new Map<string, any>(accRows.map((a: any) => [a.code, a]))
  // 補助科目の候補（取引先＋汎用補助科目）が存在する科目コードの集合
  const [subRows] = codes.length
    ? await pool.query(
        'SELECT account_code FROM partners WHERE account_code IN (?) UNION SELECT account_code FROM sub_accounts WHERE account_code IN (?)',
        [codes, codes]
      ) as any
    : [[]]
  const hasCandidates = new Set<string>((subRows as any[]).map((r: any) => r.account_code))
  for (const l of lines) {
    if (!accMap.has(l.accountCode)) { errors.push(`科目コード ${l.accountCode} が見つかりません`); continue }
    const acc = accMap.get(l.accountCode)!
    // 候補が1件以上ある場合のみ補助科目を必須にする（候補ゼロなら任意）
    if (acc.has_sub && hasCandidates.has(l.accountCode) && !l.partnerCode) {
      errors.push(`${acc.name}の補助科目（取引先）を指定してください`)
    }
  }

  if (fiscalYearId) {
    const [fyRows] = await pool.query('SELECT start_date, end_date, closed FROM fiscal_years WHERE id = ?', [fiscalYearId]) as any
    if (fyRows.length) {
      const fy = fyRows[0]
      if (fy.closed) errors.push('この会計年度は締め済みです')
      if (date < String(fy.start_date).slice(0,10) || date > String(fy.end_date).slice(0,10))
        errors.push('日付が会計年度の範囲外です')
    }
  }
  return errors
}

journalsRouter.get('/', async (_req, res, next) => {
  try { res.json(await fetchJournals()) } catch (e) { next(e) }
})

journalsRouter.post('/', async (req, res, next) => {
  const { fiscalYearId, date, memo, lines } = req.body
  const conn = await pool.getConnection()
  try {
    const errors = await validateJournalInput(req.body, fiscalYearId, date, memo, lines)
    if (errors.length) { res.status(400).json({ message: errors.join('\n') }); return }

    const taxMethod = await getTaxMethod()
    await conn.beginTransaction()

    const [result] = await conn.query(
      'INSERT INTO journals (fiscal_year_id, date, memo) VALUES (?,?,?)',
      [fiscalYearId ?? 1, date, memo ?? '']
    ) as any
    const journalId = result.insertId

    const finalLines = taxMethod === 'exclusive' ? await splitTaxLines(lines, conn) : lines
    if (finalLines.length) {
      await conn.query(
        'INSERT INTO journal_lines (journal_id, side, account_code, partner_code, amount, tax_type) VALUES ?',
        [finalLines.map((l: any) => [journalId, l.side, l.accountCode, l.partnerCode ?? '', l.amount, l.taxType ?? 'none'])]
      )
    }
    await applyLines(conn, finalLines, 1)
    await conn.commit()
    res.status(201).json(await readState())
  } catch (e) { await conn.rollback(); next(e) } finally { conn.release() }
})

journalsRouter.put('/:id', async (req, res, next) => {
  const { fiscalYearId, date, memo, lines } = req.body
  const conn = await pool.getConnection()
  try {
    const errors = await validateJournalInput(req.body, fiscalYearId, date, memo, lines)
    if (errors.length) { res.status(400).json({ message: errors.join('\n') }); return }

    const taxMethod = await getTaxMethod()
    await conn.beginTransaction()

    // 旧 lines を取得して残高を逆算
    const [oldLineRows] = await conn.query('SELECT * FROM journal_lines WHERE journal_id = ?', [req.params.id]) as any
    const oldLines = oldLineRows.map(mapJournalLine)
    await applyLines(conn, oldLines, -1)

    // ヘッダー更新 + 旧 lines 削除（CASCADE で消える）+ 新 lines 挿入
    await conn.query('UPDATE journals SET fiscal_year_id=?, date=?, memo=? WHERE id=?',
      [fiscalYearId ?? 1, date, memo ?? '', req.params.id])
    await conn.query('DELETE FROM journal_lines WHERE journal_id = ?', [req.params.id])

    const finalLines = taxMethod === 'exclusive' ? await splitTaxLines(lines, conn) : lines
    if (finalLines.length) {
      await conn.query(
        'INSERT INTO journal_lines (journal_id, side, account_code, partner_code, amount, tax_type) VALUES ?',
        [finalLines.map((l: any) => [req.params.id, l.side, l.accountCode, l.partnerCode ?? '', l.amount, l.taxType ?? 'none'])]
      )
    }
    await applyLines(conn, finalLines, 1)
    await conn.commit()
    res.json(await readState())
  } catch (e) { await conn.rollback(); next(e) } finally { conn.release() }
})

journalsRouter.delete('/:id', async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [lineRows] = await conn.query('SELECT * FROM journal_lines WHERE journal_id = ?', [req.params.id]) as any
    await applyLines(conn, lineRows.map(mapJournalLine), -1)
    await conn.query('DELETE FROM journals WHERE id = ?', [req.params.id]) // CASCADE で lines も削除
    await conn.commit()
    res.json(await readState())
  } catch (e) { await conn.rollback(); next(e) } finally { conn.release() }
})
