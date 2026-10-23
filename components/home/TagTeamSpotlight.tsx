import Link from 'next/link';
import { getT } from '@/lib/i18n/server';

/** Home page spotlight for the Tag Team launch. */
export default async function TagTeamSpotlight() {
  const { t: all } = await getT();
  const t = all.home;
  const points = [
    { icon: '👥', title: t.spot1, text: t.spot1Text },
    { icon: '🎧', title: t.spot2, text: t.spot2Text },
    { icon: '🏆', title: t.spot3, text: t.spot3Text },
  ];
  return (
    <section aria-labelledby="tagteam-spot" className="relative grid gap-6 overflow-hidden rounded-3xl border border-gold/40 bg-gradient-to-br from-gold/15 via-surface to-sub/10 p-6 sm:p-10">
      <span className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-sub/20 blur-3xl" aria-hidden="true" />
      <span className="pointer-events-none absolute -bottom-28 -left-20 size-72 rounded-full bg-gold/15 blur-3xl" aria-hidden="true" />
      <div className="relative grid gap-3">
        <span className="justify-self-start rounded-full bg-gold px-3 py-1 font-mono text-xs font-bold tracking-widest text-paper uppercase">{t.spotNew}</span>
        <h2 id="tagteam-spot" className="handle text-[clamp(2.4rem,7vw,4.6rem)] leading-none">
          <span className="bg-gradient-to-r from-gold to-sub bg-clip-text text-transparent">{t.spotTitle}</span>
        </h2>
        <p className="max-w-[56ch] text-lg text-muted">{t.spotLead}</p>
      </div>
      <ul className="relative grid gap-3 sm:grid-cols-3">
        {points.map((p) => (
          <li key={p.title} className="grid content-start gap-1.5 rounded-2xl border border-line bg-paper/60 p-4 backdrop-blur-sm">
            <span className="text-2xl" aria-hidden="true">{p.icon}</span>
            <strong>{p.title}</strong>
            <span className="text-sm text-muted">{p.text}</span>
          </li>
        ))}
      </ul>
      <div className="relative flex flex-wrap gap-3">
        <Link href="/teams" className="rounded-full bg-ink px-6 py-3 text-paper">{t.spotCreate}</Link>
        <Link href="/battles/new?format=tag" className="rounded-full border border-line bg-paper/60 px-6 py-3">{t.spotBattle}</Link>
      </div>
    </section>
  );
}
