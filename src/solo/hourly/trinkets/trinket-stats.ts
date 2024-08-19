import { S3 } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { gzipSync } from 'zlib';
import { InternalBgsRow } from '../../../internal-model';
import { BgsGlobalTrinketStat, BgsTrinketStats } from '../../../model-trinkets';
import { MmrPercentile } from '../../../models';
import { buildMmrPercentiles } from '../utils';
import { buildTrinketStatsForMmr } from './trinket-stats-builder';

export const buildTrinketStats = async (
	startDate: string,
	percentile: 100 | 50 | 25 | 10 | 1,
	rows: readonly InternalBgsRow[],
	allCards: AllCardsService,
	bucket: string,
	key: string,
	s3: S3,
) => {
	const rowsWithTrinkets = rows.filter((row) => row.bgsTrinkets?.length > 0);
	const mmrPercentiles: readonly MmrPercentile[] = buildMmrPercentiles(rowsWithTrinkets);
	const mmrPercentile = mmrPercentiles.find((p) => p.percentile === percentile);
	const mmrRows = rowsWithTrinkets.filter(
		(row) => mmrPercentile.percentile === 100 || row.rating >= mmrPercentile.mmr,
	);

	const trinketStats: readonly BgsGlobalTrinketStat[] = buildTrinketStatsForMmr(mmrRows, allCards);
	const statsV2: BgsTrinketStats = {
		lastUpdateDate: new Date(),
		mmrPercentiles: mmrPercentiles,
		trinketStats: trinketStats.map((stat) => ({
			...stat,
			mmrPercentile: percentile,
			timePeriod: null,
		})),
		dataPoints: trinketStats.map((s) => s.dataPoints).reduce((a, b) => a + b, 0),
	};
	// logger.log('\tbuilt stats', statsV2.dataPoints, statsV2.heroStats?.length);
	const destination = key.replace('%mmrPercentile%', `${percentile}`).replace('%startDate%', startDate);
	await s3.writeFile(gzipSync(JSON.stringify(statsV2)), bucket, destination, 'application/json', 'gzip');
	// console.log('written file', destination);
};
