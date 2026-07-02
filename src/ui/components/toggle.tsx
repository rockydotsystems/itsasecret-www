export type ToggleProps = {
  checked?: boolean;
  disabled?: boolean;
  label?: string;
  id?: string;
};

export const Toggle = ({ checked = false, disabled = false, label, id }: ToggleProps) => {
  void disabled;
  const control = (
    <span
      role="switch"
      aria-checked={checked}
      aria-label={label || 'toggle'}
      class={`toggle${checked ? ' toggle-checked' : ''}`}
      data-toggle-target={id}
    >
      <span class={`toggle-thumb ${checked ? 'toggle-thumb-checked' : 'toggle-thumb-unchecked'}`} />
    </span>
  );

  if (!label) return control;

  return (
    <label class="toggle-label">
      {control}
      {label}
    </label>
  );
};
