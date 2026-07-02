const PALETTE = [
  { bg: '#3B352C', fg: '#F5F0E6' },
  { bg: '#4C7EA8', fg: '#FFFFFF' },
  { bg: '#2F9E58', fg: '#FFFFFF' },
  { bg: '#9C2E09', fg: '#FFFFFF' },
  { bg: '#D98A1E', fg: '#18140F' },
  { bg: '#766A56', fg: '#FCFAF6' },
];

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export type AvatarProps = {
  name?: string;
  size?: 'sm' | 'md' | 'lg';
};

export const Avatar = ({ name = '?', size = 'md' }: AvatarProps) => {
  const colors = PALETTE[hashString(name) % PALETTE.length];
  return (
    <div
      title={name}
      class={`avatar avatar-${size}`}
      style={`background:${colors.bg};color:${colors.fg}`}
    >
      {initials(name)}
    </div>
  );
};
