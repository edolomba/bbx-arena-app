# BBX Arena: architecture

BBX Arena joins two things the beatbox scene currently gets from separate places: a permanent artist identity (profile, country, styles, record, rating) and fast asynchronous 1v1 audio battles. Its technical differentiator is that the low end survives the trip from a beatboxer's mic to a voter's headphones. Every decision below is made with that constraint in mind.

## Stack

The frontend is **Next.js 15 (App Router) with React 19 and Tailwind CSS 4**. Directory and profile pages render on the server so they are fast and indexable; the recorder, players and battle view are client components.

**Supabase** provides PostgreSQL, Auth, Storage, Realtime and pg_cron in one place. The important property is that the battle rules live in the database as `SECURITY DEFINER` functions, so a modified client cannot skip a turn, vote twice, or submit a 2-minute "45-second" round. Realtime pushes new votes and turn changes into open battle pages.

**Audio storage** starts on Supabase Storage (S3-backed) with a public, write-once bucket. At scale, move objects to Cloudflare R2 behind the same paths: audio is egress-heavy, and R2 charges nothing for egress. Avoid media-optimising services such as Cloudinary for masters, because their delivery transformations re-encode audio by default.

A small **transcode worker** (a container with ffmpeg on Fly.io, Cloud Run or Railway) is triggered by a database webhook on `submissions` insert. It verifies each file and writes streaming derivatives. Supabase Edge Functions can't run ffmpeg, which is why this is a separate service.

Hosting is Vercel (or any Node host) for Next.js.

## Folder structure

```
bbx-arena/
├─ app/
│  ├─ layout.tsx                  Archivo variable font, global tokens
│  ├─ globals.css                 colour tokens (light + dark), Tailwind 4 theme
│  ├─ beatboxers/page.tsx         directory: search, country, style, sort, pagination
│  ├─ beatboxers/[handle]/        profile page (stats, elo_history chart, battles)  ← to build
│  ├─ battles/new/                challenge form → rpc create_challenge / quick_match  ← to build
│  └─ battles/[id]/page.tsx       loads battle + players + rounds + votes → BattleView
├─ components/
│  ├─ audio/AudioRecorder.tsx     record or upload, live level + sub-bass meters, take review
│  ├─ audio/WaveformPlayer.tsx    canvas waveform with sub-bass layer, seek, level match
│  ├─ battle/BattleView.tsx       face-off header, A | B rounds, listen-to-vote, tallies
│  └─ directory/BeatboxerCard.tsx rating, record, styles, sound signature
├─ hooks/
│  └─ useHiFiRecorder.ts          getUserMedia with processing off → AudioWorklet → WAV
├─ lib/
│  ├─ audio/recorder-worklet.ts   raw PCM capture processor
│  ├─ audio/wav.ts                24-bit WAV encoder, WAV header reader, upload types
│  ├─ audio/analyze.ts            peaks (full + <100 Hz), gated loudness, sub-bass share
│  ├─ audio/playback-bus.ts       shared AudioContext, exclusive playback
│  ├─ supabase/{client,server}.ts browser / server clients
│  ├─ supabase/battles.ts         submitTake, castVote, acceptChallenge
│  ├─ supabase/storage.ts         public audio URLs
│  ├─ constants.ts, format.ts, types.ts
├─ supabase/migrations/0001_init.sql
└─ workers/transcode/             ffmpeg verification + derivatives  ← to build (commands below)
```

The files marked "to build" are routine pages on top of what's here; everything the battle loop needs is included.

## The audio pipeline

Low end gets destroyed at five distinct points between a mouth and a listener. Fixing one and missing the others gives you nothing, so the pipeline handles each in turn.

**1. Capture: browser voice processing.** `getUserMedia` enables echo cancellation, noise suppression and automatic gain control by default. Noise suppression classifies a sustained lip bass as noise and removes it; AGC ducks the level after every heavy hit. `useHiFiRecorder` requests all three off (plus Chromium's newer `voiceIsolation`), then reads `track.getSettings()` back, because browsers are allowed to ignore constraints. If any stage is still active, the recorder tells the user in plain words. It also flags Bluetooth headset mics, which use a narrowband call profile with essentially no bass.

Two things software can't fix are surfaced as guidance rather than hidden: phone and laptop mics physically roll off below roughly 100 Hz, and OS-level "enhancements" (Windows audio enhancements, macOS Voice Isolation mic mode) sit below the browser. A future "check your setup" page with a test recording and the sub-bass meter would turn this into a one-minute self-diagnosis.

**2. Encoding: no MediaRecorder.** MediaRecorder picks the codec and bitrate for you, usually Opus tuned for speech. Instead, an AudioWorklet copies raw Float32 samples off the audio thread, and the hook writes a 24-bit PCM WAV. The AudioContext is created at the mic track's own sample rate so nothing is resampled. A 90-second mono 48 kHz take is about 13 MB.

**3. Upload: stored as-is.** Takes go straight to the bucket under `{battle_id}/{user_id}/{uuid}.wav`. Storage policies allow inserts only into your own folder and allow no updates or deletes, so a round can't be swapped after the opponent has heard it. Uploaded MP3/M4A files are accepted and kept byte-for-byte; the UI is honest that a lossy upload can't recover what its encoder removed.

**4. Derivatives: verified, never "improved".** The worker re-measures every file and writes two streaming copies. The commands are deliberately boring: no `loudnorm`, no `dynaudnorm`, no limiter, no `highpass`.

```bash
# verify: real duration, rate, codec (overrides client-reported values, sets verified_at)
ffprobe -v error -show_entries format=duration:stream=codec_name,sample_rate,channels -of json in.wav

# primary stream: FLAC, lossless, ~55% of WAV size, plays in every current browser
ffmpeg -i in.wav -c:a flac -compression_level 8 out.flac

# constrained-network fallback: AAC-LC 320k. At this rate the codec keeps sub-bass intact;
# low bitrates and speech-mode encoders are what thin it out.
ffmpeg -i in.wav -c:a aac -b:a 320k -movflags +faststart out.m4a
```

If you later add Opus derivatives, pass `-application audio`. The `voip` mode enables speech-oriented processing, including a high-pass filter.

**5. Playback: no processing.** `WaveformPlayer` streams through a normal `<audio>` element. It only enters Web Audio when the battle view's level match needs a gain change, and then the graph is a single GainNode. Level matching is attenuate-only: every take is turned down to the quietest one's integrated loudness, so nothing is boosted into clipping and nothing is compressed. This matters for fairness, because listeners reliably prefer whichever take is louder.

**Waveforms.** `analyzeAudio` renders the take through a steep 100 Hz low-pass in an OfflineAudioContext and stores two peak arrays: full-band and sub-bass. The player draws the sub layer in magenta inside the cobalt waveform, so a lip bass is visible before you press play. It also computes a gated, BS.1770-style loudness figure and the share of energy below 100 Hz, which the recorder shows live and after each take.

## Battle lifecycle

```
create_challenge ──► open (no opponent, 7 days) ──┐
                 └─► pending (named opponent) ────┤ accept_challenge / quick_match
                                                  ▼
                       active: challenger, opponent, challenger, … each within response_window
                                                  │ last round submitted
                                                  ▼
                       voting (voting_window, default 48 h)
                                                  │ pg_cron: process_deadlines() every minute
                                                  ▼
                       finished: decision | draw | no_contest | forfeit
```

A missed response window is a forfeit with a full rating change, so stalling can't protect a rating. Unanswered invitations become `cancelled` with no rating change. A battle with zero votes ends as `no_contest`, also without a rating change.

## Voting integrity

Votes are public rows tied to profiles. The database refuses votes from participants, from accounts younger than 24 hours, after the window closes, and twice from the same account. The client also requires a voter to have actually heard at least half of every round (playback time is counted, seeking ahead isn't) before the vote buttons unlock. That check is a UX nudge, not a security boundary. If you need a stronger guarantee, have the player post signed listen beacons and require them in `cast_vote`.

Tallies stay hidden from a voter until they've voted, to reduce bandwagon voting, and are always visible once the battle ends, along with who voted for whom.

## Rating

Standard Elo, computed in `apply_elo` inside the same transaction that closes the battle. Expected score is `1 / (1 + 10^((Rb − Ra) / 400))`; K is 40 for a player's first 20 battles and 24 after, so newcomers find their level quickly and established ratings stay stable. Ratings are floored at 100. Every change is written to `elo_history` for profile charts. A clean 1200-vs-1200 decision moves each player 20 points, which the migration was tested against.

## Schema notes

The tables match your spec, with these additions and one rename. `submissions.audio_file_url` is stored as `audio_path`, a bucket-relative path; URLs are derived at read time so a move to R2 or a custom CDN domain doesn't require a data migration. `battle_invites` holds link tokens apart from `battles` so public reads never expose them. Profiles gained `wins`, `losses`, `draws` and `peak_elo` as columns, maintained only by the rating function; users can edit their identity fields but column-level grants block them from touching their record. `directory_entries` is a view with global rank and win rate; when the directory grows past tens of thousands of profiles, convert it to a materialised view refreshed by the same cron job.

## What's verified

The migration was applied to PostgreSQL 16 with Supabase's `auth`, `storage` and `cron` schemas stubbed, and the full lifecycle was exercised: challenge, accept, four alternating rounds, every rejection path (out of turn, over length, wrong folder, self-vote, new-account vote, double vote), majority decision with correct Elo deltas, quick-match pairing, and a forfeit. The TypeScript passes `tsc --strict`. The WAV encoder was round-tripped with a 45 Hz tone at −1 dBFS: sample error was under half an LSB and ffmpeg measured the sub-bass at its original level.

The components have not yet been run in a browser against a live project. The parts most worth testing first on real devices are mic constraint behaviour on iOS Safari and the createMediaElementSource CORS path when level matching is on.

## Next steps

Build the transcode worker from the commands above, wired to a webhook on `submissions`, and have it set `stream_path`, `mobile_path` and `verified_at`. Add the profile page with an `elo_history` chart and battle list, and the new-challenge form. Add a setup-check page that records five seconds and reports the sub-bass meter. Run a scheduled job to delete storage objects that never got a matching submission row.
