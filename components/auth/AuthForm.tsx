'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { COUNTRY_CODES } from '@/lib/constants';
import { countryName } from '@/lib/format';

const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2.5';

function friendly(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'That email and password don’t match an account.';
  if (/email not confirmed/i.test(message)) return 'Confirm your email first: open the link we sent you.';
  if (/already registered/i.test(message)) return 'An account with this email already exists. Log in instead.';
  if (/rate limit/i.test(message)) return 'Too many attempts. Wait a few minutes and try again.';
  return message;
}

export default function AuthForm({ mode, next = '/' }: { mode: 'login' | 'signup'; next?: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [country, setCountry] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const countries = useMemo(
    () => COUNTRY_CODES.map((c) => ({ c, name: countryName(c) })).sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(next);
        router.refresh();
        return;
      }

      if (!agreed) throw new Error('Confirm your age and accept the terms to create an account.');
      if (!/^[A-Za-z0-9_.]{3,24}$/.test(username)) {
        throw new Error('Handles are 3 to 24 characters: letters, numbers, dots and underscores.');
      }
      const { data: free, error: checkError } = await supabase.rpc('username_available', { p_username: username });
      if (checkError) throw checkError;
      if (!free) throw new Error(`@${username} is taken. Try another handle.`);

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username, country: country || null, accepted_terms: 'true' },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) throw error;
      if (data.session) {
        router.push(next);
        router.refresh();
      } else {
        setSentTo(email);
      }
    } catch (err) {
      setError(friendly(err instanceof Error ? err.message : 'Something went wrong. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <div className="grid gap-3 rounded-2xl bg-surface p-6">
        <h2 className="text-xl">Check your email</h2>
        <p>We sent a confirmation link to <strong>{sentTo}</strong>. Open it on this device to finish creating your account.</p>
        <p className="text-sm text-muted">Nothing there? Look in your spam folder.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {mode === 'signup' && (
        <>
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Handle</span>
            <div className="flex items-center rounded-lg border border-line bg-surface focus-within:outline-2 focus-within:outline-signal">
              <span className="pl-3 text-muted">@</span>
              <input
                required
                value={username}
                onChange={(e) => setUsername(e.target.value.trim())}
                autoComplete="username"
                maxLength={24}
                className="w-full bg-transparent px-1 py-2.5 outline-none"
              />
            </div>
            <span className="text-muted">This is your name on battles and the board. Letters, numbers, dots and underscores.</span>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Country (optional)</span>
            <select value={country} onChange={(e) => setCountry(e.target.value)} className={field}>
              <option value="">Prefer not to say</option>
              {countries.map(({ c, name }) => (
                <option key={c} value={c}>{name}</option>
              ))}
            </select>
          </label>
        </>
      )}
      <label className="grid gap-1 text-sm">
        <span className="text-muted">Email</span>
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={field} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">Password</span>
        <input
          required
          type="password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          className={field}
        />
        {mode === 'signup' && <span className="text-muted">At least 8 characters.</span>}
      </label>
      {mode === 'signup' && (
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" required checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 size-4 accent-[var(--signal)]" />
          <span>
            I’m 16 or older and I accept the <Link href="/terms" target="_blank" className="underline underline-offset-4">Terms of use</Link> and
            the <Link href="/privacy" target="_blank" className="underline underline-offset-4">Privacy policy</Link>.
          </span>
        </label>
      )}
      {error && <p role="alert" className="text-loss">{error}</p>}
      <button disabled={busy} className="rounded-full bg-ink px-5 py-3 text-paper disabled:opacity-60">
        {busy ? (mode === 'login' ? 'Logging in…' : 'Creating account…') : mode === 'login' ? 'Log in' : 'Create account'}
      </button>
      <p className="text-sm text-muted">
        {mode === 'login' ? (
          <>No account yet? <Link href={`/signup?next=${encodeURIComponent(next)}`} className="text-ink underline underline-offset-4">Sign up</Link></>
        ) : (
          <>Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-ink underline underline-offset-4">Log in</Link></>
        )}
      </p>
    </form>
  );
}
