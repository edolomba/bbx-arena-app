import type { Battle } from '@/lib/types';

/** Stage timeline, mirrored exactly by advance_battle() in 0005_stage.sql. */
export const STAGE_INTRO_MS = 10_000;
export const STAGE_GAP_MS = 8_000;
export const STAGE_TAIL_MS = 3_000;
/** Listeners hear a performer slightly late; keep their audio open this long after the slot. */
export const STAGE_LISTEN_GRACE_MS = 1_500;

/** Opus settings for music, not speech: high bitrate, no silence suppression, no redundancy. */
export const STAGE_PUBLISH = {
  audioPreset: { maxBitrate: 192_000 },
  dtx: false,
  red: false,
} as const;

export interface StageSlot {
  index: number;
  userId: string;
  round: number;
  at: number;
  end: number;
}

type StageBattle = Pick<Battle, 'starts_at' | 'round_duration_seconds' | 'rounds_per_player' | 'challenger_id' | 'opponent_id'>;

/** Challenger opens, rounds alternate. Every client computes the same timeline from the start time. */
export function stageSchedule(b: StageBattle): { slots: StageSlot[]; endsAt: number } {
  const start = new Date(b.starts_at!).getTime();
  const len = b.round_duration_seconds * 1000;
  const slots: StageSlot[] = [];
  let i = 0;
  for (let round = 1; round <= b.rounds_per_player; round++) {
    for (const userId of [b.challenger_id, b.opponent_id!]) {
      const at = start + STAGE_INTRO_MS + i * (len + STAGE_GAP_MS);
      slots.push({ index: i, userId, round, at, end: at + len });
      i++;
    }
  }
  const endsAt = slots.length ? slots[slots.length - 1].end + STAGE_TAIL_MS : start;
  return { slots, endsAt };
}

export const slotKey = (userId: string, round: number) => `u:${userId}:${round}`;
