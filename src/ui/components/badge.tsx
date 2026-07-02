export type BadgeProps = {
  variant?: 'neutral' | 'signal' | 'success' | 'danger' | 'warning' | 'info';
  dot?: boolean;
  children: any;
};

export const Badge = ({ variant = 'neutral', dot = false, children }: BadgeProps) => (
  <span class={`badge badge-${variant}`}>
    {dot && <span class="badge-dot" />}
    {children}
  </span>
);
