import { useRef, useState, type ReactNode } from 'react'

interface ModalProps {
  title: ReactNode
  onClose: () => void
  onSubmit: () => void | Promise<void>
  submitLabel?: string
  children: ReactNode
}

export default function Modal({ title, onClose, onSubmit, submitLabel = '保存', children }: ModalProps) {
  const [busy, setBusy] = useState(false)
  // 二重送信防止：ref で同期的にガード（state だけだと連打時に再レンダー前の2クリック目を取りこぼす）
  const busyRef = useRef(false)

  const handleSubmit = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await onSubmit()
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className="modal">
        <h3>{title}</h3>
        {children}
        <div className="modal-footer">
          <button onClick={onClose} disabled={busy}>キャンセル</button>
          <button className="primary" onClick={handleSubmit} disabled={busy}>
            {busy ? '保存中...' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
