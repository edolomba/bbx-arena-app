'use client';

import { BADGES } from '@/lib/badges';
import { useI18n } from '@/components/i18n/I18nProvider';

const STYLE: Record<number, string> = {
  1: 'border border-line text-muted',
  2: 'border border-signal text-signal',
  3: 'border border-win text-win',
  4: 'bg-sub text-paper border border-sub',
  5: 'bg-ink text-paper border border-ink shadow-[0_0_0_2px_var(--sub)]',
};

function Icon({ category }: { category: string }) {
  const common = { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': true, className: 'shrink-0' } as const;
  if (category === 'battles') return <svg {...common}><rect x="1" y="3" width="3" height="6" rx="1" fill="currentColor" /><rect x="8" y="3" width="3" height="6" rx="1" fill="currentColor" /></svg>;
  if (category === 'events') return <svg {...common}><path d="M6 1l1.5 3.2 3.5.4-2.6 2.4.7 3.5L6 8.8 2.9 10.5l.7-3.5L1 4.6l3.5-.4z" fill="currentColor" /></svg>;
  if (category === 'ranking') return <svg {...common}><rect x="1" y="7" width="2.5" height="4" fill="currentColor" /><rect x="4.75" y="4" width="2.5" height="7" fill="currentColor" /><rect x="8.5" y="1" width="2.5" height="10" fill="currentColor" /></svg>;
  return <svg {...common}><circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="6" cy="6" r="1.6" fill="currentColor" /></svg>;
}

/** A badge. `compact` is the small mark shown next to a handle. */
export default function BadgeChip({ code, compact = false, iconOnly = false }: { code: string | null | undefined; compact?: boolean; iconOnly?: boolean }) {
  const t = useI18n().t.badges;
  if (!code || !BADGES[code]) return null;
  const b = BADGES[code];
  if (iconOnly) {
    return (
      <span title={`${b.name}: ${t.desc[code] ?? b.description}`} aria-label={b.name}
        className={`inline-grid size-5 shrink-0 place-items-center rounded-full align-middle ${STYLE[b.rarity]}`}>
        <Icon category={b.category} />
      </span>
    );
  }
  return (
    <span title={`${b.name}: ${t.desc[code] ?? b.description} (${t.rarity[b.rarity]})`}
      className={`inline-flex items-center gap-1 rounded-full align-middle font-sans font-semibold whitespace-nowrap [font-stretch:100%] ${STYLE[b.rarity]} ${
        compact ? 'px-1.5 py-px text-[0.65rem] leading-4 tracking-normal' : 'px-2.5 py-1 text-xs'}`}>
      <Icon category={b.category} />
      {b.name}
    </span>
  );
}
