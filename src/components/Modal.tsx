import { type ReactNode } from 'react'

interface ModalProps {
  title: ReactNode
  onClose: () => void
  onSubmit: () => void
  submitLabel?: string
  children: ReactNode
}

export default function Modal({ title, onClose, onSubmit, submitLabel = '保存', children }: ModalProps) {
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <h3>{title}</h3>
        {children}
        <div className="modal-footer">
          <button onClick={onClose}>キャンセル</button>
          <button className="primary" onClick={onSubmit}>{submitLabel}</button>
        </div>
      </div>
    </div>
  )
}
