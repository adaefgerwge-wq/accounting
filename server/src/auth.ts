import type { Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

// 本番では JWT_SECRET 未設定を許さない（開発用既定値のまま公開するのを防ぐ）
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET が未設定です。本番環境では必ず環境変数で設定してください。')
}
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-insecure-secret-change-me'
if (!process.env.JWT_SECRET) {
  console.warn('⚠ JWT_SECRET が未設定です。開発用の既定値を使用します。本番環境では必ず設定してください。')
}

// トークン有効期限：30日（秒）
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30
const SALT_ROUNDS = 10

// Express の Request に userId を生やす
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId: number
    }
  }
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export function signToken(userId: number): string {
  return jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: TOKEN_TTL_SECONDS })
}

// Authorization: Bearer <token> を検証し req.userId をセットするミドルウェア
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    res.status(401).json({ message: '認証が必要です' })
    return
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { uid: number }
    req.userId = payload.uid
    next()
  } catch {
    res.status(401).json({ message: 'セッションが無効です。再度ログインしてください' })
  }
}
