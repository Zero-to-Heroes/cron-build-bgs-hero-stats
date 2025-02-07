import { STATS_KEY_PREFIX } from '../hourly/_build-battlegrounds-hero-stats';

export const STAT_KEY_HERO = `${STATS_KEY_PREFIX}/hero-stats/mmr-%mmrPercentile%/%timePeriod%/overview-from-hourly.gz.json`;
export const DAILY_KEY_HERO = `${STATS_KEY_PREFIX}/hero-stats/mmr-%mmrPercentile%/daily/%startDate%.gz.json`;
export const STAT_KEY_PERCENTILE = `${STATS_KEY_PREFIX}/hero-stats/%timePeriod%/mmr-percentiles.gz.json`;
export const STAT_KEY_QUEST = `${STATS_KEY_PREFIX}/quest-stats/mmr-%mmrPercentile%/%timePeriod%/overview-from-hourly.gz.json`;
export const DAILY_KEY_QUEST = `${STATS_KEY_PREFIX}/quest-stats/mmr-%mmrPercentile%/daily/%startDate%.gz.json`;
export const STAT_KEY_TRINKET = `${STATS_KEY_PREFIX}/trinket-stats/%timePeriod%/overview-from-hourly.gz.json`;
export const DAILY_KEY_TRINKET = `${STATS_KEY_PREFIX}/trinket-stats/mmr-%mmrPercentile%/daily/%startDate%.gz.json`;
export const STAT_KEY_CARD = `${STATS_KEY_PREFIX}/card-stats/%timePeriod%/overview-from-hourly.gz.json`;
export const STAT_KEY_CARD_WITH_MMR = `${STATS_KEY_PREFIX}/card-stats/mmr-%mmrPercentile%/%timePeriod%/overview-from-hourly.gz.json`;
export const DAILY_KEY_CARD = `${STATS_KEY_PREFIX}/card-stats/mmr-%mmrPercentile%/daily/%startDate%.gz.json`;
