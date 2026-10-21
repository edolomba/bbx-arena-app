/** Profile photo, or the first letter of the handle when there is none. Rings mark rank (gold #1, pink ELITE). */
const SIZES = {
  xs: 'size-7 text-xs',
  sm: 'size-9 text-sm',
  md: 'size-12 text-lg',
  lg: 'size-20 text-3xl',
  xl: 'size-28 text-4xl',
} as const;

const RINGS = {
  none: '',
  gold: 'ring-2 ring-gold ring-offset-2 ring-offset-paper',
  elite: 'ring-2 ring-sub ring-offset-2 ring-offset-paper',
  muted: 'ring-1 ring-line',
} as const;

export default function Avatar({ username, url, size = 'md', ring = 'none' }: {
  username: string; url: string | null | undefined; size?: keyof typeof SIZES; ring?: keyof typeof RINGS;
}) {
  const cls = `${SIZES[size]} ${RINGS[ring]} shrink-0 rounded-full`;
  // eslint-disable-next-line @next/next/no-img-element
  if (url) return <img src={url} alt="" loading="lazy" className={`${cls} bg-surface-2 object-cover`} />;
  const hue = [...username].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span aria-hidden="true" className={`${cls} handle grid place-items-center text-ink`}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 45% 28%), hsl(${(hue + 40) % 360} 45% 16%))` }}>
      {username.slice(0, 1).toUpperCase()}
    </span>
  );
}
