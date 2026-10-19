import Link from 'next/link';
import LegalPage from '@/components/LegalPage';

export const metadata = { title: 'Privacy policy' };

export default function PrivacyPage() {
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'the contact address shown in the site footer';
  return (
    <LegalPage title="Privacy policy" updated="19 October 2026">
      <p>This page explains what BBX Arena stores about you, why, and how to remove it. It is written to meet the GDPR (Europe) and the LGPD (Brazil).</p>

      <h2>What we store</h2>
      <ul>
        <li><strong>Account:</strong> your email address and a hashed password.</li>
        <li><strong>Public profile:</strong> handle, and optionally your name, country, bio and links.</li>
        <li><strong>Recordings:</strong> the audio you record or upload for battles, plus measurements of it (waveform, loudness, sub-bass share).</li>
        <li><strong>Activity:</strong> battles, results, ratings, points, the votes you cast and the reports you send.</li>
        <li><strong>Notifications:</strong> messages about your battles.</li>
      </ul>

      <h2>What is public</h2>
      <p>Your profile, battles, recordings, results, ratings, points and votes are visible to everyone. That’s how judging stays transparent. Your email address is never shown.</p>

      <h2>Why</h2>
      <p>To run your account and your battles, show results and rankings, keep voting fair, and moderate abuse. We don’t sell your data, and there are no ads or tracking cookies. The only cookies are the ones that keep you logged in.</p>

      <h2>Who processes it</h2>
      <ul>
        <li><strong>Supabase:</strong> database, logins and audio storage (servers in the United States).</li>
        <li><strong>Vercel:</strong> hosts the website.</li>
      </ul>

      <h2>How long</h2>
      <p>For as long as your account exists. When you delete your account, your profile details and recordings are deleted; battle results stay, shown against an anonymous player, so your opponents’ records stay correct.</p>

      <h2>Your rights</h2>
      <p>You can see and edit your profile in <Link href="/settings" className="underline underline-offset-4">your settings</Link> and delete your account there at any time. For a copy of your data or any other request, write to {contact}.</p>

      <h2>Age</h2>
      <p>BBX Arena is for people aged 16 and over.</p>
    </LegalPage>
  );
}
