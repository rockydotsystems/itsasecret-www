import { useState, useRef, useEffect } from 'react'
import { IconChevronDown } from 'nucleo-pixel-essential'

export type SelectOption = { value: string; label: string }

export type SelectProps = {
  label?: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  variant?: 'default' | 'crumb'
  action?: React.ReactNode
  optionAction?: (option: SelectOption) => React.ReactNode
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
  action,
  optionAction,
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
        <IconChevronDown className="select-chevron" size={16} aria-hidden="true" />
      </button>
      {open && (
        <ul className="select-menu" role="listbox">
          {options.map((option) => (
            <li key={option.value} className="select-row" role="presentation">
              <span
                className={`select-option ${option.value === value ? 'selected' : ''}`}
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
              >
                {option.label}
              </span>
              {optionAction && (
                <span className="select-option-action" onClick={() => setOpen(false)}>
                  {optionAction(option)}
                </span>
              )}
            </li>
          ))}
          {action && (
            <li className="select-action" onClick={() => setOpen(false)}>
              {action}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
