import { Router } from 'express'
import { pool } from '../db.js'

export const invoicesRouter = Router()

interface InvoiceItem { description: string; qty: number; unitPrice: number; taxType: 'taxable10'|'taxable8'|'exempt' }
interface InvoiceBody  { partnerCode: string; partnerName: string; partnerAddr: string; issueDate: string; dueDate: string; memo: string; items: InvoiceItem[] }

function toRow(r: any) {
  return {
    id: r.id, invoiceNo: r.invoice_no,
    partnerCode: r.partner_code, partnerName: r.partner_name, partnerAddr: r.partner_addr,
    issueDate: String(r.issue_date).slice(0,10), dueDate: String(r.due_date).slice(0,10),
    memo: r.memo, status: r.status,
    items: (r.items ?? []).map((i: any) => ({ id: i.id, description: i.description, qty: Number(i.qty), unitPrice: i.unit_price, taxType: i.tax_type }))
  }
}

async function genInvoiceNo() {
  const prefix = `INV-${new Date().getFullYear()}-`
  const [rows] = await pool.query('SELECT invoice_no FROM invoices WHERE invoice_no LIKE ? ORDER BY id DESC LIMIT 1', [`${prefix}%`]) as any
  const last = rows[0]?.invoice_no
  const seq  = last ? parseInt(last.split('-').pop()) + 1 : 1
  return `${prefix}${String(seq).padStart(4, '0')}`
}

invoicesRouter.get('/', async (_req, res, next) => {
  try {
    const [invoices] = await pool.query('SELECT * FROM invoices ORDER BY issue_date DESC, id DESC') as any
    const [items]    = await pool.query('SELECT * FROM invoice_items ORDER BY id') as any
    const result = invoices.map((inv: any) => toRow({ ...inv, items: items.filter((i: any) => i.invoice_id === inv.id) }))
    res.json(result)
  } catch(e) { next(e) }
})

invoicesRouter.post('/', async (req, res, next) => {
  const b = req.body as InvoiceBody
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const invoiceNo = await genInvoiceNo()
    const [r] = await conn.query(
      'INSERT INTO invoices (invoice_no, partner_code, partner_name, partner_addr, issue_date, due_date, memo) VALUES (?,?,?,?,?,?,?)',
      [invoiceNo, b.partnerCode, b.partnerName, b.partnerAddr, b.issueDate, b.dueDate, b.memo]
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
    await conn.query(
      'UPDATE invoices SET partner_code=?, partner_name=?, partner_addr=?, issue_date=?, due_date=?, memo=? WHERE id=?',
      [b.partnerCode, b.partnerName, b.partnerAddr, b.issueDate, b.dueDate, b.memo, req.params.id]
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

invoicesRouter.patch('/:id/status', async (req, res, next) => {
  try {
    await pool.query('UPDATE invoices SET status = ? WHERE id = ?', [req.body.status, req.params.id])
    res.json({ ok: true })
  } catch(e) { next(e) }
})

invoicesRouter.delete('/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM invoices WHERE id = ?', [req.params.id])
    res.status(204).send()
  } catch(e) { next(e) }
})
