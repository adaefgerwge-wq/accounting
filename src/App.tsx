import { useApp } from './store'
import Sidebar from './components/Sidebar'
import Journal from './components/Journal'
import Accounts from './components/Accounts'
import Partners from './components/Partners'
import BS from './components/BS'
import PL from './components/PL'
import TrialBalance from './components/TrialBalance'
import FiscalYears from './components/FiscalYears'
import Settings from './components/Settings'

export default function App() {
  const { currentPage, loading, error } = useApp()
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        {loading && <div style={{padding:16, color:'#888', fontSize:13}}>データを読み込んでいます...</div>}
        {error   && <div className="alert alert-error" style={{margin:16}}>APIに接続できません: {error}</div>}
        {currentPage === 'journal'       && <Journal />}
        {currentPage === 'trial-balance' && <TrialBalance />}
        {currentPage === 'accounts'      && <Accounts />}
        {currentPage === 'partners'      && <Partners />}
        {currentPage === 'bs'            && <BS />}
        {currentPage === 'pl'            && <PL />}
        {currentPage === 'fiscal-years'  && <FiscalYears />}
        {currentPage === 'settings'      && <Settings />}
      </div>
    </div>
  )
}
