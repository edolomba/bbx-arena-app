/** Shared typography for the Terms and Privacy pages. */
export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-10 sm:px-6">
      <header className="grid gap-2">
        <h1 className="handle text-[clamp(2.2rem,6vw,3.6rem)] leading-none">{title}</h1>
        <p className="text-sm text-muted">Last updated {updated}</p>
      </header>
      <div className="grid max-w-[68ch] gap-4 leading-relaxed [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_ul]:grid [&_ul]:gap-1">
        {children}
      </div>
    </main>
  );
}
