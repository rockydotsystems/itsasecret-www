import type { ReactNode } from 'react'

export type BadgeProps = {
  variant?: 'neutral' | 'signal' | 'success' | 'danger' | 'warning' | 'info'
  dot?: boolean
  children: ReactNode
}

export function Badge({ variant = 'neutral', dot = false, children }: BadgeProps) {
  return (
    <span className={`badge badge-${variant}`}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  )
}
