import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { LOCALE_TAG } from '@/lib/i18n/config';
import { Rich, STORY, StoryAuthor, StoryMeta, storyMinutes } from '@/components/home/StoryParts';

export const metadata = { title: STORY.title, description: STORY.excerpt[0] };

export default async function StoryPage() {
  const supabase = await createClient();
  const { locale, t: all } = await getT();
  const t = all.story;
  const { data: author } = await supabase.from('profiles').select('username, avatar_url, country').eq('username', STORY.author).maybeSingle();
  const date = new Date(STORY.date).toLocaleDateString(LOCALE_TAG[locale], { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-12 sm:px-6">
      <Link href="/" className="text-sm text-muted underline-offset-4 hover:underline">← {t.back}</Link>
      <StoryMeta label={t.featured} date={date} minRead={t.minRead(storyMinutes())} />
      <h1 lang="en" className="handle text-[clamp(2.2rem,6vw,3.6rem)] leading-[1.05]">{STORY.title}</h1>
      <StoryAuthor by={t.by} author={author} />
      {t.englishOnly && <p className="text-xs text-muted">{t.englishOnly}</p>}
      <div lang="en" className="grid gap-5 text-lg leading-relaxed text-muted">
        {[...STORY.excerpt, ...STORY.body].map((p, i) => (
          <p key={i} className={i === 0 ? 'first-letter:float-left first-letter:mr-2 first-letter:text-6xl first-letter:leading-none first-letter:font-bold first-letter:text-gold' : ''}><Rich text={p} /></p>
        ))}
        <p className="text-right font-mono text-sm text-ink">— {STORY.author}</p>
      </div>
    </main>
  );
}
