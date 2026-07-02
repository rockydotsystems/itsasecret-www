export type InputProps = {
  label?: string
  name?: string
  placeholder?: string
  helperText?: string
  error?: string
  mono?: boolean
  disabled?: boolean
  type?: string
  value?: string
  required?: boolean
}

export function Input({
  label,
  name,
  placeholder,
  helperText,
  error,
  mono = false,
  disabled = false,
  type = 'text',
  value,
  required,
}: InputProps) {
  return (
    <div className="input-group">
      {label && <label className="input-label" htmlFor={name}>{label}</label>}
      <input
        type={type}
        name={name}
        id={name}
        placeholder={placeholder}
        disabled={disabled}
        defaultValue={value}
        required={required}
        className={`input-field${mono ? ' input-mono' : ''}${error ? ' input-error-border' : ''}`}
      />
      {(helperText || error) && (
        <span className={error ? 'input-error' : 'input-helper'}>{error || helperText}</span>
      )}
    </div>
  )
}
