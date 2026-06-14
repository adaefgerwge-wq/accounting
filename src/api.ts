import type { Account, Journal, Partner, SubAccount, FiscalYear } from './types'

// APIのベースURL。本番では VITE_API_BASE_URL（例: https://xxx/api）、
// ローカルでは Vite プロキシ経由の '/api'。直接 fetch する箇所でも使う。
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'
const BASE = API_BASE

export interface AuthUser { id: number; email: string; name: string }
export interface AuthResult { token: string; user: AuthUser }

// ── 認証トークン管理 ──
let authToken: string | null = null
let onUnauthorized: (() => void) | null = null

export function setAuthToken(token: string | null) { authToken = token }
export function setOnUnauthorized(handler: (() => void) | null) { onUnauthorized = handler }

function authHeaders(extra?: HeadersInit): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...extra,
  }
}

// 認証ヘッダ付き fetch（生の Response を返す。直書き fetch の置き換え用）
export async function authFetch(path: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, { ...options, headers: authHeaders(options?.headers) })
  // 認証済みのはずが 401 → セッション切れ。ログアウトさせる（認証エンドポイントは除く）
  if (res.status === 401 && authToken && !path.startsWith('/auth')) onUnauthorized?.()
  return res
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await authFetch(path, options)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.message ?? `API error: ${res.status}`)
  }
  return res.json() as Promise<T>
}

// 認証付きでファイルをダウンロード（href では Authorization を載せられないため blob 経由）
export async function download(path: string, filename: string): Promise<void> {
  const res = await authFetch(path)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.message ?? `ダウンロードに失敗しました: ${res.status}`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export interface AppData {
  accounts: Account[]
  partners: Partner[]
  subAccounts: SubAccount[]
  journals: Journal[]
  fiscalYears: FiscalYear[]
}
export interface JournalState { accounts: Account[]; journals: Journal[] }

export const api = {
  // ── 認証 ──
  register: (email: string, password: string, name: string) =>
    request<AuthResult>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name }) }),
  login: (email: string, password: string) =>
    request<AuthResult>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request<{ user: AuthUser }>('/auth/me'),

  getState: () => request<AppData>('/state'),

  addJournal:    (j: Omit<Journal,'id'>)  => request<JournalState>('/journals',         { method:'POST',   body: JSON.stringify(j) }),
  updateJournal: (j: Journal)             => request<JournalState>(`/journals/${j.id}`, { method:'PUT',    body: JSON.stringify(j) }),
  deleteJournal: (id: number)             => request<JournalState>(`/journals/${id}`,   { method:'DELETE' }),

  addAccount:    (a: Account)               => request<Account[]>('/accounts',                                { method:'POST',   body: JSON.stringify(a) }),
  updateAccount: (code: string, a: Account) => request<Account[]>(`/accounts/${encodeURIComponent(code)}`,   { method:'PUT',    body: JSON.stringify(a) }),
  deleteAccount: (code: string)             => request<Account[]>(`/accounts/${encodeURIComponent(code)}`,   { method:'DELETE' }),

  addPartner:    (p: Partner)               => request<Partner[]>('/partners',                                { method:'POST',   body: JSON.stringify(p) }),
  updatePartner: (code: string, p: Partner) => request<Partner[]>(`/partners/${encodeURIComponent(code)}`,   { method:'PUT',    body: JSON.stringify(p) }),
  deletePartner: (code: string)             => request<Partner[]>(`/partners/${encodeURIComponent(code)}`,   { method:'DELETE' }),

  addSubAccount:    (s: SubAccount)               => request<SubAccount[]>('/sub-accounts',                              { method:'POST',   body: JSON.stringify(s) }),
  updateSubAccount: (code: string, s: SubAccount) => request<SubAccount[]>(`/sub-accounts/${encodeURIComponent(code)}`, { method:'PUT',    body: JSON.stringify(s) }),
  deleteSubAccount: (code: string)                => request<SubAccount[]>(`/sub-accounts/${encodeURIComponent(code)}`, { method:'DELETE' }),

  addFiscalYear:    (fy: Omit<FiscalYear,'id'|'closed'>) => request<FiscalYear[]>('/fiscal-years',               { method:'POST',   body: JSON.stringify(fy) }),
  closeFiscalYear:  (id: number)                         => request<{ message: string; fiscalYears: FiscalYear[] }>(`/fiscal-years/${id}/close`,  { method:'PUT' }),
  reopenFiscalYear: (id: number)                         => request<{ message: string; fiscalYears: FiscalYear[] }>(`/fiscal-years/${id}/reopen`, { method:'PUT' }),
  deleteFiscalYear: (id: number)                         => request<FiscalYear[]>(`/fiscal-years/${id}`,         { method:'DELETE' }),

  // エクスポートは BASE を含まないパスを返す（download() / authFetch 経由で取得）
  exportJournalsCsv:     (fiscalYearId?: number) => `/export/journals.csv${fiscalYearId ? `?fiscalYearId=${fiscalYearId}` : ''}`,
  exportTrialBalanceCsv: (fiscalYearId?: number) => `/export/trial-balance.csv${fiscalYearId ? `?fiscalYearId=${fiscalYearId}` : ''}`,
  exportBackup:          () => `/export/backup.json`,
  download,

  restore: (data: unknown) => request<{ message: string }>('/restore', { method:'POST', body: JSON.stringify(data) }),
}
