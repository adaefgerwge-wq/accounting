import type { Account, Journal, Partner } from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

export interface AppData {
  accounts: Account[]
  partners: Partner[]
  journals: Journal[]
}

export interface JournalState {
  accounts: Account[]
  journals: Journal[]
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.message ?? `API request failed: ${response.status}`)
  }

  return response.json() as Promise<T>
}

export const api = {
  getState: () => request<AppData>('/state'),

  addJournal: (journal: Omit<Journal, 'id'>) =>
    request<JournalState>('/journals', { method: 'POST', body: JSON.stringify(journal) }),
  updateJournal: (journal: Journal) =>
    request<JournalState>(`/journals/${journal.id}`, { method: 'PUT', body: JSON.stringify(journal) }),
  deleteJournal: (id: number) =>
    request<JournalState>(`/journals/${id}`, { method: 'DELETE' }),

  addAccount: (account: Account) =>
    request<Account[]>('/accounts', { method: 'POST', body: JSON.stringify(account) }),
  updateAccount: (code: string, account: Account) =>
    request<Account[]>(`/accounts/${encodeURIComponent(code)}`, { method: 'PUT', body: JSON.stringify(account) }),
  deleteAccount: (code: string) =>
    request<Account[]>(`/accounts/${encodeURIComponent(code)}`, { method: 'DELETE' }),

  addPartner: (partner: Partner) =>
    request<Partner[]>('/partners', { method: 'POST', body: JSON.stringify(partner) }),
  updatePartner: (code: string, partner: Partner) =>
    request<Partner[]>(`/partners/${encodeURIComponent(code)}`, { method: 'PUT', body: JSON.stringify(partner) }),
  deletePartner: (code: string) =>
    request<Partner[]>(`/partners/${encodeURIComponent(code)}`, { method: 'DELETE' })
}
