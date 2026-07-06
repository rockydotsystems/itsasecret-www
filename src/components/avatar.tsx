import { useEffect, useId, useState } from 'react'

// User avatars are the Gravatar for the account email when one exists; the
// fallback (no email, no Gravatar, or the stock default) is a locally-drawn
// "boring avatars" marble - a port of boringavatars.com's marble variant
// (MIT), the blurred-gradient one, recolored with the brand palette. No
// external fallback service, deterministic per name/email.

const PALETTE = ['#3B352C', '#4C7EA8', '#2F9E58', '#9C2E09', '#D98A1E', '#766A56']

const SIZE_PX = { sm: 24, md: 32, lg: 44 }

function hashCode(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i)
    hash = hash & hash
  }
  return Math.abs(hash)
}

function getDigit(number: number, ntn: number): number {
  return Math.floor((number / Math.pow(10, ntn)) % 10)
}

function getUnit(number: number, range: number, index?: number): number {
  const value = number % range
  if (index && getDigit(number, index) % 2 === 0) return -value
  return value
}

const MARBLE = 80
const MARBLE_ELEMENTS = 3

function marbleData(key: string) {
  const num = hashCode(key)
  return Array.from({ length: MARBLE_ELEMENTS }, (_, i) => ({
    color: PALETTE[(num + i) % PALETTE.length],
    translateX: getUnit(num * (i + 1), MARBLE / 10, 1),
    translateY: getUnit(num * (i + 1), MARBLE / 10, 2),
    scale: 1.2 + getUnit(num * (i + 1), MARBLE / 20) / 10,
    rotate: getUnit(num * (i + 1), 360, 1),
  }))
}

function MarbleFallback({ seed, size }: { seed: string; size: number }) {
  const id = useId()
  const layers = marbleData(seed)
  return (
    <svg viewBox={`0 0 ${MARBLE} ${MARBLE}`} width={size} height={size} fill="none" role="img" aria-hidden="true">
      <mask id={`mask_${id}`} maskUnits="userSpaceOnUse" x={0} y={0} width={MARBLE} height={MARBLE}>
        <rect width={MARBLE} height={MARBLE} fill="#FFFFFF" />
      </mask>
      <g mask={`url(#mask_${id})`}>
        <rect width={MARBLE} height={MARBLE} fill={layers[0].color} />
        <path
          filter={`url(#filter_${id})`}
          d="M32.414 59.35L50.376 70.5H72.5v-71H33.728L26.5 13.381l19.057 27.08L32.414 59.35z"
          fill={layers[1].color}
          transform={`translate(${layers[1].translateX} ${layers[1].translateY}) rotate(${layers[1].rotate} ${MARBLE / 2} ${MARBLE / 2}) scale(${layers[2].scale})`}
        />
        <path
          filter={`url(#filter_${id})`}
          style={{ mixBlendMode: 'overlay' }}
          d="M22.216 24L0 46.75l14.108 38.129L78 86l-3.081-59.276-22.378 4.005 12.972 20.186-23.35 27.395L22.215 24z"
          fill={layers[2].color}
          transform={`translate(${layers[2].translateX} ${layers[2].translateY}) rotate(${layers[2].rotate} ${MARBLE / 2} ${MARBLE / 2}) scale(${layers[2].scale})`}
        />
      </g>
      <defs>
        <filter id={`filter_${id}`} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood floodOpacity={0} result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation={7} result="effect1_foregroundBlur" />
        </filter>
      </defs>
    </svg>
  )
}

async function gravatarUrl(email: string, sizePx: number): Promise<string> {
  const normalized = email.trim().toLowerCase()
  const bytes = new TextEncoder().encode(normalized)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  // d=404 instead of a default image: accounts without a real (non-stock)
  // Gravatar get a 404, which keeps the marble fallback visible.
  return `https://gravatar.com/avatar/${hash}?d=404&s=${sizePx * 2}`
}

export type AvatarProps = {
  name?: string
  // When set, the Gravatar for this email is layered over the marble fallback
  // once it loads. Omit for non-user avatars (teams).
  email?: string
  size?: 'sm' | 'md' | 'lg'
}

export function Avatar({ name = '?', email, size = 'md' }: AvatarProps) {
  const px = SIZE_PX[size]
  const [gravatar, setGravatar] = useState<string | null>(null)
  const [gravatarLoaded, setGravatarLoaded] = useState(false)

  useEffect(() => {
    setGravatar(null)
    setGravatarLoaded(false)
    if (!email) return
    let cancelled = false
    void gravatarUrl(email, px).then((url) => {
      if (!cancelled) setGravatar(url)
    })
    return () => {
      cancelled = true
    }
  }, [email, px])

  return (
    <div title={name} className={`avatar avatar-${size}`}>
      <MarbleFallback seed={(email ?? name).trim().toLowerCase()} size={px} />
      {gravatar && (
        <img
          src={gravatar}
          alt=""
          width={px}
          height={px}
          className={`avatar-gravatar${gravatarLoaded ? ' avatar-gravatar-loaded' : ''}`}
          onLoad={() => setGravatarLoaded(true)}
          onError={() => setGravatar(null)}
        />
      )}
    </div>
  )
}
