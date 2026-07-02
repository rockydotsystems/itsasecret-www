export type ToggleProps = {
  checked?: boolean
  disabled?: boolean
  label?: string
  id?: string
}

export function Toggle({ checked = false, disabled = false, label, id }: ToggleProps) {
  const control = (
    <span
      role="switch"
      aria-checked={checked}
      aria-label={label || 'toggle'}
      className={`toggle${checked ? ' toggle-checked' : ''}`}
      aria-disabled={disabled}
      data-toggle-target={id}
    >
      <span className={`toggle-thumb ${checked ? 'toggle-thumb-checked' : 'toggle-thumb-unchecked'}`} />
    </span>
  )

  if (!label) return control

  return (
    <label className="toggle-label">
      {control}
      {label}
    </label>
  )
}
