import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider, useAuth } from './auth'
import { AppProvider } from './store'
import App from './App'
import Login from './components/Login'
import './styles/index.css'

function AuthGate() {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>
        読み込んでいます...
      </div>
    )
  }

  if (!isAuthenticated) return <Login />

  // 認証後にのみ AppProvider をマウント（getState は認証必須のため）
  return (
    <AppProvider>
      <App />
    </AppProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  </StrictMode>
)
