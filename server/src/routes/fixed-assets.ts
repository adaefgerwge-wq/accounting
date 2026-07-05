import { Router } from 'express'
import { pool } from '../db.js'
import {
  depreciationForPeriod, accumulatedDepreciation, serviceMonthsThrough, type FixedAssetInput,
} from '../domain/depreciation.js'

export const fixedAssetsRouter = Router()

function toAssetInput(r: any): FixedAssetInput {
  return {
    acquisitionDate: String(r.acquisition_date).slice(0, 10),
    cost: r.cost,
    usefulLifeYears: r.useful_life,
  }
}

// 一覧＋償却計算。fiscalYearId 指定時はその期間の当期償却額・期首/期末簿価も返す。
fixedAssetsRouter.get('/', async (req, res, next) => {
  try {
    const { fiscalYearId } = req.query
    let fy: { startDate: string; endDate: string } | null = null
    if (fiscalYearId) {
      const [fyRows] = await pool.query('SELECT start_date, end_date FROM fiscal_years WHERE id = ? AND user_id = ?', [fiscalYearId, req.userId]) as any
      if (fyRows.length) fy = { startDate: String(fyRows[0].start_date).slice(0, 10), endDate: String(fyRows[0].end_date).slice(0, 10) }
    }

    const [rows] = await pool.query('SELECT * FROM fixed_assets WHERE user_id = ? ORDER BY acquisition_date, id', [req.userId]) as any
    res.json(rows.map((r: any) => {
      const asset = toAssetInput(r)
      const base = {
        id: r.id, name: r.name, acquisitionDate: asset.acquisitionDate,
        cost: r.cost, usefulLifeYears: r.useful_life, memo: r.memo,
      }
      if (!fy) return base
      const periodDep = depreciationForPeriod(asset, fy.startDate, fy.endDate)
      const accumEnd  = accumulatedDepreciation(asset, serviceMonthsThrough(asset, fy.endDate))
      return {
        ...base,
        periodDepreciation: periodDep,
        accumulatedDepreciation: accumEnd,
        bookValue: r.cost - accumEnd,
      }
    }))
  } catch (e) { next(e) }
})

function validateAsset(b: any): string | null {
  if (!b.name?.trim()) return '資産名を入力してください'
  if (!b.acquisitionDate) return '取得日を入力してください'
  if (!Number.isInteger(b.cost) || b.cost <= 0) return '取得価額は正の整数で入力してください'
  if (!Number.isInteger(b.usefulLifeYears) || b.usefulLifeYears < 2 || b.usefulLifeYears > 100) return '耐用年数は2〜100年で入力してください'
  return null
}

fixedAssetsRouter.post('/', async (req, res, next) => {
  const err = validateAsset(req.body)
  if (err) { res.status(400).json({ message: err }); return }
  try {
    await pool.query(
      'INSERT INTO fixed_assets (user_id, name, acquisition_date, cost, useful_life, memo) VALUES (?,?,?,?,?,?)',
      [req.userId, req.body.name.trim(), req.body.acquisitionDate, req.body.cost, req.body.usefulLifeYears, req.body.memo ?? '']
    )
    res.status(201).json({ ok: true })
  } catch (e) { next(e) }
})

fixedAssetsRouter.put('/:id', async (req, res, next) => {
  const err = validateAsset(req.body)
  if (err) { res.status(400).json({ message: err }); return }
  try {
    const [result] = await pool.query(
      'UPDATE fixed_assets SET name=?, acquisition_date=?, cost=?, useful_life=?, memo=? WHERE id=? AND user_id=?',
      [req.body.name.trim(), req.body.acquisitionDate, req.body.cost, req.body.usefulLifeYears, req.body.memo ?? '', req.params.id, req.userId]
    ) as any
    if (result.affectedRows === 0) { res.status(404).json({ message: '固定資産が見つかりません' }); return }
    res.json({ ok: true })
  } catch (e) { next(e) }
})

fixedAssetsRouter.delete('/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM fixed_assets WHERE id = ? AND user_id = ?', [req.params.id, req.userId])
    res.status(204).send()
  } catch (e) { next(e) }
})
