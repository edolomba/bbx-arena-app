'use client';

import { useEffect, useState } from 'react';
import { formatClock } from '@/lib/format';

/** Live countdown text. `now` lets live rooms pass a server-synced clock. */
export default function Countdown({ to, now = Date.now, className }: { to: string; now?: () => number; className?: string }) {
  const target = new Date(to).getTime();
  const [left, setLeft] = useState(() => target - now());
  useEffect(() => {
    const t = window.setInterval(() => setLeft(target - now()), 250);
    return () => window.clearInterval(t);
  }, [target, now]);
  return (
    <span className={className} suppressHydrationWarning>
      {formatClock(left)}
    </span>
  );
}
