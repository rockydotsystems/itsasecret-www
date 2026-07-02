import { useState, useRef, useEffect } from 'react'

export type SelectOption = { value: string; label: string }

export type SelectProps = {
  label?: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  variant?: 'default' | 'crumb'
  className?: string
  style?: React.CSSProperties
}

export function Select({
  label,
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  variant = 'default',
  className,
  style,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick)
    }
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className={`select select-${variant} ${className || ''}`} style={style}>
      {label && <span className="select-label">{label}</span>}
      <button
        type="button"
        className="select-trigger"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="select-value">{selected?.label || placeholder || 'Select...'}</span>
        <svg className="select-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className="select-menu" role="listbox">
          {options.map((option) => (
            <li
              key={option.value}
              className={`select-option ${option.value === value ? 'selected' : ''}`}
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
