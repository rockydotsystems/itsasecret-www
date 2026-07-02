import type { ReactNode } from 'react'

export type ButtonProps = {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  href?: string
  type?: 'button' | 'submit'
  className?: string
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  href,
  type = 'button',
  className: cls,
  children,
}: ButtonProps) {
  const c = `btn btn-${variant} btn-${size}${cls ? ` ${cls}` : ''}`
  if (href) {
    return (
      <a href={href} className={c} aria-disabled={disabled}>
        {children}
      </a>
    )
  }
  return (
    <button type={type} disabled={disabled} className={c}>
      {children}
    </button>
  )
}
