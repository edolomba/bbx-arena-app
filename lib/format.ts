export function formatTime(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) return 'no time';
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  if (m > 0) return `${m}m`;
  return 'under a minute';
}

/** "SE" -> regional indicator flag emoji. */
export function flagEmoji(country: string | null): string {
  if (!country || !/^[A-Z]{2}$/.test(country)) return '';
  return String.fromCodePoint(...[...country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

const regionNames =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

export function countryName(country: string | null): string {
  if (!country) return '';
  try {
    return regionNames?.of(country) ?? country;
  } catch {
    return country;
  }
}

export function formatDb(db: number | null | undefined, unit: string): string {
  if (db == null || !Number.isFinite(db)) return '—';
  return `${db.toFixed(1).replace('-', '−')} ${unit}`;
}

/** Countdown text: "4:59" under an hour, "3h 05m" / "2d 4h" above. */
export function formatClock(ms: number): string {
  if (ms <= 0) return '0:00';
  if (ms >= 3_600_000) return formatRemaining(ms);
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatAgo(iso: string, now = Date.now()): string {
  const d = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  if (d < 1) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  const m = Math.round(d / 30.4);
  if (m < 12) return m === 1 ? 'a month ago' : `${m} months ago`;
  const y = Math.round(d / 365);
  return y === 1 ? 'a year ago' : `${y} years ago`;
}

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export const formatMonth = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

export const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

/** "12:00:00" -> 12, "1 day" -> 24 */
export function intervalHours(interval: string | null | undefined): number {
  if (!interval) return 24;
  const hms = /^(\d+):(\d+)/.exec(interval);
  if (hms) return Number(hms[1]);
  const days = /(\d+) day/.exec(interval);
  return days ? Number(days[1]) * 24 : 24;
}

export const hoursText = (h: number) => (h === 1 ? '1 hour' : `${h} hours`);
