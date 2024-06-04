import { gzipSync } from 'zlib';
import { BgsGlobalHeroStat, BgsHeroStatsV2, MmrPercentile, MmrPercentileFilter, TimePeriod } from '../../../models';
import { STATS_BUCKET } from '../../hourly/_build-battlegrounds-hero-stats';
import { STAT_KEY_HERO, STAT_KEY_PERCENTILE } from '../config';
import { s3 } from './_build-aggregated-stats';

export const persistData = async (
	mergedStats: readonly BgsGlobalHeroStat[],
	mmrPercentiles: readonly MmrPercentile[],
	lastUpdate: Date,
	timePeriod: TimePeriod,
	mmrPercentile: MmrPercentileFilter,
) => {
	const stat: BgsHeroStatsV2 = {
		heroStats: mergedStats.map((stat) => ({
			...stat,
			mmrPercentile: mmrPercentile,
			timePeriod: timePeriod,
		})),
		lastUpdateDate: lastUpdate,
		dataPoints: mergedStats.map((s) => s.dataPoints).reduce((a, b) => a + b, 0),
		mmrPercentiles: mmrPercentiles,
	};
	// console.log('persisting data', stat.dataPoints, stat.heroStats?.length);
	await s3.writeFile(
		gzipSync(JSON.stringify(stat)),
		STATS_BUCKET,
		STAT_KEY_HERO.replace('%mmrPercentile%', `${mmrPercentile}`).replace('%timePeriod%', timePeriod),
		'application/json',
		'gzip',
	);
	await s3.writeFile(
		gzipSync(JSON.stringify(mmrPercentiles)),
		STATS_BUCKET,
		STAT_KEY_PERCENTILE.replace('%timePeriod%', timePeriod),
		'application/json',
		'gzip',
	);
};
