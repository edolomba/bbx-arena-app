import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { record } from '@/lib/format';
import Avatar from '@/components/Avatar';
import TeamActions from '@/components/teams/TeamActions';
import Link from 'next/link';
import { flagEmoji, countryName } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return {};
  const supabase = await createClient();
  const { data } = await supabase.from('teams').select('name').eq('id', id).maybeSingle();
  return data ? { title: data.name, description: `Tag Team on Beatbox Arena.` } : {};
}

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { locale, t: all } = await getT();
  const t = all.teams;
  const [{ data: { user } }, { data: team }, { data: members }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('teams').select('*').eq('id', id).maybeSingle(),
    supabase.from('team_members').select('status, profile_id, profile:profiles!team_members_profile_id_fkey(username, avatar_url, country)').eq('team_id', id),
  ]);
  if (!team) notFound();
  type M = { status: string; profile_id: string; profile: { username: string; avatar_url: string | null; country: string | null } | null };
  const list = (members ?? []) as unknown as M[];
  const mine = list.find((m) => m.profile_id === user?.id);
  const stats: [string, string][] = [
    [t.rating, String(team.elo_rating)],
    [t.record, record(team.wins, team.losses, team.draws)],
    [t.points, String(team.total_points)],
  ];

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6">
      <Link href="/teams" className="text-sm text-muted underline-offset-4 hover:underline">← {t.title}</Link>
      <header className="relative grid gap-6 overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-surface-2 via-surface to-paper p-6 sm:p-10">
        <span className="pointer-events-none absolute -top-32 -right-24 size-80 rounded-full bg-sub/12 blur-3xl" aria-hidden="true" />
        <p className="label relative">Tag Team</p>
        <h1 className="handle relative text-[clamp(2.6rem,8vw,5rem)] leading-none break-words">{team.name}</h1>
        {team.status === 'pending' && <p className="relative text-gold">{t.pending}</p>}
        {team.status === 'disbanded' && <p className="relative text-muted">{t.disbanded}</p>}
        <ul className="relative flex flex-wrap gap-6">
          {list.map((m) => m.profile && (
            <li key={m.profile_id} className={`flex items-center gap-3 ${m.status === 'invited' ? 'opacity-60' : ''}`}>
              <Avatar username={m.profile.username} url={m.profile.avatar_url} size="lg" ring="elite" />
              <span className="grid">
                <Link href={`/beatboxers/${m.profile.username}`} className="text-xl font-bold hover:underline">{m.profile.username}</Link>
                {m.profile.country && <span className="text-sm text-muted">{flagEmoji(m.profile.country)} {countryName(m.profile.country, locale)}</span>}
              </span>
            </li>
          ))}
        </ul>
        {mine?.status === 'invited' && team.status === 'pending' && <div className="relative"><TeamActions teamId={team.id} name={team.name} mode="invited" /></div>}
        {mine?.status === 'active' && team.status === 'active' && <div className="relative"><TeamActions teamId={team.id} name={team.name} mode="member" /></div>}
      </header>
      <dl className="grid grid-cols-3 gap-3">
        {stats.map(([label, value]) => (
          <div key={label} className="grid gap-1 rounded-2xl border border-line bg-gradient-to-b from-surface-2 to-surface p-4">
            <dt className="label">{label}</dt>
            <dd className="num text-3xl font-bold">{value}</dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
