import { gzipSync } from 'zlib';
import { BgsCardStat, BgsCardStats } from '../../../model-cards';
import { MmrPercentileFilter, TimePeriod } from '../../../models';
import { STAT_KEY_CARD, STAT_KEY_CARD_WITH_MMR } from '../../aggregate-hourly/config';
import { STATS_BUCKET } from '../../hourly/_build-battlegrounds-hero-stats';
import { s3 } from './_build-aggregated-stats';

export const persistData = async (
	mergedStats: readonly BgsCardStat[],
	mmrPercentile: MmrPercentileFilter | null,
	timePeriod: TimePeriod,
	totalGames: number,
	lastUpdate: Date,
) => {
	const result: BgsCardStats = {
		cardStats: mergedStats,
		lastUpdateDate: lastUpdate,
		dataPoints: totalGames,
		timePeriod: timePeriod,
	};
	if (mmrPercentile == null) {
		// console.log('persisting data', stat.dataPoints, stat.heroStats?.length);
		await s3.writeFile(
			gzipSync(JSON.stringify(result)),
			STATS_BUCKET,
			STAT_KEY_CARD.replace('%timePeriod%', timePeriod),
			'application/json',
			'gzip',
		);
	} else {
		// console.log('persisting data', stat.dataPoints, stat.heroStats?.length);
		if (mmrPercentile === 100) {
			console.debug(
				'Bubble Gunner daily',
				result.cardStats.find((s) => s.cardId === 'BG31_149')?.turnStats?.find((t) => t.turn === 1)
					?.totalPlayed,
				mmrPercentile,
			);
		}
		await s3.writeFile(
			gzipSync(JSON.stringify(result)),
			STATS_BUCKET,
			STAT_KEY_CARD_WITH_MMR.replace('%timePeriod%', timePeriod).replace(
				'%mmrPercentile%',
				mmrPercentile.toString(),
			),
			'application/json',
			'gzip',
		);
	}
};
