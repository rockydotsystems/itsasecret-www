import { describe, it, expect } from 'vitest'
import { thumbLayout, scrollFromThumbOffset, intersect, translationOf, distanceToRect } from './virtual-scroll'

describe('thumbLayout', () => {
  it('returns null when content fits', () => {
    expect(thumbLayout(800, 800, 0, 800)).toBeNull()
    expect(thumbLayout(800, 801, 0, 800)).toBeNull()
  })

  it('sizes the thumb by the visible ratio, never below the minimum', () => {
    const half = thumbLayout(1000, 500, 0, 1000, 24)
    expect(half).toEqual({ size: 500, offset: 0 })

    const tiny = thumbLayout(10_000, 100, 0, 400, 24)
    expect(tiny?.size).toBe(24)
  })

  it('places the thumb at the end when scrolled to the end', () => {
    const layout = thumbLayout(1000, 500, 500, 1000, 24)
    expect(layout).toEqual({ size: 500, offset: 500 })
  })

  it('clamps overscroll', () => {
    const before = thumbLayout(1000, 500, -40, 1000, 24)
    expect(before?.offset).toBe(0)
    const after = thumbLayout(1000, 500, 999, 1000, 24)
    expect(after?.offset).toBe(500)
  })
})

describe('scrollFromThumbOffset', () => {
  it('inverts thumbLayout at the ends', () => {
    expect(scrollFromThumbOffset(0, 500, 1000, 500)).toBe(0)
    expect(scrollFromThumbOffset(500, 500, 1000, 500)).toBe(500)
  })

  it('clamps offsets outside the track', () => {
    expect(scrollFromThumbOffset(-20, 500, 1000, 500)).toBe(0)
    expect(scrollFromThumbOffset(800, 500, 1000, 500)).toBe(500)
  })
})

describe('intersect', () => {
  it('returns the overlapping box', () => {
    expect(
      intersect(
        { top: 0, left: 0, width: 100, height: 100, right: 100, bottom: 100 },
        { top: 50, left: 50, width: 100, height: 100, right: 150, bottom: 150 },
      ),
    ).toEqual({ top: 50, left: 50, width: 50, height: 50, right: 100, bottom: 100 })
  })

  it('returns null when boxes miss', () => {
    expect(
      intersect(
        { top: 0, left: 0, width: 10, height: 10, right: 10, bottom: 10 },
        { top: 20, left: 20, width: 10, height: 10, right: 30, bottom: 30 },
      ),
    ).toBeNull()
  })
})

describe('translationOf', () => {
  it('reads none as zero', () => {
    expect(translationOf('none')).toEqual({ x: 0, y: 0 })
    expect(translationOf('')).toEqual({ x: 0, y: 0 })
  })

  it('reads 2d matrix translates', () => {
    expect(translationOf('matrix(1, 0, 0, 1, 0, 14)')).toEqual({ x: 0, y: 14 })
    expect(translationOf('matrix(1, 0, 0, 1, -8, 0)')).toEqual({ x: -8, y: 0 })
  })

  it('reads matrix3d translates', () => {
    expect(translationOf('matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 14, 0, 1)')).toEqual({
      x: 0,
      y: 14,
    })
  })
})

describe('distanceToRect', () => {
  const box = { top: 10, left: 10, right: 20, bottom: 30 }

  it('is zero inside and on the edge', () => {
    expect(distanceToRect(15, 20, box)).toBe(0)
    expect(distanceToRect(10, 10, box)).toBe(0)
  })

  it('is the gap to the nearest edge', () => {
    expect(distanceToRect(10, 0, box)).toBe(10)
    expect(distanceToRect(0, 20, box)).toBe(10)
    expect(distanceToRect(0, 0, box)).toBeCloseTo(Math.hypot(10, 10))
  })
})
