'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { Dict } from '@/lib/i18n';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { COUNTRY_CODES } from '@/lib/constants';
import { countryName } from '@/lib/format';

const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2.5';

function friendly(message: string, t: Dict['auth']): string {
  if (/invalid login credentials/i.test(message)) return t.errCredentials;
  if (/email not confirmed/i.test(message)) return t.errNotConfirmed;
  if (/already registered/i.test(message)) return t.errExists;
  if (/rate limit/i.test(message)) return t.errRate;
  return message;
}

export default function AuthForm({ mode, next = '/' }: { mode: 'login' | 'signup'; next?: string }) {
  const { locale, t: allT } = useI18n();
  const t = allT.auth;
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
    () => COUNTRY_CODES.map((c) => ({ c, name: countryName(c, locale) })).sort((a, b) => a.name.localeCompare(b.name, locale)),
    [locale],
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

      if (!agreed) throw new Error(t.errAgree);
      if (!/^[A-Za-z0-9_.]{3,24}$/.test(username)) {
        throw new Error(t.errHandle);
      }
      const { data: free, error: checkError } = await supabase.rpc('username_available', { p_username: username });
      if (checkError) throw checkError;
      if (!free) throw new Error(t.errTaken(username));

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
      setError(friendly(err instanceof Error ? err.message : t.errGeneric, t));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <div className="grid gap-3 rounded-2xl bg-surface p-6">
        <h2 className="text-xl">{t.checkEmail}</h2>
        <p>{t.sentTo(sentTo)}</p>
        <p className="text-sm text-muted">{t.spam}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {mode === 'signup' && (
        <>
          <label className="grid gap-1 text-sm">
            <span className="text-muted">{t.handle}</span>
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
            <span className="text-muted">{t.handleHint}</span>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted">{t.country}</span>
            <select value={country} onChange={(e) => setCountry(e.target.value)} className={field}>
              <option value="">{t.preferNot}</option>
              {countries.map(({ c, name }) => (
                <option key={c} value={c}>{name}</option>
              ))}
            </select>
          </label>
        </>
      )}
      <label className="grid gap-1 text-sm">
        <span className="text-muted">{t.email}</span>
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={field} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">{t.password}</span>
        <input
          required
          type="password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          className={field}
        />
        {mode === 'signup' && <span className="text-muted">{t.passwordHint}</span>}
      </label>
      {mode === 'signup' && (
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" required checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 size-4 accent-[var(--signal)]" />
          <span>
            {t.agePrefix} <Link href="/terms" target="_blank" className="underline underline-offset-4">{t.terms}</Link> {t.and}{' '}
            <Link href="/privacy" target="_blank" className="underline underline-offset-4">{t.privacy}</Link>.
          </span>
        </label>
      )}
      {error && <p role="alert" className="text-loss">{error}</p>}
      <button disabled={busy} className="rounded-full bg-ink px-5 py-3 text-paper disabled:opacity-60">
        {busy ? (mode === 'login' ? t.loggingIn : t.creating) : mode === 'login' ? t.logIn : t.create}
      </button>
      <p className="text-sm text-muted">
        {mode === 'login' ? (
          <>{t.noAccount} <Link href={`/signup?next=${encodeURIComponent(next)}`} className="text-ink underline underline-offset-4">{t.signUp}</Link></>
        ) : (
          <>{t.haveAccount} <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-ink underline underline-offset-4">{t.logIn}</Link></>
        )}
      </p>
    </form>
  );
}
