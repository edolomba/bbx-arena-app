import type { GroupStatus } from '@/lib/events';

export default function StatusChip({ status, label }: { status: GroupStatus; label: string }) {
  const cls = status === 'live' ? 'border-loss/50 bg-loss/10 text-loss' : status === 'upcoming' ? 'border-gold/40 bg-gold/10 text-gold' : 'border-win/40 bg-win/10 text-win';
  return (
    <span className={`inline-flex w-fit items-center justify-self-start gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[0.65rem] tracking-widest uppercase ${cls}`}>
      {status === 'live' && <span className="size-1.5 animate-pulse rounded-full bg-loss" aria-hidden="true" />}
      {label}
    </span>
  );
}
