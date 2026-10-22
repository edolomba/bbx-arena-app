import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { LOCALE_TAG } from '@/lib/i18n/config';
import { Rich, STORY, StoryAuthor, StoryMeta, storyMinutes } from './StoryParts';

/** Home page card with the founder's story: title, author, the opening paragraphs, and a link to the rest. */
export default async function FeaturedStory() {
  const supabase = await createClient();
  const { locale, t: all } = await getT();
  const t = all.story;
  const { data: author } = await supabase.from('profiles').select('username, avatar_url, country').eq('username', STORY.author).maybeSingle();
  const date = new Date(STORY.date).toLocaleDateString(LOCALE_TAG[locale], { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <article className="relative grid gap-4 overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-sub/10 via-surface to-surface p-6 sm:p-10">
      <span className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-sub/10 blur-3xl" aria-hidden="true" />
      <StoryMeta label={t.featured} date={date} minRead={t.minRead(storyMinutes())} />
      <h2 lang="en" className="handle max-w-[22ch] text-[clamp(1.8rem,4.5vw,3rem)] leading-[1.08]">{STORY.title}</h2>
      <StoryAuthor by={t.by} author={author} />
      <div lang="en" className="grid max-w-[62ch] gap-3 text-lg leading-relaxed text-muted">
        {STORY.excerpt.map((p, i) => <p key={i}><Rich text={p} /></p>)}
      </div>
      <Link href="/story" className="justify-self-start rounded-full border border-sub/50 px-5 py-2.5 text-sub hover:bg-sub/10">{t.readMore} →</Link>
      {t.englishOnly && <p className="text-xs text-muted">{t.englishOnly}</p>}
    </article>
  );
}
