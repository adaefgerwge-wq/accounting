import { Router } from 'express'
import { pool } from '../db.js'
import { TAX_RATES } from '../tax.js'
import { splitTaxLines, insertJournal, recordJournalHistory } from '../journal-service.js'
import type { TaxType } from '../types.js'

export const invoicesRouter = Router()

interface InvoiceItem { description: string; qty: number; unitPrice: number; taxType: 'taxable10'|'taxable8'|'exempt' }
interface InvoiceBody  { partnerCode: string; partnerName: string; partnerAddr: string; issueDate: string; dueDate: string; memo: string; items: InvoiceItem[] }

const AR_CODE   = '1100' // 売掛金
const SALES_CODE = '4010' // 売上高
const BANK_CODE = '1020' // 普通預金

function toRow(r: any) {
  return {
    id: r.id, invoiceNo: r.invoice_no,
    partnerCode: r.partner_code, partnerName: r.partner_name, partnerAddr: r.partner_addr,
    issueDate: String(r.issue_date).slice(0,10), dueDate: String(r.due_date).slice(0,10),
    memo: r.memo, status: r.status,
    salesJournalId: r.sales_journal_id ?? null,
    paymentJournalId: r.payment_journal_id ?? null,
    items: (r.items ?? []).map((i: any) => ({ id: i.id, description: i.description, qty: Number(i.qty), unitPrice: i.unit_price, taxType: i.tax_type }))
  }
}

async function genInvoiceNo(userId: number) {
  const prefix = `INV-${new Date().getFullYear()}-`
  const [rows] = await pool.query(
    'SELECT invoice_no FROM invoices WHERE user_id = ? AND invoice_no LIKE ? ORDER BY id DESC LIMIT 1',
    [userId, `${prefix}%`]
  ) as any
  const last = rows[0]?.invoice_no
  const seq  = last ? parseInt(last.split('-').pop()) + 1 : 1
  return `${prefix}${String(seq).padStart(4, '0')}`
}

// 指定IDの請求書がそのユーザーのものか確認
async function ownsInvoice(conn: any, id: string, userId: number): Promise<boolean> {
  const [rows] = await conn.query('SELECT id FROM invoices WHERE id = ? AND user_id = ?', [id, userId]) as any
  return rows.length > 0
}

invoicesRouter.get('/', async (req, res, next) => {
  try {
    const [invoices] = await pool.query('SELECT * FROM invoices WHERE user_id = ? ORDER BY issue_date DESC, id DESC', [req.userId]) as any
    const [items]    = await pool.query(
      'SELECT it.* FROM invoice_items it JOIN invoices i ON it.invoice_id = i.id WHERE i.user_id = ? ORDER BY it.id',
      [req.userId]
    ) as any
    const result = invoices.map((inv: any) => toRow({ ...inv, items: items.filter((i: any) => i.invoice_id === inv.id) }))
    res.json(result)
  } catch(e) { next(e) }
})

invoicesRouter.post('/', async (req, res, next) => {
  const b = req.body as InvoiceBody
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const invoiceNo = await genInvoiceNo(req.userId)
    const [r] = await conn.query(
      'INSERT INTO invoices (user_id, invoice_no, partner_code, partner_name, partner_addr, issue_date, due_date, memo) VALUES (?,?,?,?,?,?,?,?)',
      [req.userId, invoiceNo, b.partnerCode, b.partnerName, b.partnerAddr, b.issueDate, b.dueDate, b.memo]
    ) as any
    if (b.items?.length) {
      await conn.query('INSERT INTO invoice_items (invoice_id, description, qty, unit_price, tax_type) VALUES ?',
        [b.items.map(i => [r.insertId, i.description, i.qty, i.unitPrice, i.taxType])])
    }
    await conn.commit()
    const [invRows] = await conn.query('SELECT * FROM invoices WHERE id = ?', [r.insertId]) as any
    const [itemRows] = await conn.query('SELECT * FROM invoice_items WHERE invoice_id = ?', [r.insertId]) as any
    res.status(201).json(toRow({ ...invRows[0], items: itemRows }))
  } catch(e) { await conn.rollback(); next(e) } finally { conn.release() }
})

invoicesRouter.put('/:id', async (req, res, next) => {
  const b = req.body as InvoiceBody
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    if (!(await ownsInvoice(conn, req.params.id, req.userId))) {
      await conn.rollback(); res.status(404).json({ message: '請求書が見つかりません' }); return
    }
    await conn.query(
      'UPDATE invoices SET partner_code=?, partner_name=?, partner_addr=?, issue_date=?, due_date=?, memo=? WHERE id=? AND user_id=?',
      [b.partnerCode, b.partnerName, b.partnerAddr, b.issueDate, b.dueDate, b.memo, req.params.id, req.userId]
    )
    await conn.query('DELETE FROM invoice_items WHERE invoice_id = ?', [req.params.id])
    if (b.items?.length) {
      await conn.query('INSERT INTO invoice_items (invoice_id, description, qty, unit_price, tax_type) VALUES ?',
        [b.items.map(i => [req.params.id, i.description, i.qty, i.unitPrice, i.taxType])])
    }
    await conn.commit()
    const [invRows] = await conn.query('SELECT * FROM invoices WHERE id = ?', [req.params.id]) as any
    const [itemRows] = await conn.query('SELECT * FROM invoice_items WHERE invoice_id = ?', [req.params.id]) as any
    res.json(toRow({ ...invRows[0], items: itemRows }))
  } catch(e) { await conn.rollback(); next(e) } finally { conn.release() }
})

// 明細を税区分ごとに税込金額へ集計する
function grossByTaxType(items: { qty: number; unit_price: number; tax_type: TaxType }[]) {
  const map = new Map<TaxType, number>()
  for (const i of items) {
    const net = Math.round(Number(i.qty) * i.unit_price)
    const tax = Math.floor(net * (TAX_RATES[i.tax_type] ?? 0))
    map.set(i.tax_type, (map.get(i.tax_type) ?? 0) + net + tax)
  }
  return map
}

// 日付を含む・締めていない会計年度を探す
async function findOpenFiscalYear(conn: any, userId: number, date: string) {
  const [rows] = await conn.query(
    'SELECT id, closed FROM fiscal_years WHERE user_id = ? AND start_date <= ? AND end_date >= ? LIMIT 1',
    [userId, date, date]
  ) as any
  return rows[0] ?? null
}

// 請求書から仕訳を起票する（type: 'sales'=売上計上 / 'payment'=入金）
invoicesRouter.post('/:id/journalize', async (req, res, next) => {
  const type = req.body?.type as 'sales' | 'payment'
  if (type !== 'sales' && type !== 'payment') {
    res.status(400).json({ message: 'type には sales か payment を指定してください' }); return
  }
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [invRows] = await conn.query('SELECT * FROM invoices WHERE id = ? AND user_id = ? FOR UPDATE', [req.params.id, req.userId]) as any
    const inv = invRows[0]
    if (!inv) { await conn.rollback(); res.status(404).json({ message: '請求書が見つかりません' }); return }

    const [itemRows] = await conn.query('SELECT * FROM invoice_items WHERE invoice_id = ?', [inv.id]) as any
    if (!itemRows.length) { await conn.rollback(); res.status(400).json({ message: '明細のない請求書は仕訳にできません' }); return }
    const grossMap = grossByTaxType(itemRows)
    const total = [...grossMap.values()].reduce((s, v) => s + v, 0)
    if (total <= 0) { await conn.rollback(); res.status(400).json({ message: '合計金額が0円のため仕訳にできません' }); return }

    const date = type === 'sales'
      ? String(inv.issue_date).slice(0, 10)
      : (req.body?.date ?? new Date().toISOString().slice(0, 10))

    const fy = await findOpenFiscalYear(conn, req.userId, date)
    if (!fy) { await conn.rollback(); res.status(400).json({ message: `${date} を含む会計年度がありません。先に会計年度を作成してください` }); return }
    if (fy.closed) { await conn.rollback(); res.status(400).json({ message: 'この日付の会計年度は締め済みです' }); return }

    const [settingRows] = await conn.query("SELECT value FROM settings WHERE key_name = 'tax_method' AND user_id = ?", [req.userId]) as any
    const taxMethod = settingRows[0]?.value === 'exclusive' ? 'exclusive' : 'inclusive'

    let lines: { side: 'debit'|'credit'; accountCode: string; partnerCode: string; amount: number; taxType: TaxType }[]
    let memo: string
    let linkColumn: 'sales_journal_id' | 'payment_journal_id'
    let newStatus: string | null = null

    if (type === 'sales') {
      if (inv.sales_journal_id) { await conn.rollback(); res.status(400).json({ message: '既に売上仕訳が作成されています' }); return }
      memo = `請求書 ${inv.invoice_no} 売上計上`
      lines = [
        { side: 'debit', accountCode: AR_CODE, partnerCode: inv.partner_code ?? '', amount: total, taxType: 'none' },
        ...[...grossMap.entries()].map(([taxType, gross]) => ({
          side: 'credit' as const, accountCode: SALES_CODE, partnerCode: '', amount: gross, taxType,
        })),
      ]
      linkColumn = 'sales_journal_id'
      if (inv.status === 'draft') newStatus = 'sent'
    } else {
      if (inv.payment_journal_id) { await conn.rollback(); res.status(400).json({ message: '既に入金仕訳が作成されています' }); return }
      memo = `請求書 ${inv.invoice_no} 入金`
      lines = [
        { side: 'debit',  accountCode: BANK_CODE, partnerCode: '', amount: total, taxType: 'none' },
        { side: 'credit', accountCode: AR_CODE, partnerCode: inv.partner_code ?? '', amount: total, taxType: 'none' },
      ]
      linkColumn = 'payment_journal_id'
      newStatus = 'paid'
    }

    const finalLines = taxMethod === 'exclusive' ? await splitTaxLines(lines, req.userId, conn) : lines
    const journalId = await insertJournal(conn, req.userId, {
      fiscalYearId: fy.id, date, memo, kind: 'normal', lines: finalLines,
    })
    await recordJournalHistory(conn, req.userId, journalId, 'create', {
      fiscalYearId: fy.id, date, memo, kind: 'normal', lines: finalLines,
    })
    await conn.query(`UPDATE invoices SET ${linkColumn} = ?${newStatus ? ', status = ?' : ''} WHERE id = ?`,
      newStatus ? [journalId, newStatus, inv.id] : [journalId, inv.id])

    await conn.commit()
    const [updRows] = await pool.query('SELECT * FROM invoices WHERE id = ?', [inv.id]) as any
    res.json(toRow({ ...updRows[0], items: itemRows }))
  } catch(e) { await conn.rollback(); next(e) } finally { conn.release() }
})

invoicesRouter.patch('/:id/status', async (req, res, next) => {
  try {
    const [result] = await pool.query('UPDATE invoices SET status = ? WHERE id = ? AND user_id = ?', [req.body.status, req.params.id, req.userId]) as any
    if (result.affectedRows === 0) { res.status(404).json({ message: '請求書が見つかりません' }); return }
    res.json({ ok: true })
  } catch(e) { next(e) }
})

invoicesRouter.delete('/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM invoices WHERE id = ? AND user_id = ?', [req.params.id, req.userId])
    res.status(204).send()
  } catch(e) { next(e) }
})
