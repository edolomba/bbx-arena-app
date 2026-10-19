'use client';

import { useState } from 'react';

/** Danger zone: typing the handle confirms, then the server deletes everything. */
export default function DeleteAccount({ username }: { username: string }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = typed.trim().replace(/^@/, '') === username;

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/account/delete', { method: 'POST' });
    if (res.ok) {
      window.location.href = '/?deleted=1';
      return;
    }
    const body = await res.json().catch(() => ({}));
    setError(body.error ?? 'The account wasn’t deleted. Try again.');
    setBusy(false);
  }

  return (
    <section className="grid max-w-xl gap-3 rounded-2xl border border-loss/40 p-5">
      <h2 className="text-xl font-bold [font-stretch:112%]">Delete account</h2>
      <p className="text-sm">
        This removes your profile, your recordings and your login for good. Battles in progress count as a forfeit.
        Finished battles stay on your opponents’ records against an anonymous player. This can’t be undone.
      </p>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">Type @{username} to confirm</span>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="rounded-lg border border-line bg-surface px-3 py-2.5" />
      </label>
      {error && <p role="alert" className="text-sm text-loss">{error}</p>}
      <button onClick={remove} disabled={!ready || busy}
        className="justify-self-start rounded-full bg-loss px-5 py-2.5 text-paper disabled:opacity-40">
        {busy ? 'Deleting…' : 'Delete my account'}
      </button>
    </section>
  );
}
