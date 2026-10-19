import Link from 'next/link';
import LegalPage from '@/components/LegalPage';

export const metadata = { title: 'Terms of use' };

export default function TermsPage() {
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'the contact address shown in the site footer';
  return (
    <LegalPage title="Terms of use" updated="19 October 2026">
      <p>These terms apply to everyone who uses BBX Arena. By creating an account you agree to them.</p>

      <h2>Who can use BBX Arena</h2>
      <p>You must be at least 16 years old. One account per person. You’re responsible for what happens on your account, so keep your password to yourself.</p>

      <h2>Your recordings</h2>
      <ul>
        <li>You keep the rights to everything you record or upload.</li>
        <li>You give BBX Arena permission to store, stream, replay and display your recordings, waveforms and results on the platform, including after a battle ends, so battles stay listenable for voters and opponents.</li>
        <li>Only submit audio you made yourself. No copied rounds, no music or samples you don’t have the rights to.</li>
      </ul>

      <h2>Fair play</h2>
      <ul>
        <li>No fake accounts, vote trading, coordinated voting or anything else that games votes, ratings or points.</li>
        <li>No hate speech, harassment, threats or sexual content, in audio or text.</li>
        <li>Votes, results and your public profile are visible to everyone.</li>
      </ul>

      <h2>Moderation</h2>
      <p>Anyone can report a battle or a profile. Moderators can hide battles and suspend or remove accounts that break these terms. Ratings and points have no monetary value and can be corrected if they were gained unfairly.</p>

      <h2>Deleting your account</h2>
      <p>You can delete your account at any time in <Link href="/settings" className="underline underline-offset-4">your settings</Link>. Your profile and recordings are removed; your opponents keep their results against an anonymous player.</p>

      <h2>The service</h2>
      <p>BBX Arena is provided as it is. We work to keep it running and your recordings safe, but can’t promise it will always be available or free of errors.</p>

      <h2>Changes</h2>
      <p>If these terms change in a way that matters, we’ll say so on the site before the change applies.</p>

      <h2>Contact</h2>
      <p>Questions about these terms: {contact}.</p>
    </LegalPage>
  );
}
