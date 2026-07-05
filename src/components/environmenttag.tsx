export type EnvironmentTagProps = {
  name: string
  active?: boolean
  // Marks a live/production environment: the dot turns red and pulses.
  live?: boolean
  href?: string
  onClick?: () => void
}

export function EnvironmentTag({ name, active = false, live = false, href, onClick }: EnvironmentTagProps) {
  const className = `env-tag${active ? ' active' : ''}${live ? ' live' : ''}`
  const inner = (
    <>
      <span className="env-tag-dot" />
      {name}
      {live && <span className="env-tag-live-label">live</span>}
    </>
  )
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {inner}
      </button>
    )
  }
  if (href) {
    return (
      <a href={href} className={className}>
        {inner}
      </a>
    )
  }
  return <span className={className}>{inner}</span>
}
