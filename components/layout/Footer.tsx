import Link from 'next/link';

export default function Footer() {
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted sm:px-6">
        <span className="handle text-ink">BBX Arena<span className="text-sub">.</span></span>
        <Link href="/mic-check" className="hover:text-ink">Mic check</Link>
        <Link href="/terms" className="hover:text-ink">Terms</Link>
        <Link href="/privacy" className="hover:text-ink">Privacy</Link>
        {contact && <a href={`mailto:${contact}`} className="hover:text-ink">Contact</a>}
      </div>
    </footer>
  );
}
