// 定額法・月割の減価償却計算（備忘価額1円まで償却）。
//
// 累計ベースで計算する：耐用月数 N・取得価額 C のとき、
// 供用 m ヶ月経過時点の累計償却額 = min( floor(C × m / N), C - 1 )
// 期間償却額 = 累計(期末) - 累計(期首)。
// 年ごとの端数切り捨てを積み上げる方式と違い、累計がずれない。

export interface FixedAssetInput {
  /** 取得日 YYYY-MM-DD */
  acquisitionDate: string
  /** 取得価額（円） */
  cost: number
  /** 耐用年数（年） */
  usefulLifeYears: number
}

/** YYYY-MM-DD → 通算月インデックス */
function monthIndex(date: string): number {
  const y = Number(date.slice(0, 4))
  const m = Number(date.slice(5, 7))
  return y * 12 + (m - 1)
}

/** 取得月から date の月末までの供用月数（取得月を含む）。取得前なら0。 */
export function serviceMonthsThrough(asset: FixedAssetInput, date: string): number {
  const months = monthIndex(date) - monthIndex(asset.acquisitionDate) + 1
  if (months <= 0) return 0
  return Math.min(months, asset.usefulLifeYears * 12)
}

/** 供用 m ヶ月経過時点の累計償却額 */
export function accumulatedDepreciation(asset: FixedAssetInput, months: number): number {
  if (months <= 0 || asset.cost <= 0) return 0
  const totalMonths = asset.usefulLifeYears * 12
  const raw = Math.floor(asset.cost * Math.min(months, totalMonths) / totalMonths)
  return Math.min(raw, asset.cost - 1) // 備忘価額1円を残す
}

/**
 * 会計期間 [fyStart, fyEnd] に計上すべき償却額。
 * 期首時点の累計と期末時点の累計の差分で求める。
 */
export function depreciationForPeriod(asset: FixedAssetInput, fyStart: string, fyEnd: string): number {
  if (asset.acquisitionDate > fyEnd) return 0
  // 期首前月末までの供用月数（期首の月は当期に含める）
  const monthsBefore = Math.max(0, monthIndex(fyStart) - monthIndex(asset.acquisitionDate))
  const monthsThroughEnd = serviceMonthsThrough(asset, fyEnd)
  const before = accumulatedDepreciation(asset, Math.min(monthsBefore, asset.usefulLifeYears * 12))
  const through = accumulatedDepreciation(asset, monthsThroughEnd)
  return through - before
}

/** date 時点（その月末まで）の帳簿価額 */
export function bookValueAt(asset: FixedAssetInput, date: string): number {
  return asset.cost - accumulatedDepreciation(asset, serviceMonthsThrough(asset, date))
}
