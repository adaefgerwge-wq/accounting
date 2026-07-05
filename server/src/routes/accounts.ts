import { Router } from 'express'
import { pool } from '../db.js'
import { mapAccount } from '../mappers.js'
import type { Account } from '../types.js'

export const accountsRouter = Router()

async function allAccounts(userId: number, conn: any = pool) {
  const [rows] = await conn.query('SELECT * FROM accounts WHERE user_id = ? ORDER BY code', [userId])
  return (rows as Parameters<typeof mapAccount>[0][]).map(mapAccount)
}

// この科目コードを参照している仕訳明細の件数
async function journalLineRefs(conn: any, userId: number, code: string): Promise<number> {
  const [rows] = await conn.query(
    'SELECT COUNT(*) AS c FROM journal_lines jl JOIN journals j ON jl.journal_id = j.id WHERE j.user_id = ? AND jl.account_code = ?',
    [userId, code]
  ) as any
  return rows[0].c
}

accountsRouter.get('/', async (req, res, next) => {
  try { res.json(await allAccounts(req.userId)) } catch (error) { next(error) }
})

accountsRouter.post('/', async (req, res, next) => {
  const account = req.body as Account
  if (!account.code?.trim() || !account.name?.trim()) {
    res.status(400).json({ message: 'コードと科目名を入力してください' }); return
  }
  try {
    // balance はサーバー管理（仕訳から導出）。クライアントの値は受け付けない。
    await pool.query(
      'INSERT INTO accounts (user_id, code, name, type, balance, has_sub, default_tax_type) VALUES (?, ?, ?, ?, 0, ?, ?)',
      [req.userId, account.code.trim(), account.name.trim(), account.type, account.hasSub, account.defaultTaxType ?? 'none']
    )
    res.status(201).json(await allAccounts(req.userId))
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') { res.status(409).json({ message: '同じコードの科目が既に存在します' }); return }
    next(error)
  }
})

accountsRouter.put('/:code', async (req, res, next) => {
  const account = req.body as Account
  const oldCode = req.params.code
  const newCode = account.code?.trim()
  if (!newCode || !account.name?.trim()) {
    res.status(400).json({ message: 'コードと科目名を入力してください' }); return
  }
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query('SELECT * FROM accounts WHERE code = ? AND user_id = ? FOR UPDATE', [oldCode, req.userId]) as any
    if (!rows.length) {
      await conn.rollback(); res.status(404).json({ message: '科目が見つかりません' }); return
    }
    const current = rows[0]

    // 仕訳で使用中の科目は区分変更を禁止（過去仕訳の貸借の意味が変わり残高が壊れるため）
    const refs = await journalLineRefs(conn, req.userId, oldCode)
    if (refs > 0 && account.type !== current.type) {
      await conn.rollback()
      res.status(400).json({ message: `この科目は${refs}件の仕訳で使用されているため、区分は変更できません` })
      return
    }

    // balance はクライアントから受け取らない（現在値を維持）
    await conn.query(
      'UPDATE accounts SET code = ?, name = ?, type = ?, has_sub = ?, default_tax_type = ? WHERE code = ? AND user_id = ?',
      [newCode, account.name.trim(), account.type, account.hasSub, account.defaultTaxType ?? 'none', oldCode, req.userId]
    )

    // コード変更時は参照先（仕訳明細・取引先・補助科目・銀行ルール）を追随更新する
    if (newCode !== oldCode) {
      await conn.query(
        'UPDATE journal_lines jl JOIN journals j ON jl.journal_id = j.id SET jl.account_code = ? WHERE j.user_id = ? AND jl.account_code = ?',
        [newCode, req.userId, oldCode]
      )
      await conn.query('UPDATE partners SET account_code = ? WHERE user_id = ? AND account_code = ?', [newCode, req.userId, oldCode])
      await conn.query('UPDATE sub_accounts SET account_code = ? WHERE user_id = ? AND account_code = ?', [newCode, req.userId, oldCode])
      await conn.query('UPDATE bank_rules SET debit_code = ? WHERE user_id = ? AND debit_code = ?', [newCode, req.userId, oldCode])
      await conn.query('UPDATE bank_rules SET credit_code = ? WHERE user_id = ? AND credit_code = ?', [newCode, req.userId, oldCode])
    }

    await conn.commit()
    res.json(await allAccounts(req.userId))
  } catch (error: any) {
    await conn.rollback()
    if (error?.code === 'ER_DUP_ENTRY') { res.status(409).json({ message: '同じコードの科目が既に存在します' }); return }
    next(error)
  } finally { conn.release() }
})

accountsRouter.delete('/:code', async (req, res, next) => {
  const code = req.params.code
  try {
    const refs = await journalLineRefs(pool, req.userId, code)
    if (refs > 0) {
      res.status(400).json({ message: `この科目は${refs}件の仕訳で使用されているため削除できません` }); return
    }
    const [partnerRefs] = await pool.query('SELECT COUNT(*) AS c FROM partners WHERE user_id = ? AND account_code = ?', [req.userId, code]) as any
    const [subRefs]     = await pool.query('SELECT COUNT(*) AS c FROM sub_accounts WHERE user_id = ? AND account_code = ?', [req.userId, code]) as any
    const [ruleRefs]    = await pool.query('SELECT COUNT(*) AS c FROM bank_rules WHERE user_id = ? AND (debit_code = ? OR credit_code = ?)', [req.userId, code, code]) as any
    if (partnerRefs[0].c > 0 || subRefs[0].c > 0 || ruleRefs[0].c > 0) {
      res.status(400).json({ message: 'この科目は取引先・補助科目・銀行取込ルールから参照されているため削除できません' }); return
    }
    await pool.query('DELETE FROM accounts WHERE code = ? AND user_id = ?', [code, req.userId])
    res.json(await allAccounts(req.userId))
  } catch (error) { next(error) }
})
