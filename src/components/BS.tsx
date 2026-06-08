import { useApp } from '../store'
import type { Account } from '../types'

function Section({ title, items, total, journals, partners }: {
  title: string
  items: Account[]
  total: number
  journals: ReturnType<typeof useApp>['journals']
  partners: ReturnType<typeof useApp>['partners']
}) {
  return (
    <div className="section-card">
      <div className="section-header">
        <span>{title}</span>
        <span>{total.toLocaleString()} 円</span>
      </div>
      {items.map(a => {
        const subs = a.hasSub ? partners.filter(p => p.accountCode === a.code) : []
        return (
          <div key={a.code}>
            <div className="fs-row">
              <span>{a.name}</span>
              <span>{a.balance.toLocaleString()}</span>
            </div>
            {subs.map(p => {
              const bal = journals.flatMap(j => j.lines)
                .filter(l => l.accountCode === a.code && l.partnerCode === p.code)
                .reduce((s, l) => s + l.amount, 0)
              return (
                <div key={p.code} className="fs-row indent">
                  <span>└ {p.name}</span>
                  <span>{bal.toLocaleString()}</span>
                </div>
              )
            })}
          </div>
        )
      })}
      <div className="fs-row subtotal">
        <span>合計</span><span>{total.toLocaleString()}</span>
      </div>
    </div>
  )
}

export default function BSPage() {
  const { accounts, partners, journals } = useApp()

  const assets      = accounts.filter(a => a.type === 'asset')
  const liabilities = accounts.filter(a => a.type === 'liability')
  const equities    = accounts.filter(a => a.type === 'equity')
  const totalA = assets.reduce((s, a) => s + a.balance, 0)
  const totalL = liabilities.reduce((s, a) => s + a.balance, 0)
  const totalE = equities.reduce((s, a) => s + a.balance, 0)

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="toolbar">
        <h2><i className="ti ti-layout-columns" />貸借対照表</h2>
      </div>
      <div className="content">
        <div className="grid2">
          <div>
            <div className="fs-col-label">借方（資産）</div>
            <Section title="資産の部" items={assets} total={totalA} journals={journals} partners={partners} />
          </div>
          <div>
            <div className="fs-col-label">貸方（負債・純資産）</div>
            <Section title="負債の部" items={liabilities} total={totalL} journals={journals} partners={partners} />
            <Section title="純資産の部" items={equities} total={totalE} journals={journals} partners={partners} />
            <div className="fs-row total">
              <span>負債・純資産合計</span>
              <span>{(totalL + totalE).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
