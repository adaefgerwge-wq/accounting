import { useApp } from '../store'
import { useAuth } from '../auth'
import type { PageId } from '../types'

const NAV: { section: string; items: { id: PageId; icon: string; label: string }[] }[] = [
  { section: '帳票', items: [
    { id: 'journal',       icon: 'ti-file-text',      label: '仕訳帳' },
    { id: 'ledger',          icon: 'ti-book-2',     label: '総勘定元帳' },
    { id: 'trial-balance',   icon: 'ti-table',      label: '試算表' },
    { id: 'monthly-report',  icon: 'ti-chart-line', label: '月次レポート' },
    { id: 'tax-summary',     icon: 'ti-receipt-tax', label: '消費税集計' },
    { id: 'invoices',      icon: 'ti-file-invoice',    label: '請求書' },
    { id: 'bank-import',   icon: 'ti-building-bank',   label: '銀行取り込み' },
  ]},
  { section: '財務諸表', items: [
    { id: 'bs', icon: 'ti-layout-columns', label: '貸借対照表' },
    { id: 'pl', icon: 'ti-chart-bar',      label: '損益計算書' },
  ]},
  { section: 'マスタ', items: [
    { id: 'accounts',     icon: 'ti-list',      label: '勘定科目' },
    { id: 'sub-accounts', icon: 'ti-list-tree', label: '補助科目' },
    { id: 'partners',     icon: 'ti-building',  label: '取引先' },
    { id: 'fixed-assets', icon: 'ti-building-warehouse', label: '固定資産' },
    { id: 'fiscal-years', icon: 'ti-calendar', label: '会計年度' },
  ]},
  { section: 'ツール', items: [
    { id: 'settings', icon: 'ti-settings', label: '設定・バックアップ' },
  ]},
]

export default function Sidebar() {
  const { currentPage, setPage } = useApp()
  const { user, logout } = useAuth()
  return (
    <div className="sidebar">
      <div className="sidebar-logo"><i className="ti ti-calculator" />会計ソフト</div>
      {NAV.map(group => (
        <div key={group.section}>
          <div className="nav-section">{group.section}</div>
          {group.items.map(item => (
            <div key={item.id} className={`nav-item${currentPage === item.id ? ' active' : ''}`} onClick={() => setPage(item.id)}>
              <i className={`ti ${item.icon}`} />{item.label}
            </div>
          ))}
        </div>
      ))}
      <div style={{ marginTop: 'auto', padding: '10px 14px', borderTop: '0.5px solid #e8e5dc' }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <i className="ti ti-user" style={{ marginRight: 4 }} />{user?.name || user?.email}
        </div>
        <div
          onClick={logout}
          style={{ fontSize: 12, color: '#c0392b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <i className="ti ti-logout" />ログアウト
        </div>
      </div>
    </div>
  )
}
