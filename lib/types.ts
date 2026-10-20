export type BattleStatus = 'open' | 'pending' | 'active' | 'live' | 'voting' | 'finished' | 'cancelled';
export type BattleMode = 'async' | 'live' | 'stage';
export type BattleResult = 'decision' | 'forfeit' | 'draw' | 'no_contest';

/** Peaks normalised to the loudest sample of the take. `low` is the < ~100 Hz band. */
export interface WaveformData {
  v: 1;
  bins: number;
  full: number[];
  low: number[];
}

export interface AudioAnalysis {
  durationMs: number;
  waveform: WaveformData;
  integratedLufs: number | null;
  peakDbfs: number;
  /** Fraction of signal energy below ~100 Hz (0..1). */
  subRatio: number;
}

/** A take that is ready to upload: recorded in the browser or chosen from disk. */
export interface PreparedTake {
  blob: Blob;
  fileExt: string;
  contentType: string;
  analysis: AudioAnalysis;
  sourceCodec: string;
  isLossless: boolean;
  sampleRate: number | null;
  bitDepth: number | null;
  channels: number;
}

export interface ProfileSummary {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  country: string | null;
  elo_rating: number;
}

export interface DirectoryEntry extends ProfileSummary {
  bio: string | null;
  styles: string[];
  social_links: Record<string, string>;
  signature_audio_path: string | null;
  signature_waveform: WaveformData | null;
  peak_elo: number;
  wins: number;
  losses: number;
  draws: number;
  battles_count: number;
  win_rate: number | null;
  global_rank: number;
  created_at: string;
}

export interface Battle {
  id: string;
  challenger_id: string;
  opponent_id: string | null;
  status: BattleStatus;
  mode: BattleMode;
  starts_at: string | null;
  live_ends_at: string | null;
  /** Postgres interval as text, e.g. "01:00:00", "12:00:00", "24:00:00". */
  voting_window: string;
  is_listed: boolean;
  round_duration_seconds: 30 | 45 | 90;
  rounds_per_player: number;
  current_turn_user_id: string | null;
  turn_number: number;
  turn_deadline: string | null;
  voting_ends_at: string | null;
  winner_id: string | null;
  result: BattleResult | null;
  forfeited_by: string | null;
  challenger_elo_delta: number | null;
  opponent_elo_delta: number | null;
  created_at: string;
  finished_at: string | null;
  /** Stage battles run by a host (0006). */
  host_id: string | null;
  judge_count: number | null;
  judge_vote_seconds: number;
  ranked: boolean;
  stage_phase: 'idle' | 'round' | 'voting' | 'tiebreak' | 'result';
  stage_slot: number | null;
  stage_started_at: string | null;
  stage_ends_at: string | null;
  stage_votes_in: number;
}

export interface BattleJudge {
  judge_id: string;
  is_reserve: boolean;
  active: boolean;
  judge: { username: string } | null;
}

export interface JudgeVote {
  judge_id: string;
  voted_for: string;
}

export interface BattleWithPlayers extends Battle {
  challenger: ProfileSummary;
  opponent: ProfileSummary | null;
  host?: { username: string } | null;
}

export interface Submission {
  id: string;
  battle_id: string;
  user_id: string;
  round_number: number;
  audio_path: string;
  stream_path: string | null;
  source_codec: string;
  is_lossless: boolean;
  sample_rate: number | null;
  bit_depth: number | null;
  channels: number;
  duration_ms: number;
  waveform_data: WaveformData;
  integrated_lufs: number | null;
  peak_dbfs: number | null;
  sub_ratio: number | null;
  submitted_at: string;
}

export interface Vote {
  id: string;
  battle_id: string;
  voter_id: string;
  voted_for_user_id: string;
  created_at: string;
  voter?: { username: string } | null;
}

/** One finished battle from one battler's side (view: profile_battles). */
export interface ProfileBattle {
  profile_id: string;
  battle_id: string;
  opponent_id: string;
  opponent_username: string;
  mode: BattleMode;
  result: 'decision' | 'draw' | 'forfeit';
  finished_at: string;
  forfeited_by: string | null;
  outcome: 'W' | 'L' | 'D';
  my_votes: number;
  their_votes: number;
  delta: number | null;
  elo_after: number | null;
  rn: number;
}

/** One row of leaderboard() / my_leaderboard_position(). */
export interface LeaderboardRow {
  rank: number;
  profile_id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  country: string | null;
  points: number;
  battles: number;
  wins: number;
  elo_rating: number;
}

export interface Season {
  id: number;
  name: string;
  starts_at: string;
  ends_at: string;
}

export interface ScoringRules {
  win: number;
  loss: number;
  draw: number;
  forfeit: number;
  forfeit_win: number;
}

export type NotificationKind =
  | 'challenge_received' | 'challenge_accepted' | 'challenge_declined'
  | 'your_turn' | 'live_soon' | 'voting_open' | 'battle_result'
  | 'judge_invited' | 'host_invited' | 'event_judge_invited' | 'event_update';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  battle_id: string | null;
  event_id?: string | null;
  data: {
    mode?: 'async' | 'live' | 'stage';
    starts_at?: string | null;
    deadline?: string | null;
    ends_at?: string | null;
    result?: string;
    outcome?: 'W' | 'L' | 'D' | 'N';
    forfeited_by_me?: boolean;
    elo_delta?: number | null;
    title?: string;
    what?: 'eliminations_started' | 'paused' | 'resumed' | 'judging' | 'published';
    next_session_at?: string | null;
  };
  created_at: string;
  read_at: string | null;
  actor?: { username: string } | null;
}

export type EventStatus = 'registration' | 'eliminations' | 'judging' | 'main' | 'finished' | 'cancelled';

export interface EventRow {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  format: 'gbb' | 'seven_to_smoke';
  status: EventStatus;
  ranked: boolean;
  approved_at: string | null;
  max_participants: number;
  advance_count: number;
  main_format: 'knockout' | 'swiss';
  judge_count: number;
  showcase_seconds: number;
  battle_round_seconds: number;
  battle_rounds: number;
  judge_vote_seconds: number;
  registration_closes_at: string;
  next_session_at: string | null;
  live: boolean;
  stage_profile: string | null;
  stage_started_at: string | null;
  stage_ends_at: string | null;
  published_at: string | null;
  created_at: string;
  host?: { username: string } | null;
}

export interface EventEntry {
  profile_id: string;
  status: 'registered' | 'withdrawn' | 'removed' | 'qualified' | 'eliminated';
  stage_order: number | null;
  elim_place: number | null;
  elim_score: number | null;
  profile: { username: string; country: string | null; elo_rating: number } | null;
}

export interface EventShowcase {
  profile_id: string;
  audio_path: string;
  duration_ms: number;
  waveform_data: WaveformData;
  integrated_lufs: number | null;
}

export interface EventJudge {
  judge_id: string;
  active: boolean;
  judge: { username: string } | null;
}

export interface StandingRow {
  profile_id: string;
  positions: number[];
  trimmed: number;
  h2h: number;
  full_sum: number;
  firsts: number;
  place: number;
  tied: boolean;
}
