import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { api, setAuthToken, setOnUnauthorized, type AuthUser } from './api'

const TOKEN_KEY = 'accounting_token'

// モジュール読み込み時点で localStorage のトークンを api に反映しておく
// （初回の api.me() 検証時に Authorization が載るようにするため）
const initialToken = localStorage.getItem(TOKEN_KEY)
setAuthToken(initialToken)

interface AuthContextType {
  user: AuthUser | null
  isAuthenticated: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(initialToken)
  const [user, setUser]   = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState<boolean>(!!initialToken)

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setAuthToken(null)
    setUser(null)
    setToken(null)
  }, [])

  // 401（セッション切れ）を受けたら自動ログアウト
  useEffect(() => {
    setOnUnauthorized(logout)
    return () => setOnUnauthorized(null)
  }, [logout])

  // 初回マウント時：トークンがあれば /me で検証
  useEffect(() => {
    if (!token) { setLoading(false); return }
    let cancelled = false
    api.me()
      .then(({ user }) => { if (!cancelled) setUser(user) })
      .catch(() => { if (!cancelled) logout() })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyAuth = (t: string, u: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, t)
    setAuthToken(t)
    setUser(u)
    setToken(t)
  }

  const login = useCallback(async (email: string, password: string) => {
    const { token, user } = await api.login(email, password)
    applyAuth(token, user)
  }, [])

  const register = useCallback(async (email: string, password: string, name: string) => {
    const { token, user } = await api.register(email, password, name)
    applyAuth(token, user)
  }, [])

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
