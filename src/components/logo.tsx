export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size * 1.25} height={size} viewBox="0 0 80 64" xmlns="http://www.w3.org/2000/svg">
      <g stroke="#F5581E" strokeWidth="6" fill="none" strokeLinecap="square" strokeLinejoin="miter">
        <path d="M22 33 H4 V43 H22 V53 H4" />
        <path d="M30 33 H48 V53" />
        <path d="M56 33 H74 V53" />
        <path d="M30 53 V21 L37 11 H49 L56 21 V53" />
      </g>
    </svg>
  )
}

export function LogoWordmark({ width = 200 }: { width?: number }) {
  return (
    <svg width={width} height={width * 0.2} viewBox="0 0 320 64" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(0,4) scale(0.72)" stroke="#F5581E" strokeWidth="6" fill="none" strokeLinecap="square" strokeLinejoin="miter">
        <path d="M22 33 H4 V43 H22 V53 H4" />
        <path d="M30 33 H48 V53" />
        <path d="M56 33 H74 V53" />
        <path d="M30 53 V21 L37 11 H49 L56 21 V53" />
      </g>
      <text x="72" y="42" fontFamily="'Zilla Slab', Georgia, serif" fontWeight="600" fontSize="29" fill="currentColor">itsa</text>
      <g fill="#F5581E">
        <circle cx="146" cy="34" r="4" />
        <circle cx="159" cy="34" r="4" />
        <circle cx="172" cy="34" r="4" />
        <circle cx="185" cy="34" r="4" />
        <circle cx="198" cy="34" r="4" />
        <circle cx="211" cy="34" r="4" />
      </g>
      <text x="225" y="42" fontFamily="'Zilla Slab', Georgia, serif" fontWeight="600" fontSize="29" fill="currentColor">.dev</text>
    </svg>
  )
}
