import { STATS_KEY_PREFIX } from '../hourly/_build-battlegrounds-hero-stats';

export const STAT_KEY_HERO = `${STATS_KEY_PREFIX}/hero-stats/mmr-%mmrPercentile%/%timePeriod%/%anomaly%overview-from-hourly.gz.json`;
export const STAT_KEY_PERCENTILE = `${STATS_KEY_PREFIX}/hero-stats/%timePeriod%/%anomaly%mmr-percentiles.gz.json`;
export const STAT_KEY_QUEST = `${STATS_KEY_PREFIX}/quest-stats/mmr-%mmrPercentile%/%timePeriod%/overview-from-hourly.gz.json`;
