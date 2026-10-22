'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';

type Kind = 'bug' | 'idea' | 'other';

/** Browser, system, screen and language, so audio problems can be reproduced. */
function deviceInfo() {
  const n = navigator as Navigator & { userAgentData?: { platform?: string; mobile?: boolean } };
  return [
    n.userAgent,
    n.userAgentData?.platform ? `platform: ${n.userAgentData.platform}${n.userAgentData.mobile ? ' (mobile)' : ''}` : '',
    `screen: ${screen.width}x${screen.height} @${window.devicePixelRatio}x`,
    `lang: ${navigator.language}`,
    `tz: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
  ].filter(Boolean).join(' | ').slice(0, 500);
}

export default function FeedbackForm({ initialPage = '' }: { initialPage?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const t = useI18n().t.beta;
  const [kind, setKind] = useState<Kind>('bug');
  const [message, setMessage] = useState('');
  const [page, setPage] = useState(initialPage);
  const [attach, setAttach] = useState(true);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    const { error: err } = await supabase.rpc('send_feedback', {
      p_kind: kind, p_message: message, p_page: page || null, p_device: attach ? deviceInfo() : null,
    });
    if (err) { setError(err.message || t.failed); setState('error'); return; }
    setState('sent');
  }

  if (state === 'sent') {
    return (
      <div className="grid justify-items-start gap-3 rounded-2xl border border-win/40 bg-win/10 p-6">
        <p className="text-lg font-semibold text-win">{t.thanks}</p>
        <button onClick={() => { setMessage(''); setState('idle'); }} className="underline underline-offset-4">{t.another}</button>
      </div>
    );
  }

  const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2.5';
  return (
    <form onSubmit={submit} className="grid max-w-2xl gap-5">
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm text-muted">{t.kind}</legend>
        <div className="flex flex-wrap gap-2">
          {(['bug', 'idea', 'other'] as Kind[]).map((k) => (
            <label key={k} className={`cursor-pointer rounded-full border px-4 py-2 ${kind === k ? 'border-gold bg-gold/15 text-gold' : 'border-line text-muted hover:text-ink'}`}>
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              {k === 'bug' ? '🐞 ' : k === 'idea' ? '💡 ' : '💬 '}{t[k]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">{t.message}</span>
        <textarea required minLength={5} maxLength={3000} rows={6} value={message} onChange={(e) => setMessage(e.target.value)}
          placeholder={kind === 'idea' ? t.messageIdea : t.messageBug} className={field} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">{t.page}</span>
        <input maxLength={300} value={page} onChange={(e) => setPage(e.target.value)} placeholder={t.pagePh} className={field} />
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} className="mt-1 size-4 accent-[var(--gold)]" />
        <span className="text-muted">{t.device}</span>
      </label>
      {state === 'error' && <p role="alert" className="text-loss">{error}</p>}
      <button disabled={state === 'sending'} className="justify-self-start rounded-full bg-ink px-6 py-3 text-paper disabled:opacity-60">
        {state === 'sending' ? t.sending : t.send}
      </button>
    </form>
  );
}
