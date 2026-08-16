import { useEffect, useRef, useState } from 'react'
import {
  MUDDLE_MS,
  REVEAL_CHARS,
  SLOGANS,
  TICK_MS,
  buildCipher,
  buildTape,
  tickChars,
} from '~/lib/slogan-ticker'

const TAPE = buildTape()
const CIPHER = buildCipher(TAPE.length)

export function SloganTicker() {
  const rootRef = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLSpanElement>(null)
  const [tick, setTick] = useState(0)
  const [muddleTick, setMuddleTick] = useState(0)
  const [cols, setCols] = useState(64)

  useEffect(() => {
    const root = rootRef.current
    const probe = probeRef.current
    if (!root || !probe) return
    const box: HTMLDivElement = root
    const glyph: HTMLSpanElement = probe

    function measure() {
      const w = glyph.getBoundingClientRect().width
      if (w <= 0) return
      setCols(Math.max(1, Math.ceil(box.clientWidth / w)))
    }

    measure()
    void document.fonts.ready.then(measure)
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const shift = window.setInterval(() => {
      setTick((t) => t + 1)
    }, TICK_MS)
    const muddle = window.setInterval(() => {
      setMuddleTick((t) => t + 1)
    }, MUDDLE_MS)
    return () => {
      window.clearInterval(shift)
      window.clearInterval(muddle)
    }
  }, [])

  const chars = tickChars(TAPE, CIPHER, tick, cols, REVEAL_CHARS, muddleTick)

  return (
    <div
      ref={rootRef}
      className="slogan-ticker"
      aria-label={SLOGANS.join(' // ')}
    >
      <span ref={probeRef} className="slogan-ticker-probe" aria-hidden="true">
        M
      </span>
      <span className="slogan-ticker-row" aria-hidden="true">
        {chars.map((c, i) => (
          <span
            key={i}
            className={c.gap ? 'is-gap' : c.revealed ? 'is-clear' : 'is-muddle'}
          >
            {c.ch === ' ' ? '\u00a0' : c.ch}
          </span>
        ))}
      </span>
    </div>
  )
}
