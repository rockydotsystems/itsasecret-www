import type { ReactNode } from 'react'

export type ButtonProps = {
  id?: string
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  href?: string
  type?: 'button' | 'submit'
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
  children: ReactNode
}

export function Button({
  id,
  variant = 'primary',
  size = 'md',
  disabled = false,
  href,
  type = 'button',
  className: cls,
  style,
  onClick,
  children,
}: ButtonProps) {
  const c = `btn btn-${variant} btn-${size}${cls ? ` ${cls}` : ''}`
  if (href) {
    return (
      <a id={id} href={href} className={c} style={style} aria-disabled={disabled}>
        {children}
      </a>
    )
  }
  return (
    <button id={id} type={type} disabled={disabled} className={c} style={style} onClick={onClick}>
      {children}
    </button>
  )
}
