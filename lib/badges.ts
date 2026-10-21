/** Mirrors the badges table in 0010_badges.sql (kept here so any page can render a badge instantly). */
export interface BadgeDef {
  name: string;
  description: string;
  category: 'battles' | 'events' | 'ranking' | 'community';
  rarity: 1 | 2 | 3 | 4 | 5;
}

export const BADGES: Record<string, BadgeDef> = {
  first_beat: { name: 'First Beat', description: 'Finished a first battle.', category: 'battles', rarity: 1 },
  in_the_groove: { name: 'In the Groove', description: '5 Ranked wins in a row.', category: 'battles', rarity: 2 },
  encore: { name: 'Encore', description: '10 Ranked wins in a row.', category: 'battles', rarity: 4 },
  underdog: { name: 'Underdog', description: 'Beat someone rated 200 or more above you.', category: 'battles', rarity: 3 },
  regular: { name: 'Regular', description: '50 Ranked battles.', category: 'battles', rarity: 2 },
  hall_of_fame: { name: 'Hall of Fame', description: '200 Ranked battles.', category: 'battles', rarity: 4 },
  live_debut: { name: 'Live Debut', description: 'First Stage battle, live on the mic.', category: 'battles', rarity: 1 },
  headliner: { name: 'Headliner', description: 'Won a tournament.', category: 'events', rarity: 4 },
  podium: { name: 'Podium', description: 'Top 3 in a tournament.', category: 'events', rarity: 3 },
  last_one_standing: { name: 'Last One Standing', description: 'Won a 7 to Smoke.', category: 'events', rarity: 4 },
  perfect_seven: { name: 'Perfect Seven', description: 'Scored all 7 points in a row without leaving the stage.', category: 'events', rarity: 5 },
  showcase_star: { name: 'Showcase Star', description: 'First place in the eliminations.', category: 'events', rarity: 3 },
  top10_week: { name: 'Top 10 of the Week', description: 'Finished a week in the top 10.', category: 'ranking', rarity: 2 },
  top10_season: { name: 'Top 10 of the Season', description: 'Finished a season in the top 10.', category: 'ranking', rarity: 4 },
  season_headliner: { name: 'Season Headliner', description: 'Number one of a season.', category: 'ranking', rarity: 5 },
  judge: { name: 'Judge', description: 'Judged an event.', category: 'community', rarity: 1 },
  golden_ear: { name: 'Golden Ear', description: 'Judged 10 events.', category: 'community', rarity: 3 },
  host: { name: 'Host', description: 'Hosted an event to the end.', category: 'community', rarity: 2 },
  good_vibes: { name: 'Good Vibes', description: 'A year on BBX Arena without a single suspension.', category: 'community', rarity: 2 },
};

export const RARITY_LABEL = ['', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'] as const;
export const CATEGORY_LABEL = { battles: 'Battles', events: 'Events', ranking: 'Ranking', community: 'Community' } as const;
