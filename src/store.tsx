import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { Account, Partner, Journal, PageId } from './types'
import { initialAccounts, initialPartners, initialJournals } from './data'
import { api } from './api'

// ─── State 型 ────────────────────────────────────────────────────────────────

interface AppState {
  accounts: Account[]
  partners: Partner[]
  journals: Journal[]
  currentPage: PageId
  nextId: number
  loading: boolean
  error: string | null
}

interface AppActions {
  setPage: (page: PageId) => void

  // 仕訳
  addJournal: (j: Omit<Journal, 'id'>) => Promise<void>
  updateJournal: (j: Journal) => Promise<void>
  deleteJournal: (id: number) => Promise<void>

  // 勘定科目
  addAccount: (a: Account) => Promise<void>
  updateAccount: (index: number, a: Account) => Promise<void>
  deleteAccount: (index: number) => Promise<void>

  // 取引先
  addPartner: (p: Partner) => Promise<void>
  updatePartner: (index: number, p: Partner) => Promise<void>
  deletePartner: (index: number) => Promise<void>
}

type AppContextType = AppState & AppActions

// ─── Context ─────────────────────────────────────────────────────────────────

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts)
  const [partners, setPartners] = useState<Partner[]>(initialPartners)
  const [journals, setJournals] = useState<Journal[]>(initialJournals)
  const [currentPage, setCurrentPage] = useState<PageId>('journal')
  const [nextId, setNextId] = useState(5)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const syncNextId = useCallback((items: Journal[]) => {
    setNextId(Math.max(0, ...items.map(j => j.id)) + 1)
  }, [])

  useEffect(() => {
    let active = true

    api.getState()
      .then(data => {
        if (!active) return
        setAccounts(data.accounts)
        setPartners(data.partners)
        setJournals(data.journals)
        syncNextId(data.journals)
        setError(null)
      })
      .catch(err => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'データの読み込みに失敗しました')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [syncNextId])

  const setPage = useCallback((page: PageId) => setCurrentPage(page), [])

  // ── 仕訳 ────────────────────────────────────────────────────────────────────

  const addJournal = useCallback(async (j: Omit<Journal, 'id'>) => {
    const data = await api.addJournal(j)
    setAccounts(data.accounts)
    setJournals(data.journals)
    syncNextId(data.journals)
  }, [syncNextId])

  const updateJournal = useCallback(async (updated: Journal) => {
    const data = await api.updateJournal(updated)
    setAccounts(data.accounts)
    setJournals(data.journals)
    syncNextId(data.journals)
  }, [syncNextId])

  const deleteJournal = useCallback(async (id: number) => {
    const data = await api.deleteJournal(id)
    setAccounts(data.accounts)
    setJournals(data.journals)
    syncNextId(data.journals)
  }, [syncNextId])

  // ── 勘定科目 ────────────────────────────────────────────────────────────────

  const addAccount = useCallback(async (a: Account) => {
    setAccounts(await api.addAccount(a))
  }, [])

  const updateAccount = useCallback(async (index: number, a: Account) => {
    const old = accounts[index]
    if (!old) return
    setAccounts(await api.updateAccount(old.code, a))
  }, [accounts])

  const deleteAccount = useCallback(async (index: number) => {
    const account = accounts[index]
    if (!account) return
    setAccounts(await api.deleteAccount(account.code))
  }, [accounts])

  // ── 取引先 ──────────────────────────────────────────────────────────────────

  const addPartner = useCallback(async (p: Partner) => {
    setPartners(await api.addPartner(p))
  }, [])

  const updatePartner = useCallback(async (index: number, p: Partner) => {
    const old = partners[index]
    if (!old) return
    setPartners(await api.updatePartner(old.code, p))
  }, [partners])

  const deletePartner = useCallback(async (index: number) => {
    const partner = partners[index]
    if (!partner) return
    setPartners(await api.deletePartner(partner.code))
  }, [partners])

  return (
    <AppContext.Provider value={{
      accounts, partners, journals, currentPage, nextId, loading, error,
      setPage,
      addJournal, updateJournal, deleteJournal,
      addAccount, updateAccount, deleteAccount,
      addPartner, updatePartner, deletePartner,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
