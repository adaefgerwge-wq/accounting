import { Router } from 'express'
import { pool } from '../db.js'
import { ensureOpeningJournal } from '../schema.js'
import { recomputeBalances } from '../journal-service.js'

export const restoreRouter = Router()

restoreRouter.post('/', async (req, res, next) => {
  const { accounts, partners, subAccounts, journals, fiscalYears, fixedAssets } = req.body
  if (!accounts || !partners || !journals || !fiscalYears) {
    res.status(400).json({ message: 'バックアップデータが不正です' }); return
  }
  const uid = req.userId
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    // このユーザーの既存データのみ削除（他ユーザーには影響させない）
    await conn.query('DELETE FROM journal_lines WHERE journal_id IN (SELECT id FROM journals WHERE user_id = ?)', [uid])
    await conn.query('DELETE FROM journals WHERE user_id = ?', [uid])
    await conn.query('DELETE FROM partners WHERE user_id = ?', [uid])
    await conn.query('DELETE FROM sub_accounts WHERE user_id = ?', [uid])
    await conn.query('DELETE FROM accounts WHERE user_id = ?', [uid])
    await conn.query('DELETE FROM fixed_assets WHERE user_id = ?', [uid])
    await conn.query('DELETE FROM fiscal_years WHERE user_id = ?', [uid])

    // 会計年度：id はグローバルなので再採番し、旧id→新id を対応付ける
    const fyIdMap = new Map<number, number>()
    let firstNewFyId: number | undefined
    for (const f of fiscalYears) {
      const [r] = await conn.query(
        'INSERT INTO fiscal_years (user_id, name, start_date, end_date, closed) VALUES (?,?,?,?,?)',
        [uid, f.name, f.start_date, f.end_date, f.closed ?? 0]
      ) as any
      fyIdMap.set(f.id, r.insertId)
      if (firstNewFyId === undefined) firstNewFyId = r.insertId
    }

    if (accounts.length) await conn.query(
      'INSERT INTO accounts (user_id, code, name, type, balance, has_sub, default_tax_type) VALUES ?',
      [accounts.map((a: any) => [uid, a.code, a.name, a.type, a.balance, a.has_sub, a.default_tax_type ?? 'none'])]
    )
    if (partners.length) await conn.query(
      'INSERT INTO partners (user_id, code, name, type, account_code) VALUES ?',
      [partners.map((p: any) => [uid, p.code, p.name, p.type, p.account_code])]
    )
    if (subAccounts?.length) await conn.query(
      'INSERT INTO sub_accounts (user_id, code, name, account_code) VALUES ?',
      [subAccounts.map((s: any) => [uid, s.code, s.name, s.account_code ?? s.accountCode])]
    )

    if (fixedAssets?.length) await conn.query(
      'INSERT INTO fixed_assets (user_id, name, acquisition_date, cost, useful_life, memo) VALUES ?',
      [fixedAssets.map((f: any) => [uid, f.name, f.acquisition_date ?? f.acquisitionDate, f.cost, f.useful_life ?? f.usefulLifeYears, f.memo ?? ''])]
    )

    // journals はネスト形式（lines を含む）または旧形式（debit/credit/amount）に対応。id は再採番。
    for (const j of journals) {
      const newFyId = fyIdMap.get(j.fiscal_year_id) ?? firstNewFyId ?? j.fiscal_year_id ?? 1
      const [r] = await conn.query(
        'INSERT INTO journals (user_id, fiscal_year_id, date, memo, kind) VALUES (?,?,?,?,?)',
        [uid, newFyId, j.date, j.memo ?? '', j.kind ?? 'normal']
      ) as any
      const newJid = r.insertId
      const lines: any[] = j.lines ?? []
      // 旧形式のバックアップ（lines がない場合）は debit/credit/amount から変換
      if (!lines.length && j.debit) {
        lines.push({ side: 'debit',  account_code: j.debit,  partner_code: j.debit_partner  ?? '', amount: j.amount, tax_type: j.tax_type ?? 'none' })
        lines.push({ side: 'credit', account_code: j.credit, partner_code: j.credit_partner ?? '', amount: j.amount, tax_type: 'none' })
      }
      if (lines.length) await conn.query(
        'INSERT INTO journal_lines (journal_id, side, account_code, partner_code, amount, tax_type) VALUES ?',
        [lines.map((l: any) => [newJid, l.side, l.account_code ?? l.accountCode, l.partner_code ?? l.partnerCode ?? '', l.amount, l.tax_type ?? l.taxType ?? 'none'])]
      )
    }

    // 旧形式バックアップ（開始残高が仕訳の裏付けなしに balance 列へ入っている）の場合は
    // 差分から開始仕訳を起票し、残高キャッシュを仕訳から再構築する
    await ensureOpeningJournal(conn, uid)
    await recomputeBalances(conn, uid)

    await conn.commit()
    res.json({ message: 'リストア完了', counts: { fiscalYears: fiscalYears.length, accounts: accounts.length, partners: partners.length, journals: journals.length } })
  } catch (e) { await conn.rollback(); next(e) } finally { conn.release() }
})
