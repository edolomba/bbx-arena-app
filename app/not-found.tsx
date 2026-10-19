import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto grid max-w-6xl justify-items-start gap-4 px-4 py-20 sm:px-6">
      <h1 className="handle text-5xl leading-none">Nothing here</h1>
      <p className="text-muted">This page or battle doesn’t exist, or the link is incomplete.</p>
      <Link href="/" className="rounded-full bg-ink px-5 py-2.5 text-paper">Go to the home page</Link>
    </main>
  );
}
