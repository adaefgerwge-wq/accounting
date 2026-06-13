import type { Account, Journal, Partner, SubAccount, FiscalYear } from './types'

// APIのベースURL。本番では VITE_API_BASE_URL（例: https://xxx/api）、
// ローカルでは Vite プロキシ経由の '/api'。直接 fetch する箇所でも使う。
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'
const BASE = API_BASE

export interface AppData {
  accounts: Account[]
  partners: Partner[]
  subAccounts: SubAccount[]
  journals: Journal[]
  fiscalYears: FiscalYear[]
}
export interface JournalState { accounts: Account[]; journals: Journal[] }

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers }
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.message ?? `API error: ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
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

  exportJournalsCsv:     (fiscalYearId?: number) => `${BASE}/export/journals.csv${fiscalYearId ? `?fiscalYearId=${fiscalYearId}` : ''}`,
  exportTrialBalanceCsv: (fiscalYearId?: number) => `${BASE}/export/trial-balance.csv${fiscalYearId ? `?fiscalYearId=${fiscalYearId}` : ''}`,
  exportBackup:          () => `${BASE}/export/backup.json`,

  restore: (data: unknown) => request<{ message: string }>('/restore', { method:'POST', body: JSON.stringify(data) }),
}
