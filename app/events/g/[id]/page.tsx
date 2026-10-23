import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { LOCALE_TAG } from '@/lib/i18n/config';
import { dateRange, editionColor, groupStatus } from '@/lib/events';
import EventLogo from '@/components/events/EventLogo';
import StatusChip from '@/components/events/StatusChip';
import EventTimeline from '@/components/events/EventTimeline';
import LocalSchedule from '@/components/events/LocalSchedule';
import Avatar from '@/components/Avatar';
import type { EventGroup, EventRow, EventSession } from '@/lib/types';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return {};
  const supabase = await createClient();
  const { data: g } = await supabase.from('event_groups').select('name, edition, description, organizer').eq('id', id).maybeSingle();
  if (!g) return {};
  const title = `${g.name}${g.edition ? ` ${g.edition}` : ''}`;
  const description = (g.description ?? `Beatbox event${g.organizer ? ` by ${g.organizer}` : ''} on Beatbox Arena.`).slice(0, 200);
  return { title, description, openGraph: { title, description }, twitter: { title, description } };
}

export const dynamic = 'force-dynamic';

export default async function EventGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { locale, t: all } = await getT();
  const t = all.evg;
  const [{ data: g }, { data: cats }, { data: sessions }, { data: auth }] = await Promise.all([
    supabase.from('event_groups').select('*, host:profiles!event_groups_host_id_fkey(username)').eq('id', id).maybeSingle(),
    supabase.from('events').select('*').eq('group_id', id).order('created_at'),
    supabase.from('event_sessions').select('*').eq('group_id', id).order('starts_at'),
    supabase.auth.getUser(),
  ]);
  if (!g) notFound();
  const group = g as EventGroup;
  const categories = (cats ?? []) as EventRow[];
  const isHost = auth.user?.id === group.host_id;
  const ids = categories.map((c) => c.id);
  const [{ data: entries }, { data: judges }] = await Promise.all([
    ids.length ? supabase.from('event_entries').select('event_id, status, final_place, team:teams!event_entries_team_id_fkey(name), profile:profiles!event_entries_profile_id_fkey(username, avatar_url, country)').in('event_id', ids) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from('event_judges').select('event_id').in('event_id', ids).eq('active', true) : Promise.resolve({ data: [] }),
  ]);
  type Entry = { event_id: string; status: string; final_place: number | null; team: { name: string } | null; profile: { username: string; avatar_url: string | null; country: string | null } | null };
  const ent = (entries ?? []) as unknown as Entry[];
  const counted = (cid: string) => ent.filter((e) => e.event_id === cid && !['withdrawn', 'removed'].includes(e.status));
  const totalParticipants = new Set(ent.filter((e) => !['withdrawn', 'removed'].includes(e.status)).map((e) => e.profile?.username)).size;
  const status = groupStatus(group, categories);
  const tag = LOCALE_TAG[locale];

  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6">
      <header className="grid gap-5">
        <div className="flex flex-wrap items-start gap-5">
          <EventLogo name={group.name} url={group.logo_url} size="lg" />
          <div className="grid min-w-0 flex-1 gap-2">
            <StatusChip status={status} label={t[status]} />
            <h1 className="handle text-[clamp(2rem,5.5vw,3.6rem)] leading-[1.05]">
              {group.name}{group.edition && <> <span className={editionColor(group.id)}>{group.edition}</span></>}
            </h1>
            <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
              <span>📅 {dateRange(group.starts_at, group.ends_at, tag)}</span>
              <span>👥 {t.participantsN(totalParticipants)}</span>
              <span>📡 {t.online}</span>
            </p>
            <p className="text-sm text-muted">{t.organizedBy} <strong className="text-ink">{group.organizer || `@${group.host?.username}`}</strong></p>
          </div>
          {isHost && (
            <div className="flex flex-wrap gap-2">
              <Link href={`/events/g/${group.id}/edit`} className="rounded-full border border-line px-4 py-2 text-sm">{t.edit}</Link>
              <Link href={`/events/g/${group.id}/categories/new`} className="rounded-full bg-ink px-4 py-2 text-sm text-paper">+ {t.addCategory}</Link>
            </div>
          )}
        </div>
        <EventTimeline startsAt={group.starts_at} endsAt={group.ends_at} />
        {group.description && <p className="max-w-[72ch] leading-relaxed whitespace-pre-wrap text-muted">{group.description}</p>}
      </header>

      <section className="grid gap-4">
        <h2 className="flex items-center gap-3 text-2xl font-bold"><span aria-hidden="true">🗓️</span>{t.schedule}</h2>
        {(sessions ?? []).length ? (
          <LocalSchedule sessions={sessions as EventSession[]} categories={categories.map((c) => ({ id: c.id, name: c.category_name ?? c.title, audience: c.audience ?? null }))} />
        ) : <p className="text-muted">{t.noSchedule}</p>}
      </section>

      <section className="grid gap-4">
        <h2 className="text-2xl font-bold">{t.categories}</h2>
        {categories.length === 0 ? <p className="text-muted">{t.noCategories}</p> : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => {
              const people = counted(c.id);
              const podium = people.filter((e) => e.final_place && e.final_place <= 3).sort((a, b) => a.final_place! - b.final_place!);
              const nJudges = (judges ?? []).filter((j) => j.event_id === c.id).length;
              const done = c.status === 'finished';
              return (
                <li key={c.id}>
                  <Link href={`/events/${c.id}`} className={`grid h-full content-start gap-3 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-muted ${c.live ? 'shadow-[inset_3px_0_0_var(--loss)]' : done ? 'shadow-[inset_3px_0_0_var(--win)]' : 'shadow-[inset_3px_0_0_var(--gold)]'}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="label">{all.ev.status[c.status]}{c.live ? all.ev.liveNow : ''}</span>
                      <span className="font-mono text-[0.7rem] text-muted">{t.participantsN(people.length)} · {t.judgesN(nJudges)}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xl font-bold">{c.category_name ?? c.title}{c.kind === 'tag' && <span className="rounded bg-gold px-1.5 text-xs font-bold text-paper">Tag Team</span>}</span>
                    {c.audience && <span className="justify-self-start rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">{c.audience}</span>}
                    <span className="text-sm text-muted">
                      {c.main_format === 'seven_to_smoke' ? '7 to Smoke' : c.main_format === 'swiss' ? all.evNew.swiss : all.evNew.knockout}
                    </span>
                    {done && podium.length > 0 && (
                      <ol className="grid gap-1.5">
                        {podium.map((e) => (
                          <li key={e.profile?.username} className="flex items-center gap-2">
                            <span aria-hidden="true">{['🥇', '🥈', '🥉'][e.final_place! - 1]}</span>
                            <Avatar username={e.profile?.username ?? '?'} url={e.profile?.avatar_url} size="xs" />
                            <span className={e.final_place === 1 ? 'font-bold' : 'text-muted'}>{e.team?.name ?? e.profile?.username}</span>
                            <span className="font-mono text-[0.65rem] text-muted">{e.profile?.country}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                    <span className="mt-auto justify-self-start rounded-full border border-gold/40 px-3 py-1 text-sm text-gold">{done ? t.results : t.open} →</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
