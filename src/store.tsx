import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { Account, Partner, Journal, PageId } from './types'
import { initialAccounts, initialPartners, initialJournals } from './data'

// ─── State 型 ────────────────────────────────────────────────────────────────

interface AppState {
  accounts: Account[]
  partners: Partner[]
  journals: Journal[]
  currentPage: PageId
  nextId: number
}

interface AppActions {
  setPage: (page: PageId) => void

  // 仕訳
  addJournal: (j: Omit<Journal, 'id'>) => void
  updateJournal: (j: Journal) => void
  deleteJournal: (id: number) => void

  // 勘定科目
  addAccount: (a: Account) => void
  updateAccount: (index: number, a: Account) => void
  deleteAccount: (index: number) => void

  // 取引先
  addPartner: (p: Partner) => void
  updatePartner: (index: number, p: Partner) => void
  deletePartner: (index: number) => void
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

  const setPage = useCallback((page: PageId) => setCurrentPage(page), [])

  // ── 仕訳 ────────────────────────────────────────────────────────────────────

  const addJournal = useCallback((j: Omit<Journal, 'id'>) => {
    const id = nextId
    setNextId(n => n + 1)
    setAccounts(prev => prev.map(a => {
      if (a.code === j.debit)  return { ...a, balance: a.balance + j.amount }
      if (a.code === j.credit) return { ...a, balance: a.balance + j.amount }
      return a
    }))
    setJournals(prev => [...prev, { ...j, id }])
  }, [nextId])

  const updateJournal = useCallback((updated: Journal) => {
    setJournals(prev => {
      const old = prev.find(j => j.id === updated.id)
      if (!old) return prev
      // 残高を差し戻してから再加算
      setAccounts(accs => accs.map(a => {
        let bal = a.balance
        if (a.code === old.debit)    bal -= old.amount
        if (a.code === old.credit)   bal -= old.amount
        if (a.code === updated.debit)  bal += updated.amount
        if (a.code === updated.credit) bal += updated.amount
        return bal !== a.balance ? { ...a, balance: bal } : a
      }))
      return prev.map(j => j.id === updated.id ? updated : j)
    })
  }, [])

  const deleteJournal = useCallback((id: number) => {
    setJournals(prev => {
      const j = prev.find(x => x.id === id)
      if (j) {
        setAccounts(accs => accs.map(a => {
          if (a.code === j.debit)  return { ...a, balance: a.balance - j.amount }
          if (a.code === j.credit) return { ...a, balance: a.balance - j.amount }
          return a
        }))
      }
      return prev.filter(x => x.id !== id)
    })
  }, [])

  // ── 勘定科目 ────────────────────────────────────────────────────────────────

  const addAccount = useCallback((a: Account) => {
    setAccounts(prev => [...prev, a].sort((x, y) => x.code.localeCompare(y.code)))
  }, [])

  const updateAccount = useCallback((index: number, a: Account) => {
    setAccounts(prev => prev.map((x, i) => i === index ? a : x))
  }, [])

  const deleteAccount = useCallback((index: number) => {
    setAccounts(prev => prev.filter((_, i) => i !== index))
  }, [])

  // ── 取引先 ──────────────────────────────────────────────────────────────────

  const addPartner = useCallback((p: Partner) => {
    setPartners(prev => [...prev, p].sort((x, y) => x.code.localeCompare(y.code)))
  }, [])

  const updatePartner = useCallback((index: number, p: Partner) => {
    setPartners(prev => prev.map((x, i) => i === index ? p : x))
  }, [])

  const deletePartner = useCallback((index: number) => {
    setPartners(prev => prev.filter((_, i) => i !== index))
  }, [])

  return (
    <AppContext.Provider value={{
      accounts, partners, journals, currentPage, nextId,
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
