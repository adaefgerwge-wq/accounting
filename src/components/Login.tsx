import { useState } from 'react'
import { useAuth } from '../auth'

export default function Login() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (mode === 'login') await login(email, password)
      else                  await register(email, password, name)
    } catch (err) {
      setError(err instanceof Error ? err.message : '認証に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  const switchMode = () => {
    setMode(m => (m === 'login' ? 'register' : 'login'))
    setError(null)
  }

  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#f5f4f0',
    }}>
      <div style={{
        width: 360, background: '#fff', borderRadius: 12,
        border: '0.5px solid #d8d5cc', boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
        padding: '32px 28px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
          fontSize: 18, fontWeight: 600, color: '#3C3489', marginBottom: 4,
        }}>
          <i className="ti ti-calculator" />会計ソフト
        </div>
        <div style={{ textAlign: 'center', fontSize: 13, color: '#888', marginBottom: 24 }}>
          {mode === 'login' ? 'ログインしてください' : 'アカウントを新規登録'}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'register' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#555' }}>
              お名前
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="山田 太郎" autoComplete="name"
                style={inputStyle}
              />
            </label>
          )}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#555' }}>
            メールアドレス
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="email" required
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#555' }}>
            パスワード
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'register' ? '6文字以上' : ''}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required
              style={inputStyle}
            />
          </label>

          {error && <div className="alert alert-error" style={{ fontSize: 12 }}>{error}</div>}

          <button
            type="submit" className="primary" disabled={submitting}
            style={{ marginTop: 4, padding: '10px', fontSize: 14, opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? '処理中...' : mode === 'login' ? 'ログイン' : '登録する'}
          </button>
        </form>

        <div style={{ textAlign: 'center', fontSize: 12, color: '#888', marginTop: 16 }}>
          {mode === 'login' ? 'アカウントをお持ちでない方は' : '既にアカウントをお持ちの方は'}{' '}
          <span onClick={switchMode} style={{ color: '#3C3489', cursor: 'pointer', fontWeight: 500 }}>
            {mode === 'login' ? '新規登録' : 'ログイン'}
          </span>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '9px 11px', fontSize: 14, border: '1px solid #d8d5cc',
  borderRadius: 7, outline: 'none', background: '#fff', color: '#1a1a1a',
}
