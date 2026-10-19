/** K-factor drops after this many battles (see apply_elo in the migration). */
export const PROVISIONAL_BATTLES = 20;
export const ROUND_DURATIONS = [30, 45, 90] as const;
export const VOTING_HOURS = [1, 12, 24] as const;
/** Live start options in minutes (the database allows 5 minutes to 7 days). */
export const LIVE_STARTS = [
  { minutes: 15, label: 'In 15 minutes' },
  { minutes: 60, label: 'In 1 hour' },
  { minutes: 360, label: 'In 6 hours' },
  { minutes: 1440, label: 'In 24 hours' },
] as const;

/** Live timeline, mirrored exactly by advance_battle() in the migration. */
export const LIVE_INTRO_MS = 3000;
export const LIVE_GAP_MS = 4000;
export const LIVE_TAIL_MS = 1500;

export const COUNTRY_CODES = (
  'AD AE AF AG AI AL AM AO AR AS AT AU AW AZ BA BB BD BE BF BG BH BI BJ BM BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ ' +
  'DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FO FR GA GB GD GE GH GI GL GM GN GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP ' +
  'NR NZ OM PA PE PG PH PK PL PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT ' +
  'TV TW TZ UA UG US UY UZ VA VC VE VN VU WS XK YE ZA ZM ZW'
).split(' ');
