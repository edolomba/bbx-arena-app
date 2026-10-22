import Link from 'next/link';
import Avatar from '@/components/Avatar';
import { flagEmoji } from '@/lib/format';

export type Member = { username: string; avatar_url: string | null; country: string | null };

/** The two members under a Tag Team's name: overlapping photos and handles. */
export default function TeamMembers({ members, size = 'sm' }: { members: Member[]; size?: 'xs' | 'sm' | 'md' }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex -space-x-2">
        {members.map((m) => <Avatar key={m.username} username={m.username} url={m.avatar_url} size={size} ring="muted" />)}
      </span>
      <span className="truncate text-sm text-muted">
        {members.map((m, i) => (
          <span key={m.username}>
            {i > 0 && ' & '}
            <Link href={`/beatboxers/${m.username}`} className="text-ink hover:underline">{m.username}</Link>
            {m.country && <span aria-hidden="true"> {flagEmoji(m.country)}</span>}
          </span>
        ))}
      </span>
    </span>
  );
}
