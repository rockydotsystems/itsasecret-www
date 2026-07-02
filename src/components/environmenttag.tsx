export type EnvironmentTagProps = {
  name: string
  active?: boolean
  href?: string
}

export function EnvironmentTag({ name, active = false, href }: EnvironmentTagProps) {
  const className = `env-tag${active ? ' active' : ''}`
  if (href) {
    return (
      <a href={href} className={className}>
        <span className="env-tag-dot" />
        {name}
      </a>
    )
  }
  return (
    <span className={className}>
      <span className="env-tag-dot" />
      {name}
    </span>
  )
}
