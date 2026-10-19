'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

let cachedOffset: number | null = null;
let pending: Promise<number> | null = null;

/**
 * Offset between this device's clock and the database clock, measured a few
 * times and keeping the sample with the shortest round trip. Live rooms
 * schedule playback against server time, so a phone whose clock is 3 seconds
 * off still hears each round at the same moment as everyone else.
 */
async function measure(): Promise<number> {
  const supabase = createClient();
  let best = { rtt: Infinity, offset: 0 };
  for (let i = 0; i < 4; i++) {
    const t0 = Date.now();
    const { data, error } = await supabase.rpc('server_now');
    const t1 = Date.now();
    if (error || !data) continue;
    const rtt = t1 - t0;
    if (rtt < best.rtt) best = { rtt, offset: new Date(data as string).getTime() - (t0 + rtt / 2) };
  }
  return best.offset;
}

export function useServerClock() {
  const [offset, setOffset] = useState<number>(cachedOffset ?? 0);
  const [synced, setSynced] = useState(cachedOffset !== null);

  useEffect(() => {
    if (cachedOffset !== null) return;
    pending ??= measure();
    let alive = true;
    pending.then((o) => {
      cachedOffset = o;
      if (alive) {
        setOffset(o);
        setSynced(true);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  return { now: () => Date.now() + offset, offset, synced };
}
