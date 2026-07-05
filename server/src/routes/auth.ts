import { Router } from 'express'
import { pool } from '../db.js'
import { hashPassword, verifyPassword, signToken, requireAuth } from '../auth.js'
import { seedUserData } from '../schema.js'
import { RateLimiter } from '../rate-limit.js'

export const authRouter = Router()

// ブルートフォース対策：IP単位 20回/15分、ログイン失敗はメール単位 10回/15分
const WINDOW_MS = 15 * 60 * 1000
const ipLimiter = new RateLimiter({ windowMs: WINDOW_MS, max: 20 })
const emailFailLimiter = new RateLimiter({ windowMs: WINDOW_MS, max: 10 })

const TOO_MANY = '試行回数が多すぎます。しばらく待ってから再度お試しください'

function publicUser(row: any) {
  return { id: row.id, email: row.email, name: row.name }
}

authRouter.post('/register', async (req, res, next) => {
  const { email, password, name } = req.body ?? {}
  if (!ipLimiter.consume(`register:${req.ip}`)) {
    res.status(429).json({ message: TOO_MANY }); return
  }
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
  if (!ipLimiter.consume(`login:${req.ip}`)) {
    res.status(429).json({ message: TOO_MANY }); return
  }
  const emailKey = `login:${String(email).toLowerCase()}`
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]) as any
    const user = rows[0]
    if (!user || !(await verifyPassword(String(password), user.password_hash))) {
      if (!emailFailLimiter.consume(emailKey)) {
        res.status(429).json({ message: TOO_MANY }); return
      }
      res.status(401).json({ message: 'メールアドレスまたはパスワードが違います' }); return
    }
    emailFailLimiter.reset(emailKey)
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
