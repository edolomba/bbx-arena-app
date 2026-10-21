import { Fragment } from 'react';
import Link from 'next/link';
import type { LegalDoc } from '@/lib/legal';

/** Renders **bold**, [text](/path) and {contact} inside a legal sentence. */
function Rich({ text, contact }: { text: string; contact: string }) {
  const parts = text.replace('{contact}', contact).split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {parts.map((part, i) => {
        const bold = part.match(/^\*\*(.+)\*\*$/);
        if (bold) return <strong key={i}>{bold[1]}</strong>;
        const link = part.match(/^\[(.+)\]\((.+)\)$/);
        if (link) return <Link key={i} href={link[2]} className="underline underline-offset-4">{link[1]}</Link>;
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

/** Shared layout for the Terms and Privacy pages. */
export default function LegalPage({ doc, contact, updated }: { doc: LegalDoc; contact: string; updated: string }) {
  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-10 sm:px-6">
      <header className="grid gap-2">
        <h1 className="handle text-[clamp(2.2rem,6vw,3.6rem)] leading-none">{doc.title}</h1>
        <p className="text-sm text-muted">{doc.updatedLabel}: {updated}</p>
      </header>
      <div className="grid max-w-[68ch] gap-4 leading-relaxed">
        {doc.blocks.map((b, i) => (
          <section key={i} className="grid gap-2">
            {b.h && <h2 className="mt-4 text-xl font-bold">{b.h}</h2>}
            {b.p && <p><Rich text={b.p} contact={contact} /></p>}
            {b.ul && (
              <ul className="grid gap-1">
                {b.ul.map((li, j) => <li key={j} className="ml-5 list-disc"><Rich text={li} contact={contact} /></li>)}
              </ul>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
