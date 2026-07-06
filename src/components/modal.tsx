import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { IconXmark } from 'nucleo-pixel-essential'

export type ModalProps = {
  title: string
  subtitle?: string
  // Wider layout for content-heavy modals (e.g. history lists).
  wide?: boolean
  onClose: () => void
  children: ReactNode
}

export function Modal({ title, subtitle, wide = false, onClose, children }: ModalProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`card modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            <IconXmark size={16} aria-hidden="true" />
          </button>
        </div>
        {subtitle && <p className="modal-subtitle">{subtitle}</p>}
        {children}
      </div>
    </div>
  )
}
