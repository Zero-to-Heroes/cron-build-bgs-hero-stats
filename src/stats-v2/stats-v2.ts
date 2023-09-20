import { logger } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { gzipSync } from 'zlib';
import { s3 } from '../build-battlegrounds-hero-stats-new';
import { PatchInfo } from '../common';
import { InternalBgsRow } from '../internal-model';
import { WithMmrAndTimePeriod } from '../quests-v2/charged-stat';
import { buildSplitStats } from '../quests-v2/data-filter';
import { BgsGlobalHeroStat, BgsHeroStatsV2 } from './bgs-hero-stat';
import { buildStats } from './stats-buikder';

export const STATS_BUCKET = `static.zerotoheroes.com`;

export const handleStatsV2 = async (
	timePeriod: 'all-time' | 'past-three' | 'past-seven' | 'last-patch',
	rows: readonly InternalBgsRow[],
	lastPatch: PatchInfo,
	allCards: AllCardsService,
) => {
	const rowsWithStats = rows;
	const statResult = await buildSplitStats(rowsWithStats, timePeriod, lastPatch, (data: InternalBgsRow[]) =>
		buildStats(data, allCards),
	);
	const stats = statResult.stats;
	const statsV2: BgsHeroStatsV2 = {
		lastUpdateDate: new Date(),
		mmrPercentiles: statResult.mmrPercentiles,
		heroStats: stats,
		dataPoints: stats.map((s) => s.dataPoints).reduce((a, b) => a + b, 0),
	};
	logger.log('\tbuilt stats', statsV2.dataPoints, statsV2.heroStats?.length);
	const timeSuffix = timePeriod;
	await s3.writeFile(
		gzipSync(JSON.stringify(statsV2)),
		STATS_BUCKET,
		`api/bgs/stats-v2/bgs-${timeSuffix}.gz.json`,
		'application/json',
		'gzip',
	);

	// Build a "light" version
	const statsV2light: BgsHeroStatsV2 = {
		lastUpdateDate: new Date(),
		mmrPercentiles: statResult.mmrPercentiles,
		heroStats: statsV2.heroStats.map(
			(s) =>
				({
					heroCardId: s.heroCardId,
					dataPoints: s.dataPoints,
					averagePosition: s.averagePosition,
					// standardDeviation: s.standardDeviation,
					// standardDeviationOfTheMean: s.standardDeviationOfTheMean,
					// conservativePositionEstimate: s.conservativePositionEstimate,
					// placementDistribution: s.placementDistribution,
					// combatWinrate: s.combatWinrate,
					// warbandStats: s.warbandStats,
					// tribeStats: s.tribeStats,
					// anomalyStats: s.anomalyStats,
					mmrPercentile: s.mmrPercentile,
					timePeriod: s.timePeriod,
				} as Partial<WithMmrAndTimePeriod<BgsGlobalHeroStat>> as any),
		),
		dataPoints: statsV2.dataPoints,
	};
	await s3.writeFile(
		gzipSync(JSON.stringify(statsV2light)),
		STATS_BUCKET,
		`api/bgs/stats-v2/light/bgs-${timeSuffix}.gz.json`,
		'application/json',
		'gzip',
	);
};
