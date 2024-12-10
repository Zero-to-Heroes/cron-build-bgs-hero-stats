import { gzipSync } from 'zlib';
import { InternalBgsCardStat, InternalBgsCardStats } from '../../../internal-model';
import { MmrPercentileFilter } from '../../../models';
import { DAILY_KEY_CARD } from '../../aggregate-hourly/config';
import { STATS_BUCKET } from '../../hourly/_build-battlegrounds-hero-stats';
import { s3 } from './_build-aggregated-stats';

export const persistData = async (
	mergedStats: readonly InternalBgsCardStat[],
	dayStartTime: string,
	lastUpdate: Date,
	mmrPercentile: MmrPercentileFilter,
) => {
	const result: InternalBgsCardStats = {
		lastUpdateDate: new Date(),
		mmrPercentiles: [],
		dataPoints: mergedStats.map((s) => s.totalPlayed).reduce((a, b) => a + b, 0),
		cardStats: mergedStats.map((stat) => ({
			...stat,
			mmrPercentile: mmrPercentile,
			timePeriod: null,
		})),
	};
	// console.log('persisting data', stat.dataPoints, stat.heroStats?.length);
	await s3.writeFile(
		gzipSync(JSON.stringify(result)),
		STATS_BUCKET,
		DAILY_KEY_CARD.replace('%startDate%', dayStartTime).replace('%mmrPercentile%', `${mmrPercentile}`),
		'application/json',
		'gzip',
	);
};
