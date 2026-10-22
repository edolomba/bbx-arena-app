import { Fragment } from 'react';
import Link from 'next/link';
import { getLocale } from '@/lib/i18n/server';
import { RULES, type Block } from '@/lib/rules';

export async function generateMetadata() {
  const d = RULES[await getLocale()];
  return { title: d.title, description: d.lead };
}

/** **bold** and [text](/path) inside a sentence. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((p, i) => {
        const b = p.match(/^\*\*(.+)\*\*$/);
        if (b) return <strong key={i} className="text-ink">{b[1]}</strong>;
        const l = p.match(/^\[(.+)\]\((.+)\)$/);
        if (l) return <Link key={i} href={l[2]} className="text-gold underline underline-offset-4">{l[1]}</Link>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

function Section({ b, doLabel, dontLabel }: { b: Block; doLabel: string; dontLabel: string }) {
  return (
    <section id={b.id} className="grid scroll-mt-24 gap-4 rounded-2xl border border-line bg-gradient-to-b from-surface-2 to-surface p-5 sm:p-6">
      <h3 className="flex items-center gap-3 text-xl font-bold"><span aria-hidden="true">{b.icon}</span>{b.title}</h3>
      {b.text && (
        <div className="grid gap-3 leading-relaxed text-muted">
          {b.text.map((t, i) => <p key={i}><Rich text={t} /></p>)}
        </div>
      )}
      {(b.do || b.dont) && (
        <div className="grid gap-3 md:grid-cols-2">
          {b.do && (
            <div className="grid content-start gap-2 rounded-xl border border-win/30 bg-win/5 p-4">
              <p className="font-mono text-[0.7rem] tracking-[0.12em] text-win uppercase">{doLabel}</p>
              <ul className="grid gap-2">{b.do.map((t, i) => <li key={i} className="flex gap-2"><span className="text-win" aria-hidden="true">✓</span><span><Rich text={t} /></span></li>)}</ul>
            </div>
          )}
          {b.dont && (
            <div className="grid content-start gap-2 rounded-xl border border-loss/30 bg-loss/5 p-4">
              <p className="font-mono text-[0.7rem] tracking-[0.12em] text-loss uppercase">{dontLabel}</p>
              <ul className="grid gap-2">{b.dont.map((t, i) => <li key={i} className="flex gap-2"><span className="text-loss" aria-hidden="true">✕</span><span><Rich text={t} /></span></li>)}</ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default async function RulesPage() {
  const d = RULES[await getLocale()];
  const toc = (title: string, blocks: Block[]) => (
    <div className="grid gap-1">
      <p className="label">{title}</p>
      {blocks.map((b) => (
        <a key={b.id} href={`#${b.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface hover:text-ink">
          <span aria-hidden="true">{b.icon}</span>{b.title}
        </a>
      ))}
    </div>
  );
  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6">
      <header className="grid gap-3">
        <h1 className="handle text-[clamp(2.4rem,7vw,4.2rem)] leading-none">{d.title}</h1>
        <p className="max-w-[64ch] text-lg text-muted">{d.lead}</p>
      </header>
      <div className="grid gap-10 lg:grid-cols-[15rem_1fr]">
        <nav aria-label={d.toc} className="grid content-start gap-5 lg:sticky lg:top-24 lg:self-start">
          {toc(d.guide, d.guideBlocks)}
          {toc(d.rules, d.ruleBlocks)}
        </nav>
        <div className="grid min-w-0 gap-10">
          <section className="grid gap-4">
            <h2 className="text-2xl font-bold [font-stretch:112%]">{d.guide}</h2>
            {d.guideBlocks.map((b) => <Section key={b.id} b={b} doLabel={d.doLabel} dontLabel={d.dontLabel} />)}
          </section>
          <section className="grid gap-4">
            <h2 className="text-2xl font-bold [font-stretch:112%]">{d.rules}</h2>
            {d.ruleBlocks.map((b) => <Section key={b.id} b={b} doLabel={d.doLabel} dontLabel={d.dontLabel} />)}
          </section>
          <p className="text-muted"><Rich text={d.outro} /></p>
        </div>
      </div>
    </main>
  );
}
