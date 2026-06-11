import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { Account, Partner, SubAccount, Journal, PageId, FiscalYear } from './types'
import { initialAccounts, initialPartners, initialJournals } from './data'
import { api } from './api'

interface AppState {
  accounts: Account[]
  partners: Partner[]
  subAccounts: SubAccount[]
  journals: Journal[]
  fiscalYears: FiscalYear[]
  currentPage: PageId
  currentFiscalYearId: number | null
  loading: boolean
  error: string | null
}
interface AppActions {
  setPage: (page: PageId) => void
  setCurrentFiscalYearId: (id: number | null) => void
  addJournal: (j: Omit<Journal,'id'>) => Promise<void>
  updateJournal: (j: Journal) => Promise<void>
  deleteJournal: (id: number) => Promise<void>
  addAccount: (a: Account) => Promise<void>
  updateAccount: (index: number, a: Account) => Promise<void>
  deleteAccount: (index: number) => Promise<void>
  addPartner: (p: Partner) => Promise<void>
  updatePartner: (index: number, p: Partner) => Promise<void>
  deletePartner: (index: number) => Promise<void>
  addSubAccount: (s: SubAccount) => Promise<void>
  updateSubAccount: (index: number, s: SubAccount) => Promise<void>
  deleteSubAccount: (index: number) => Promise<void>
  addFiscalYear: (fy: Omit<FiscalYear,'id'|'closed'>) => Promise<void>
  closeFiscalYear: (id: number) => Promise<string>
  reopenFiscalYear: (id: number) => Promise<string>
  deleteFiscalYear: (id: number) => Promise<void>
  reload: () => Promise<void>
}
type AppContextType = AppState & AppActions

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [accounts,    setAccounts]    = useState<Account[]>(initialAccounts)
  const [partners,    setPartners]    = useState<Partner[]>(initialPartners)
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([])
  const [journals,    setJournals]    = useState<Journal[]>(initialJournals)
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([])
  const [currentPage, setCurrentPage] = useState<PageId>('journal')
  const [currentFiscalYearId, setCurrentFiscalYearId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getState()
      setAccounts(data.accounts)
      setPartners(data.partners)
      setSubAccounts(data.subAccounts ?? [])
      setJournals(data.journals)
      setFiscalYears(data.fiscalYears)
      if (data.fiscalYears.length && currentFiscalYearId === null) {
        const open = data.fiscalYears.find(f => !f.closed)
        setCurrentFiscalYearId(open?.id ?? data.fiscalYears[0].id)
      }
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'データの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [currentFiscalYearId])

  useEffect(() => { load() }, []) // eslint-disable-line

  const reload = useCallback(async () => { await load() }, [load])

  const setPage = useCallback((page: PageId) => setCurrentPage(page), [])

  const addJournal = useCallback(async (j: Omit<Journal,'id'>) => {
    const data = await api.addJournal(j); setAccounts(data.accounts); setJournals(data.journals)
  }, [])
  const updateJournal = useCallback(async (j: Journal) => {
    const data = await api.updateJournal(j); setAccounts(data.accounts); setJournals(data.journals)
  }, [])
  const deleteJournal = useCallback(async (id: number) => {
    const data = await api.deleteJournal(id); setAccounts(data.accounts); setJournals(data.journals)
  }, [])

  const addAccount    = useCallback(async (a: Account)            => setAccounts(await api.addAccount(a)), [])
  const updateAccount = useCallback(async (i: number, a: Account) => setAccounts(await api.updateAccount(accounts[i].code, a)), [accounts])
  const deleteAccount = useCallback(async (i: number)             => setAccounts(await api.deleteAccount(accounts[i].code)), [accounts])

  const addPartner    = useCallback(async (p: Partner)            => setPartners(await api.addPartner(p)), [])
  const updatePartner = useCallback(async (i: number, p: Partner) => setPartners(await api.updatePartner(partners[i].code, p)), [partners])
  const deletePartner = useCallback(async (i: number)             => setPartners(await api.deletePartner(partners[i].code)), [partners])

  const addSubAccount    = useCallback(async (s: SubAccount)            => setSubAccounts(await api.addSubAccount(s)), [])
  const updateSubAccount = useCallback(async (i: number, s: SubAccount) => setSubAccounts(await api.updateSubAccount(subAccounts[i].code, s)), [subAccounts])
  const deleteSubAccount = useCallback(async (i: number)                => setSubAccounts(await api.deleteSubAccount(subAccounts[i].code)), [subAccounts])

  const addFiscalYear   = useCallback(async (fy: Omit<FiscalYear,'id'|'closed'>) => setFiscalYears(await api.addFiscalYear(fy)), [])
  // 決算処理：振替仕訳で残高・仕訳が変わるため全データを再読み込み
  const closeFiscalYear = useCallback(async (id: number) => {
    const res = await api.closeFiscalYear(id); await load(); return res.message
  }, [load])
  const reopenFiscalYear = useCallback(async (id: number) => {
    const res = await api.reopenFiscalYear(id); await load(); return res.message
  }, [load])
  const deleteFiscalYear= useCallback(async (id: number) => setFiscalYears(await api.deleteFiscalYear(id)), [])

  return (
    <AppContext.Provider value={{
      accounts, partners, subAccounts, journals, fiscalYears, currentPage, currentFiscalYearId,
      loading, error,
      setPage, setCurrentFiscalYearId, reload,
      addJournal, updateJournal, deleteJournal,
      addAccount, updateAccount, deleteAccount,
      addPartner, updatePartner, deletePartner,
      addSubAccount, updateSubAccount, deleteSubAccount,
      addFiscalYear, closeFiscalYear, reopenFiscalYear, deleteFiscalYear,
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
