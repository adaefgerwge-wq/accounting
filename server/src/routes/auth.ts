import { Router } from 'express'
import { pool } from '../db.js'
import { hashPassword, verifyPassword, signToken, requireAuth } from '../auth.js'
import { seedUserData } from '../schema.js'

export const authRouter = Router()

function publicUser(row: any) {
  return { id: row.id, email: row.email, name: row.name }
}

authRouter.post('/register', async (req, res, next) => {
  const { email, password, name } = req.body ?? {}
  if (!email || !password) {
    res.status(400).json({ message: 'メールアドレスとパスワードを入力してください' }); return
  }
  if (String(password).length < 6) {
    res.status(400).json({ message: 'パスワードは6文字以上にしてください' }); return
  }
  try {
    const [exists] = await pool.query('SELECT id FROM users WHERE email = ?', [email]) as any
    if (exists.length) {
      res.status(409).json({ message: 'このメールアドレスは既に登録されています' }); return
    }
    const hash = await hashPassword(String(password))
    const [result] = await pool.query(
      'INSERT INTO users (email, name, password_hash) VALUES (?,?,?)',
      [email, name ?? '', hash]
    ) as any
    const userId = result.insertId
    await seedUserData(userId)
    const token = signToken(userId)
    res.status(201).json({ token, user: { id: userId, email, name: name ?? '' } })
  } catch (e) { next(e) }
})

authRouter.post('/login', async (req, res, next) => {
  const { email, password } = req.body ?? {}
  if (!email || !password) {
    res.status(400).json({ message: 'メールアドレスとパスワードを入力してください' }); return
  }
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]) as any
    const user = rows[0]
    if (!user || !(await verifyPassword(String(password), user.password_hash))) {
      res.status(401).json({ message: 'メールアドレスまたはパスワードが違います' }); return
    }
    const token = signToken(user.id)
    res.json({ token, user: publicUser(user) })
  } catch (e) { next(e) }
})

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, email, name FROM users WHERE id = ?', [req.userId]) as any
    if (!rows.length) { res.status(401).json({ message: 'ユーザーが見つかりません' }); return }
    res.json({ user: publicUser(rows[0]) })
  } catch (e) { next(e) }
})
