import { useEffect, useRef } from 'react'
import {
  MIN_THUMB,
  TRACK_INSET,
  TRACK_PROXIMITY,
  TRACK_THICKNESS,
  THUMB_INSET,
  distanceToRect,
  overflowAxes,
  scrollFromThumbOffset,
  thumbLayout,
  viewportRect,
  visibleRect,
} from '~/lib/virtual-scroll'

type Axis = 'x' | 'y'
type Target = HTMLElement | 'viewport'

type Drag = {
  target: Target
  axis: Axis
  pointerId: number
  startPtr: number
  startOffset: number
  thumbSize: number
  trackSize: number
  maxScroll: number
}

type Tracks = { x?: HTMLElement; y?: HTMLElement }

const FOLLOW_MS = 450

function isHtml(el: Element): el is HTMLElement {
  return el instanceof HTMLElement
}

function scrollingElement(): HTMLElement {
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

function metrics(target: Target, axis: Axis) {
  if (target === 'viewport') {
    const root = scrollingElement()
    // Transforms (the hero terminal settle translateY) extend engine
    // scrollHeight without changing layout. Size the overlay against the
    // layout box so the thumb doesn't start short/low.
    const layout = axis === 'y' ? document.body.offsetHeight : document.body.offsetWidth
    const client = axis === 'y' ? root.clientHeight : root.clientWidth
    const pos = axis === 'y' ? window.scrollY : window.scrollX
    return { scrollSize: Math.max(client, layout), clientSize: client, scrollPos: pos }
  }
  return axis === 'y'
    ? { scrollSize: target.scrollHeight, clientSize: target.clientHeight, scrollPos: target.scrollTop }
    : { scrollSize: target.scrollWidth, clientSize: target.clientWidth, scrollPos: target.scrollLeft }
}

function setScroll(target: Target, axis: Axis, value: number) {
  if (target === 'viewport') {
    if (axis === 'y') window.scrollTo({ top: value, left: window.scrollX })
    else window.scrollTo({ top: window.scrollY, left: value })
    return
  }
  if (axis === 'y') target.scrollTop = value
  else target.scrollLeft = value
}

function hostRect(target: Target) {
  if (target === 'viewport') return viewportRect()
  return visibleRect(target)
}

function collectScrollables(): HTMLElement[] {
  const out: HTMLElement[] = []
  for (const node of document.querySelectorAll('*')) {
    if (!isHtml(node)) continue
    if (node === document.documentElement || node === document.body) continue
    if (node.closest('.vscroll')) continue
    const axes = overflowAxes(node)
    if (axes.x || axes.y) out.push(node)
  }
  return out
}

export function VirtualScrollbars() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const overlay: HTMLDivElement = host

    const tracks = new Map<Target, Tracks>()
    const thumbs = new WeakMap<HTMLElement, { target: Target; axis: Axis }>()
    let drag: Drag | null = null
    let scanFrame = 0
    let followFrame = 0
    let followUntil = 0
    let resizeObserver: ResizeObserver | null = null
    const pointer = { x: -1e9, y: -1e9, inWindow: false }

    function updateNear() {
      for (const pair of tracks.values()) {
        for (const track of [pair.x, pair.y]) {
          if (!track) continue
          const dragging = Boolean(track.querySelector('.is-dragging'))
          const near =
            dragging ||
            (pointer.inWindow &&
              distanceToRect(pointer.x, pointer.y, track.getBoundingClientRect()) <= TRACK_PROXIMITY)
          track.classList.toggle('is-near', near)
        }
      }
    }

    function trackEl(target: Target, axis: Axis): HTMLElement {
      let pair = tracks.get(target)
      if (!pair) {
        pair = {}
        tracks.set(target, pair)
      }
      let track = pair[axis]
      if (!track) {
        track = document.createElement('div')
        track.className = `vscroll-track vscroll-track-${axis}${target === 'viewport' ? '' : ' is-local'}`
        const thumb = document.createElement('div')
        thumb.className = 'vscroll-thumb'
        track.appendChild(thumb)
        overlay.appendChild(track)
        thumbs.set(thumb, { target, axis })
        pair[axis] = track
      }
      return track
    }

    function dropAxis(target: Target, axis: Axis) {
      const pair = tracks.get(target)
      const track = pair?.[axis]
      if (!track) return
      track.remove()
      delete pair[axis]
      if (!pair.x && !pair.y) {
        tracks.delete(target)
        if (target !== 'viewport') resizeObserver?.unobserve(target)
      }
    }

    function paintThumb(
      target: Target,
      axis: Axis,
      trackTop: number,
      trackLeft: number,
      trackWidth: number,
      trackHeight: number,
    ) {
      const m = metrics(target, axis)
      const trackSize = axis === 'y' ? trackHeight : trackWidth
      const layout = thumbLayout(m.scrollSize, m.clientSize, m.scrollPos, trackSize)
      if (!layout) {
        dropAxis(target, axis)
        return
      }
      const track = trackEl(target, axis)
      const thumb = track.firstElementChild as HTMLElement
      track.style.top = `${trackTop}px`
      track.style.left = `${trackLeft}px`
      track.style.width = `${trackWidth}px`
      track.style.height = `${trackHeight}px`
      if (axis === 'y') {
        thumb.style.top = `${layout.offset}px`
        thumb.style.height = `${layout.size}px`
        thumb.style.left = `${THUMB_INSET}px`
        thumb.style.right = `${THUMB_INSET}px`
        thumb.style.width = 'auto'
        thumb.style.bottom = 'auto'
      } else {
        thumb.style.left = `${layout.offset}px`
        thumb.style.width = `${layout.size}px`
        thumb.style.top = `${THUMB_INSET}px`
        thumb.style.bottom = `${THUMB_INSET}px`
        thumb.style.height = 'auto'
        thumb.style.right = 'auto'
      }
      if (drag?.target === target && drag.axis === axis) {
        drag.thumbSize = layout.size
        drag.trackSize = trackSize
        drag.maxScroll = m.scrollSize - m.clientSize
      }
    }

    function layoutOne(target: Target) {
      const rect = hostRect(target)
      const axes =
        target === 'viewport'
          ? {
              x: metrics(target, 'x').scrollSize - metrics(target, 'x').clientSize > 1,
              y: metrics(target, 'y').scrollSize - metrics(target, 'y').clientSize > 1,
            }
          : overflowAxes(target)

      if (!rect || rect.width < 16 || rect.height < 16) {
        dropAxis(target, 'x')
        dropAxis(target, 'y')
        return
      }

      const origin =
        target === 'viewport' ? { top: 0, left: 0 } : overlay.getBoundingClientRect()
      const top = rect.top - origin.top
      const left = rect.left - origin.left
      const right = rect.right - origin.left
      const bottom = rect.bottom - origin.top

      const both = axes.x && axes.y
      const gutter = both ? TRACK_THICKNESS : 0

      if (axes.y) {
        paintThumb(
          target,
          'y',
          top + TRACK_INSET,
          right - TRACK_THICKNESS - TRACK_INSET,
          TRACK_THICKNESS,
          Math.max(0, rect.height - TRACK_INSET * 2 - gutter),
        )
      } else {
        dropAxis(target, 'y')
      }

      if (axes.x) {
        paintThumb(
          target,
          'x',
          bottom - TRACK_THICKNESS - TRACK_INSET,
          left + TRACK_INSET,
          Math.max(0, rect.width - TRACK_INSET * 2 - gutter),
          TRACK_THICKNESS,
        )
      } else {
        dropAxis(target, 'x')
      }
    }

    function layoutAll() {
      layoutOne('viewport')
      for (const target of [...tracks.keys()]) {
        if (target !== 'viewport') layoutOne(target)
      }
      updateNear()
    }

    function followTick() {
      layoutAll()
      if (drag || performance.now() < followUntil) {
        followFrame = requestAnimationFrame(followTick)
        return
      }
      followFrame = 0
    }

    function pokeFollow() {
      followUntil = performance.now() + FOLLOW_MS
      if (!followFrame) followFrame = requestAnimationFrame(followTick)
    }

    function scan() {
      scanFrame = 0
      const live = new Set<Target>(['viewport'])
      for (const el of collectScrollables()) {
        live.add(el)
        resizeObserver?.observe(el)
        layoutOne(el)
      }
      layoutOne('viewport')
      for (const target of [...tracks.keys()]) {
        if (!live.has(target)) {
          dropAxis(target, 'x')
          dropAxis(target, 'y')
        }
      }
      updateNear()
    }

    function scheduleScan() {
      if (scanFrame) return
      scanFrame = requestAnimationFrame(scan)
    }

    function beginDrag(thumb: HTMLElement, axis: Axis, target: Target, ev: PointerEvent) {
      const track = thumb.parentElement
      if (!track) return
      const m = metrics(target, axis)
      const trackSize = axis === 'y' ? track.clientHeight : track.clientWidth
      const layout = thumbLayout(m.scrollSize, m.clientSize, m.scrollPos, trackSize)
      if (!layout) return
      drag = {
        target,
        axis,
        pointerId: ev.pointerId,
        startPtr: axis === 'y' ? ev.clientY : ev.clientX,
        startOffset: layout.offset,
        thumbSize: layout.size,
        trackSize,
        maxScroll: m.scrollSize - m.clientSize,
      }
      thumb.classList.add('is-dragging')
      document.documentElement.classList.add('vscroll-dragging')
      pokeFollow()
      try {
        thumb.setPointerCapture(ev.pointerId)
      } catch {
        // Pointer capture is best-effort; document listeners still drive the drag.
      }
    }

    function onPointerDown(ev: PointerEvent) {
      if (ev.button !== 0) return
      const node = ev.target
      if (!(node instanceof HTMLElement)) return
      const thumb = node.closest('.vscroll-thumb')
      if (thumb instanceof HTMLElement) {
        const meta = thumbs.get(thumb)
        if (!meta) return
        ev.preventDefault()
        ev.stopPropagation()
        beginDrag(thumb, meta.axis, meta.target, ev)
        return
      }
      const track = node.closest('.vscroll-track')
      if (!(track instanceof HTMLElement)) return
      const axis: Axis = track.classList.contains('vscroll-track-y') ? 'y' : 'x'
      const thumbEl = track.firstElementChild
      if (!(thumbEl instanceof HTMLElement)) return
      const meta = thumbs.get(thumbEl)
      if (!meta) return
      ev.preventDefault()
      const m = metrics(meta.target, axis)
      const trackSize = axis === 'y' ? track.clientHeight : track.clientWidth
      const layout = thumbLayout(m.scrollSize, m.clientSize, m.scrollPos, trackSize, MIN_THUMB)
      if (!layout) return
      const ptr = axis === 'y' ? ev.clientY : ev.clientX
      const origin = axis === 'y' ? track.getBoundingClientRect().top : track.getBoundingClientRect().left
      const offset = ptr - origin - layout.size / 2
      setScroll(meta.target, axis, scrollFromThumbOffset(offset, layout.size, trackSize, m.scrollSize - m.clientSize))
      beginDrag(thumbEl, axis, meta.target, ev)
    }

    function onPointerMove(ev: PointerEvent) {
      pointer.x = ev.clientX
      pointer.y = ev.clientY
      pointer.inWindow = true
      updateNear()
      if (!drag || ev.pointerId !== drag.pointerId) return
      ev.preventDefault()
      const ptr = drag.axis === 'y' ? ev.clientY : ev.clientX
      const offset = drag.startOffset + (ptr - drag.startPtr)
      setScroll(
        drag.target,
        drag.axis,
        scrollFromThumbOffset(offset, drag.thumbSize, drag.trackSize, drag.maxScroll),
      )
      layoutOne(drag.target)
    }

    function endDrag(ev: PointerEvent) {
      if (!drag || ev.pointerId !== drag.pointerId) return
      const pair = tracks.get(drag.target)
      const track = pair?.[drag.axis]
      track?.querySelector('.vscroll-thumb')?.classList.remove('is-dragging')
      document.documentElement.classList.remove('vscroll-dragging')
      drag = null
      pokeFollow()
      updateNear()
    }

    function onPointerLeave() {
      pointer.inWindow = false
      updateNear()
    }

    function onMutations(records: MutationRecord[]) {
      for (const record of records) {
        if (overlay.contains(record.target)) continue
        scheduleScan()
        return
      }
    }

    const mutate = new MutationObserver(onMutations)
    mutate.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
    })
    resizeObserver = new ResizeObserver(scheduleScan)
    resizeObserver.observe(document.documentElement)

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', endDrag)
    document.addEventListener('pointercancel', endDrag)
    document.documentElement.addEventListener('pointerleave', onPointerLeave)
    document.addEventListener('load', scheduleScan, true)
    window.addEventListener('scroll', pokeFollow, true)
    window.addEventListener('wheel', pokeFollow, { capture: true, passive: true })
    window.addEventListener('resize', scheduleScan)

    scan()

    return () => {
      mutate.disconnect()
      resizeObserver?.disconnect()
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', endDrag)
      document.removeEventListener('pointercancel', endDrag)
      document.documentElement.removeEventListener('pointerleave', onPointerLeave)
      document.removeEventListener('load', scheduleScan, true)
      window.removeEventListener('scroll', pokeFollow, true)
      window.removeEventListener('wheel', pokeFollow, true)
      window.removeEventListener('resize', scheduleScan)
      if (scanFrame) cancelAnimationFrame(scanFrame)
      if (followFrame) cancelAnimationFrame(followFrame)
      document.documentElement.classList.remove('vscroll-dragging')
      overlay.replaceChildren()
      tracks.clear()
    }
  }, [])

  return <div ref={hostRef} className="vscroll" aria-hidden="true" />
}
