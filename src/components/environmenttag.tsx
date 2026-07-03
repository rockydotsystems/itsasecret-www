export type EnvironmentTagProps = {
  name: string
  active?: boolean
  href?: string
  onClick?: () => void
}

export function EnvironmentTag({ name, active = false, href, onClick }: EnvironmentTagProps) {
  const className = `env-tag${active ? ' active' : ''}`
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        <span className="env-tag-dot" />
        {name}
      </button>
    )
  }
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
