export type BattleStatus = 'open' | 'pending' | 'active' | 'live' | 'voting' | 'finished' | 'cancelled';
export type BattleMode = 'async' | 'live';
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
}

export interface BattleWithPlayers extends Battle {
  challenger: ProfileSummary;
  opponent: ProfileSummary | null;
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
  | 'your_turn' | 'live_soon' | 'voting_open' | 'battle_result';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  battle_id: string | null;
  data: {
    mode?: 'async' | 'live';
    starts_at?: string | null;
    deadline?: string | null;
    ends_at?: string | null;
    result?: string;
    outcome?: 'W' | 'L' | 'D' | 'N';
    forfeited_by_me?: boolean;
    elo_delta?: number | null;
  };
  created_at: string;
  read_at: string | null;
  actor?: { username: string } | null;
}
