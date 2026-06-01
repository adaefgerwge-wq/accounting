import { useApp } from '../store'
import type { Account } from '../types'

function Section({ title, items, total }: { title: string; items: Account[]; total: number }) {
  return (
    <div className="section-card">
      <div className="section-header">
        <span>{title}</span>
        <span>{total.toLocaleString()} 円</span>
      </div>
      {items.map(a => (
        <div key={a.code} className="fs-row">
          <span>{a.name}</span>
          <span>{a.balance.toLocaleString()}</span>
        </div>
      ))}
      <div className="fs-row subtotal">
        <span>合計</span><span>{total.toLocaleString()}</span>
      </div>
    </div>
  )
}

export default function PLPage() {
  const { accounts } = useApp()

  const revenues = accounts.filter(a => a.type === 'revenue')
  const expenses = accounts.filter(a => a.type === 'expense')
  const totalR = revenues.reduce((s, a) => s + a.balance, 0)
  const totalE = expenses.reduce((s, a) => s + a.balance, 0)
  const profit = totalR - totalE

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="toolbar">
        <h2><i className="ti ti-chart-bar" />損益計算書</h2>
      </div>
      <div className="content">
        <Section title="収益の部" items={revenues} total={totalR} />
        <Section title="費用の部" items={expenses} total={totalE} />
        <div className="fs-row total">
          <span>{profit >= 0 ? '当期純利益' : '当期純損失'}</span>
          <span>{Math.abs(profit).toLocaleString()} 円</span>
        </div>
      </div>
    </div>
  )
}
