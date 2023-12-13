import { gzipSync } from 'zlib';
import { STATS_BUCKET } from '../hourly/_build-battlegrounds-hero-stats';
import { BgsGlobalHeroStat, BgsHeroStatsV2, MmrPercentile, MmrPercentileFilter, TimePeriod } from '../models';
import { STAT_KEY, s3 } from './_build-aggregated-stats';

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
	console.log('persisting data', stat.dataPoints, stat.heroStats?.length);
	await s3.writeFile(
		gzipSync(JSON.stringify(stat)),
		STATS_BUCKET,
		STAT_KEY.replace('%mmrPercentile%', `${mmrPercentile}`).replace('%timePeriod%', timePeriod),
		'application/json',
		'gzip',
	);
};
