import { logger } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { gzipSync } from 'zlib';
import { MmrPercentile } from '../bgs-global-stats';
import { InternalBgsRow } from '../internal-model';
import { BgsGlobalHeroStat, BgsHeroStatsV2 } from '../models';
import { STATS_BUCKET, STATS_KEY_PREFIX, s3 } from './_build-battlegrounds-hero-stats';
import { buildHeroStatsForMmr } from './hero-stats-buikder';
import { buildMmrPercentiles } from './utils';

export const buildHeroStats = async (
	startDate: string,
	percentile: 100 | 50 | 25 | 10 | 1,
	rows: readonly InternalBgsRow[],
	allCards: AllCardsService,
) => {
	const mmrPercentiles: readonly MmrPercentile[] = buildMmrPercentiles(rows);
	const mmrPercentile = mmrPercentiles.find((p) => p.percentile === percentile);
	const mmrRows = rows.filter((row) => mmrPercentile.percentile === 100 || row.rating >= mmrPercentile.mmr);

	const heroStats: readonly BgsGlobalHeroStat[] = buildHeroStatsForMmr(mmrRows, allCards);
	const statsV2: BgsHeroStatsV2 = {
		lastUpdateDate: new Date(),
		mmrPercentiles: mmrPercentiles,
		heroStats: heroStats.map((stat) => ({
			...stat,
			mmrPercentile: percentile,
			timePeriod: null,
		})),
		dataPoints: heroStats.map((s) => s.dataPoints).reduce((a, b) => a + b, 0),
	};
	logger.log('\tbuilt stats', statsV2.dataPoints, statsV2.heroStats?.length);
	await s3.writeFile(
		gzipSync(JSON.stringify(statsV2)),
		STATS_BUCKET,
		`${STATS_KEY_PREFIX}/hero-stats/mmr-${percentile}/hourly/${startDate}.gz.json`,
		'application/json',
		'gzip',
	);
};
