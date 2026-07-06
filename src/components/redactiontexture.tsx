import { useEffect, useState } from 'react'

// Deterministic PRNG (mulberry32) - the layout must be identical on the
// server and the client or hydration breaks, so no Math.random() here.
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DESIGN_WIDTH = 1920
const MAX_ROWS = 28

type Row = { offset: number; widths: number[] }

function buildRows(): Row[] {
  const rand = mulberry32(1069)
  const rows: Row[] = []
  for (let r = 0; r < MAX_ROWS; r++) {
    const offset = Math.round(rand() * 48) - 24
    const widths: number[] = []
    let x = offset
    while (x < DESIGN_WIDTH) {
      const width = Math.round(70 + rand() * 170)
      widths.push(width)
      x += width + 16
    }
    rows.push({ offset, widths })
  }
  return rows
}

const ROWS = buildRows()

const PROCESS_MS = 2600
const MAX_STAGGER_MS = 700

// Redaction-bar texture for marketing heroes. Every now and then a few
// random bars light up in brand orange, "process", and settle back down.
export function RedactionTexture({ rows = MAX_ROWS }: { rows?: number }) {
  const visible = ROWS.slice(0, rows)
  // key "row-bar" → animation-delay in ms, so the group starts staggered.
  const [active, setActive] = useState<ReadonlyMap<string, number>>(new Map())

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let timer: number
    const flash = () => {
      const count = 2 + Math.floor(Math.random() * 2)
      const picks = new Map<string, number>()
      while (picks.size < count) {
        // Stick to the upper rows - the mask fades the lower ones out anyway.
        const row = Math.floor(Math.random() * Math.max(1, Math.floor(rows * 0.6)))
        const bar = Math.floor(Math.random() * ROWS[row].widths.length)
        picks.set(`${row}-${bar}`, Math.round(Math.random() * MAX_STAGGER_MS))
      }
      setActive(picks)
      timer = window.setTimeout(rest, PROCESS_MS + MAX_STAGGER_MS)
    }
    const rest = () => {
      setActive(new Map())
      timer = window.setTimeout(flash, 1500 + Math.random() * 4000)
    }
    timer = window.setTimeout(flash, 800 + Math.random() * 2000)
    return () => window.clearTimeout(timer)
  }, [rows])

  return (
    <div className="redaction-bars" aria-hidden="true">
      {visible.map((row, r) => (
        <div className="redaction-row" key={r} style={{ marginLeft: row.offset }}>
          {row.widths.map((width, i) => {
            const delay = active.get(`${r}-${i}`)
            return (
              <span
                key={i}
                className={delay === undefined ? 'redaction-bar' : 'redaction-bar is-processing'}
                style={delay === undefined ? { width } : { width, animationDelay: `${delay}ms` }}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
