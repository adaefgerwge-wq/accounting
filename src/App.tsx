import { useApp } from './store'
import Sidebar from './components/Sidebar'
import Journal from './components/Journal'
import Accounts from './components/Accounts'
import Partners from './components/Partners'
import BS from './components/BS'
import PL from './components/PL'

export default function App() {
  const { currentPage } = useApp()

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        {currentPage === 'journal'  && <Journal />}
        {currentPage === 'accounts' && <Accounts />}
        {currentPage === 'partners' && <Partners />}
        {currentPage === 'bs'       && <BS />}
        {currentPage === 'pl'       && <PL />}
      </div>
    </div>
  )
}
