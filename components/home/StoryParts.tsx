import { Fragment } from 'react';
import Link from 'next/link';
import Avatar from '@/components/Avatar';
import { STORY, storyMinutes } from '@/lib/story';

/** **bold** inside a paragraph. */
export function Rich({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') ? <strong key={i} className="text-ink">{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>))}</>;
}

export function StoryMeta({ label, date, minRead }: { label: string; date: string; minRead: string }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.7rem] tracking-widest text-muted uppercase">
      <span className="rounded-full border border-sub/50 bg-sub/10 px-2.5 py-0.5 text-sub">{label}</span>
      <span>{date}</span>
      <span>{minRead}</span>
      {STORY.tags.map((tag) => <span key={tag}>#{tag}</span>)}
    </p>
  );
}

export function StoryAuthor({ by, author }: { by: string; author: { username: string; avatar_url: string | null; country: string | null } | null }) {
  const name = author?.username ?? STORY.author;
  return (
    <Link href={`/beatboxers/${name}`} className="flex items-center gap-2 justify-self-start text-sm text-muted hover:text-ink">
      <Avatar username={name} url={author?.avatar_url} size="xs" />
      <span>{by} <span className="font-semibold text-ink">{name}</span></span>
      {author?.country && <span className="font-mono text-[0.65rem]">{author.country}</span>}
    </Link>
  );
}

export { STORY, storyMinutes };
