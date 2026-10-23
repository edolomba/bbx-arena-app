/* eslint-disable @next/next/no-img-element */
import { C, initials } from './assets';
import { LOGO_PNG, LOGO_RATIO } from './logo';

const font = 'Archivo, "Noto Sans", sans-serif';

/** Shared frame: dark stage, gold and pink light from the sides, logo top-left, address bottom-right. */
export function Frame({ children, left = C.gold, right = C.sub }: { children: React.ReactNode; left?: string; right?: string }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: C.paper, color: C.ink, fontFamily: font, position: 'relative' }}>
      <div style={{ position: 'absolute', left: -200, top: -100, width: 700, height: 830, display: 'flex', background: `radial-gradient(circle at 35% 50%, ${left}33, transparent 65%)` }} />
      <div style={{ position: 'absolute', right: -200, top: -100, width: 700, height: 830, display: 'flex', background: `radial-gradient(circle at 65% 50%, ${right}33, transparent 65%)` }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '40px 56px 0' }}>
        <img src={LOGO_PNG} width={Math.round(46 * LOGO_RATIO)} height={46} alt="" />
      </div>
      <div style={{ flex: 1, display: 'flex', position: 'relative' }}>{children}</div>
    </div>
  );
}

export function Face({ src, name, size, ring }: { src: string | null; name: string; size: number; ring: string }) {
  return (
    <div style={{ display: 'flex', width: size + 12, height: size + 12, borderRadius: 9999, border: `5px solid ${ring}`, alignItems: 'center', justifyContent: 'center', background: C.paper }}>
      {src ? (
        <img src={src} width={size} height={size} style={{ borderRadius: 9999 }} alt="" />
      ) : (
        <div style={{ width: size, height: size, borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.42, fontWeight: 800, background: '#26262e', color: C.ink }}>
          {initials(name)}
        </div>
      )}
    </div>
  );
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function BattleCard({ a, b, status, mode }: {
  a: { name: string; elo: number; photo: string | null; winner: boolean; loser: boolean } | null;
  b: { name: string; elo: number; photo: string | null; winner: boolean; loser: boolean } | null;
  status: string; mode: string;
}) {
  const side = (p: typeof a) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 380, opacity: p?.loser ? 0.55 : 1, alignSelf: 'center' }}>
      {p ? <Face src={p.photo} name={p.name} size={200} ring={p.winner ? C.gold : C.line} /> : (
        <div style={{ width: 212, height: 212, borderRadius: 9999, border: `5px dashed ${C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 90, color: C.muted }}>?</div>
      )}
      <div style={{ display: 'flex', marginTop: 22, fontSize: 52, fontWeight: 800, letterSpacing: -1 }}>{p ? clip(p.name, 14) : 'Open slot'}</div>
      {p && <div style={{ display: 'flex', marginTop: 4, fontSize: 28, color: C.muted }}>{`${p.elo} rating${p.winner ? '  ·  WINNER' : ''}`}</div>}
    </div>
  );
  return (
    <Frame>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40 }}>
          {side(a)}
          <div style={{ display: 'flex', fontSize: 120, fontWeight: 800, fontStyle: 'italic', color: C.gold }}>VS</div>
          {side(b)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 26 }}>
          <div style={{ display: 'flex', padding: '6px 18px', borderRadius: 9999, border: `2px solid ${C.gold}`, color: C.gold, fontSize: 20, letterSpacing: 3, textTransform: 'uppercase' }}>{mode}</div>
          <div style={{ display: 'flex', color: C.ink }}>{status}</div>
        </div>
      </div>
    </Frame>
  );
}

export function ProfileCard({ name, photo, elo, rank, elite, wins, losses, draws, battles, country, badge }: {
  name: string; photo: string | null; elo: number; rank: number | null; elite: boolean; wins: number; losses: number; draws: number; battles: number; country: string | null; badge: string | null;
}) {
  const ring = rank === 1 ? C.gold : elite ? C.sub : C.line;
  return (
    <Frame left={rank === 1 ? C.gold : C.sub}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 80px', gap: 64 }}>
        <Face src={photo} name={name} size={300} ring={ring} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rank && (
            <div style={{ display: 'flex', alignSelf: 'flex-start', padding: '6px 18px', borderRadius: 9999, border: `2px solid ${ring}`, color: ring === C.line ? C.muted : ring, fontSize: 24, letterSpacing: 3 }}>
              {`#${rank}${elite ? ' · ELITE' : ''}`}
            </div>
          )}
          <div style={{ display: 'flex', fontSize: 86, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>{clip(name, 13)}</div>
          <div style={{ display: 'flex', fontSize: 30, color: C.muted }}>{[country, badge].filter(Boolean).join('  ·  ')}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 36, marginTop: 18 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', fontSize: 20, letterSpacing: 3, color: C.muted }}>RATING</div>
              <div style={{ display: 'flex', fontSize: 96, fontWeight: 800, lineHeight: 1, color: rank === 1 ? C.gold : C.ink }}>{elo}</div>
            </div>
            {battles > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 8 }}>
                <div style={{ display: 'flex', fontSize: 20, letterSpacing: 3, color: C.muted }}>RECORD</div>
                <div style={{ display: 'flex', fontSize: 44, fontWeight: 800 }}>{draws > 0 ? `${wins}-${losses}-${draws}` : `${wins}-${losses}`}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Frame>
  );
}

export function EventCard({ name, edition, logo, dates, organizer, status }: {
  name: string; edition: string | null; logo: string | null; dates: string; organizer: string; status: { label: string; color: string };
}) {
  return (
    <Frame>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 80px', gap: 60 }}>
        {logo ? <img src={logo} width={300} height={300} style={{ borderRadius: 40, border: `3px solid ${C.line}` }} alt="" /> : (
          <div style={{ width: 300, height: 300, borderRadius: 40, border: `3px solid ${C.line}`, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 140, fontWeight: 800, color: C.muted }}>{initials(name)}</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 680 }}>
          <div style={{ display: 'flex', alignSelf: 'flex-start', padding: '6px 18px', borderRadius: 9999, border: `2px solid ${status.color}`, color: status.color, fontSize: 22, letterSpacing: 3 }}>{status.label}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', fontSize: 70, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1 }}>
            {clip(name, 40)}{edition ? <span style={{ color: C.gold, marginLeft: 18 }}>{clip(edition, 16)}</span> : null}
          </div>
          <div style={{ display: 'flex', fontSize: 32, color: C.muted }}>{`${dates}  ·  Online`}</div>
          <div style={{ display: 'flex', fontSize: 28, color: C.muted }}>{`by ${clip(organizer, 40)}`}</div>
        </div>
      </div>
    </Frame>
  );
}

export function SiteCard() {
  return (
    <Frame>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 34 }}>
        <img src={LOGO_PNG} width={Math.round(170 * LOGO_RATIO)} height={170} alt="" />
        <div style={{ display: 'flex', fontSize: 52, fontWeight: 800, letterSpacing: -1 }}>
          Beatbox battles, 1v1 and 2v2.<span style={{ color: C.gold, marginLeft: 16 }}>Every sound intact.</span>
        </div>
        <div style={{ display: 'flex', fontSize: 28, color: C.muted }}>Solo & Tag Team · Live stages · Tournaments · Rankings</div>
      </div>
    </Frame>
  );
}
