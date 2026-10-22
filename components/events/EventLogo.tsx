/** The event's logo, or its initial on a dark tile. */
export default function EventLogo({ name, url, size = 'md' }: { name: string; url: string | null | undefined; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'size-24 rounded-2xl text-4xl sm:size-28' : size === 'sm' ? 'size-10 rounded-lg text-lg' : 'size-14 rounded-xl text-2xl';
  // eslint-disable-next-line @next/next/no-img-element
  if (url) return <img src={url} alt="" className={`${cls} shrink-0 border border-line bg-surface-2 object-cover`} />;
  return (
    <span aria-hidden="true" className={`${cls} handle grid shrink-0 place-items-center border border-line bg-surface-2 text-muted`}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
