export type ButtonProps = {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  href?: string;
  type?: 'button' | 'submit';
  class?: string;
  children: any;
};

export const Button = ({
  variant = 'primary',
  size = 'md',
  disabled = false,
  href,
  type = 'button',
  class: cls,
  children,
}: ButtonProps) => {
  const className = `btn btn-${variant} btn-${size}${cls ? ` ${cls}` : ''}`;
  if (href) {
    return (
      <a href={href} class={className} aria-disabled={disabled}>
        {children}
      </a>
    );
  }
  return (
    <button type={type} disabled={disabled} class={className}>
      {children}
    </button>
  );
};
