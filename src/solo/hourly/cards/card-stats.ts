import { S3 } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { gzipSync } from 'zlib';
import { InternalBgsCardStat, InternalBgsCardStats, InternalBgsRow } from '../../../internal-model';
import { MmrPercentile } from '../../../models';
import { buildMmrPercentiles } from '../utils';
import { buildCardStatsForMmr } from './card-stats-builder';

export const buildCardStats = async (
	startDate: string,
	percentile: 100 | 50 | 25 | 10 | 1,
	rows: readonly InternalBgsRow[],
	allCards: AllCardsService,
	bucket: string,
	key: string,
	s3: S3,
) => {
	const rowsWithCards = rows.filter((row) => row.playedCardsExpanded.length > 0);
	const mmrPercentiles: readonly MmrPercentile[] = buildMmrPercentiles(rowsWithCards);
	const mmrPercentile = mmrPercentiles.find((p) => p.percentile === percentile);
	const mmrRows = rowsWithCards.filter((row) => mmrPercentile.percentile === 100 || row.rating >= mmrPercentile.mmr);

	const minionStats: readonly InternalBgsCardStat[] = buildCardStatsForMmr(mmrRows, allCards);
	const result: InternalBgsCardStats = {
		lastUpdateDate: new Date(),
		mmrPercentiles: mmrPercentiles,
		dataPoints: rowsWithCards.length,
		cardStats: minionStats.map((stat) => ({
			...stat,
			mmrPercentile: percentile,
			timePeriod: null,
		})),
	};
	// logger.log('\tbuilt stats', statsV2.dataPoints, statsV2.heroStats?.length);
	const destination = key.replace('%mmrPercentile%', `${percentile}`).replace('%startDate%', startDate);
	await s3.writeFile(gzipSync(JSON.stringify(result)), bucket, destination, 'application/json', 'gzip');
	// console.log('written file', destination);
};
