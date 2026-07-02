export type EnvironmentTagProps = {
  name: string;
  active?: boolean;
  href?: string;
};

export const EnvironmentTag = ({ name, active = false, href }: EnvironmentTagProps) => {
  const className = `env-tag${active ? ' active' : ''}`;
  if (href) {
    return (
      <a href={href} class={className}>
        <span class="env-tag-dot" />
        {name}
      </a>
    );
  }
  return (
    <span class={className}>
      <span class="env-tag-dot" />
      {name}
    </span>
  );
};
