import { gzipSync } from 'zlib';
import { InternalBgsCardStat, InternalBgsCardStats } from '../../../internal-model';
import { MmrPercentileFilter } from '../../../models';
import { DAILY_KEY_CARD } from '../../aggregate-hourly/config';
import { STATS_BUCKET } from '../../hourly/_build-battlegrounds-hero-stats';
import { s3 } from './_build-aggregated-stats';

export const persistData = async (
	mergedStats: readonly InternalBgsCardStat[],
	dayStartTime: string,
	totalGames: number,
	lastUpdate: Date,
	mmrPercentile: MmrPercentileFilter,
) => {
	const result: InternalBgsCardStats = {
		lastUpdateDate: lastUpdate,
		mmrPercentiles: [],
		dataPoints: totalGames,
		cardStats: mergedStats.map((stat) => ({
			...stat,
			mmrPercentile: mmrPercentile,
			timePeriod: null,
		})),
	};
	// console.log('persisting data', stat.dataPoints, stat.heroStats?.length);
	if (mmrPercentile === 100) {
		console.debug(
			'Bubble Gunner daily',
			result.cardStats.find((s) => s.cardId === 'BG31_149')?.turnStats?.find((t) => t.turn === 1)?.totalPlayed,
			dayStartTime,
			mmrPercentile,
		);
	}
	await s3.writeFile(
		gzipSync(JSON.stringify(result)),
		STATS_BUCKET,
		DAILY_KEY_CARD.replace('%startDate%', dayStartTime).replace('%mmrPercentile%', `${mmrPercentile}`),
		'application/json',
		'gzip',
	);
};
