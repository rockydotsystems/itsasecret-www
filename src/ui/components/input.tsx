export type InputProps = {
  label?: string;
  name?: string;
  placeholder?: string;
  helperText?: string;
  error?: string;
  mono?: boolean;
  disabled?: boolean;
  type?: string;
  value?: string;
  required?: boolean;
};

export const Input = ({
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
}: InputProps) => (
  <div class="input-group">
    {label && <label class="input-label" for={name}>{label}</label>}
    <input
      type={type}
      name={name}
      id={name}
      placeholder={placeholder}
      disabled={disabled}
      value={value}
      required={required}
      class={`input-field${mono ? ' input-mono' : ''}${error ? ' input-error-border' : ''}`}
    />
    {(helperText || error) && (
      <span class={error ? 'input-error' : 'input-helper'}>{error || helperText}</span>
    )}
  </div>
);
