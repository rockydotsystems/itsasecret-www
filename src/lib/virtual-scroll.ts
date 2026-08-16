export const MIN_THUMB = 24
export const TRACK_THICKNESS = 8
export const TRACK_INSET = 3
export const THUMB_INSET = 2
export const TRACK_PROXIMITY = 48

export type Rect = {
  top: number
  left: number
  width: number
  height: number
  right: number
  bottom: number
}

export type ThumbLayout = {
  size: number
  offset: number
}

export function thumbLayout(
  scrollSize: number,
  clientSize: number,
  scrollPos: number,
  trackSize: number,
  minThumb = MIN_THUMB,
): ThumbLayout | null {
  const maxScroll = scrollSize - clientSize
  if (maxScroll <= 1 || trackSize <= 0) return null
  const size = Math.min(trackSize, Math.max(minThumb, (clientSize / scrollSize) * trackSize))
  const maxOffset = Math.max(0, trackSize - size)
  const clamped = Math.min(maxScroll, Math.max(0, scrollPos))
  const offset = maxOffset === 0 ? 0 : (clamped / maxScroll) * maxOffset
  return { size, offset }
}

export function scrollFromThumbOffset(
  offset: number,
  thumbSize: number,
  trackSize: number,
  maxScroll: number,
): number {
  const maxOffset = Math.max(0, trackSize - thumbSize)
  if (maxOffset === 0) return 0
  const clamped = Math.min(maxOffset, Math.max(0, offset))
  return (clamped / maxOffset) * maxScroll
}

export function distanceToRect(x: number, y: number, r: Pick<Rect, 'top' | 'left' | 'right' | 'bottom'>): number {
  const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0
  const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
  return Math.hypot(dx, dy)
}

export function intersect(a: Rect, b: Rect): Rect | null {
  const left = Math.max(a.left, b.left)
  const top = Math.max(a.top, b.top)
  const right = Math.min(a.right, b.right)
  const bottom = Math.min(a.bottom, b.bottom)
  const width = right - left
  const height = bottom - top
  if (width <= 0 || height <= 0) return null
  return { left, top, right, bottom, width, height }
}

export function fromDomRect(r: DOMRectReadOnly): Rect {
  return { top: r.top, left: r.left, width: r.width, height: r.height, right: r.right, bottom: r.bottom }
}

export function viewportRect(): Rect {
  const width = window.innerWidth
  const height = window.innerHeight
  return { top: 0, left: 0, width, height, right: width, bottom: height }
}

/** tx/ty from a computed `transform` (always `none` / `matrix()` / `matrix3d()`). */
export function translationOf(transform: string): { x: number; y: number } {
  if (!transform || transform === 'none') return { x: 0, y: 0 }
  if (transform.startsWith('matrix3d(')) {
    const n = transform.slice(9, -1).split(',').map((v) => Number(v))
    return { x: n[12] ?? 0, y: n[13] ?? 0 }
  }
  if (transform.startsWith('matrix(')) {
    const n = transform.slice(7, -1).split(',').map((v) => Number(v))
    return { x: n[4] ?? 0, y: n[5] ?? 0 }
  }
  return { x: 0, y: 0 }
}

function ancestorTranslation(el: HTMLElement): { x: number; y: number } {
  let x = 0
  let y = 0
  let node: HTMLElement | null = el
  while (node && node !== document.documentElement) {
    const t = translationOf(getComputedStyle(node).transform)
    x += t.x
    y += t.y
    node = node.parentElement
  }
  return { x, y }
}

/** Viewport rect of the layout box, ignoring CSS translates (animations included). */
export function layoutRect(el: HTMLElement): Rect {
  const rect = fromDomRect(el.getBoundingClientRect())
  const { x, y } = ancestorTranslation(el)
  const top = rect.top - y
  const left = rect.left - x
  return { top, left, width: rect.width, height: rect.height, right: left + rect.width, bottom: top + rect.height }
}

export function visibleRect(el: HTMLElement): Rect | null {
  let rect: Rect | null = layoutRect(el)
  let parent = el.parentElement
  while (rect && parent && parent !== document.documentElement) {
    const style = getComputedStyle(parent)
    const contain = style.contain
    const clips =
      style.overflowX !== 'visible' ||
      style.overflowY !== 'visible' ||
      contain === 'strict' ||
      contain === 'content' ||
      contain.includes('paint') ||
      contain.includes('layout')
    if (clips) {
      rect = intersect(rect, layoutRect(parent))
    }
    parent = parent.parentElement
  }
  return rect ? intersect(rect, viewportRect()) : null
}

export function overflowAxes(el: HTMLElement): { x: boolean; y: boolean } {
  const style = getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden') return { x: false, y: false }
  const allows = (value: string) => value === 'auto' || value === 'scroll' || value === 'overlay'
  const x = allows(style.overflowX) && el.scrollWidth - el.clientWidth > 1
  const y = allows(style.overflowY) && el.scrollHeight - el.clientHeight > 1
  return { x, y }
}
