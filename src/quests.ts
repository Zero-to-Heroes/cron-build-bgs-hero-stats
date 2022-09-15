import { groupByFunction, logger } from '@firestone-hs/aws-lambda-utils';
import { gzipSync } from 'zlib';
import { BgsGlobalHeroStat2, BgsGlobalStats2, MmrPercentile } from './bgs-global-stats';
import { s3 } from './build-battlegrounds-hero-stats-new';
import { buildMmrPercentiles, buildPlacementDistribution, filterRowsForTimePeriod, PatchInfo } from './common';
import { InternalBgsRow } from './internal-model';
import { formatDate } from './utils/util-functions';

export const handleQuests = async (
	timePeriod: 'all-time' | 'past-three' | 'past-seven' | 'last-patch',
	rows: readonly InternalBgsRow[],
	lastPatch: PatchInfo,
) => {
	const rowsForTimePeriod = filterRowsForTimePeriod(rows, timePeriod, lastPatch);
	const rowsWithQuests = rowsForTimePeriod.filter(row => row.quests).filter(row => !!row.bgsHeroQuestRewards?.length);
	console.log('total relevant rows', rowsWithQuests?.length);
	const mmrPercentiles: readonly MmrPercentile[] = buildMmrPercentiles(rowsWithQuests);
	const stats: readonly BgsGlobalHeroStat2[] = buildQuests(rowsWithQuests, mmrPercentiles).map(stat => ({
		...stat,
		date: timePeriod,
	}));
	const statsForQuests: BgsGlobalStats2 = {
		lastUpdateDate: formatDate(new Date()),
		mmrPercentiles: mmrPercentiles,
		heroStats: stats,
		allTribes: null,
		totalMatches: stats.map(s => s.totalMatches).reduce((a, b) => a + b, 0),
	};
	logger.log('\tbuilt stats', statsForQuests.totalMatches, statsForQuests.heroStats?.length);
	const timeSuffix = timePeriod;
	await s3.writeFile(
		gzipSync(JSON.stringify(statsForQuests)),
		'static.zerotoheroes.com',
		`api/bgs/quests/bgs-global-stats-${timeSuffix}.gz.json`,
		'application/json',
		'gzip',
	);
};

const buildQuests = (
	rows: readonly InternalBgsRow[],
	mmrPercentiles: readonly MmrPercentile[],
): readonly BgsGlobalHeroStat2[] => {
	const mappedByMmr = mmrPercentiles.map(
		mmrPercentile =>
			[
				mmrPercentile,
				// So that we also include rows where data collection failed
				rows.filter(row => mmrPercentile.percentile === 100 || row.rating >= mmrPercentile.mmr),
			] as [MmrPercentile, readonly InternalBgsRow[]],
	);
	// logger.log('mappedByMmr');
	return mappedByMmr
		.map(([mmr, rows]) => {
			return buildQuestStats(rows).map(stat => ({
				...stat,
				mmrPercentile: mmr.percentile,
			}));
		})
		.reduce((a, b) => [...a, ...b], []);
};

const buildQuestStats = (rows: readonly InternalBgsRow[]): readonly BgsGlobalHeroStat2[] => {
	const flattenedQuests = rows.flatMap(row =>
		row.bgsHeroQuestRewards.split(',').map(reward => ({
			...row,
			bgsHeroQuestRewards: reward,
		})),
	);
	const grouped: { [groupingKey: string]: readonly InternalBgsRow[] } = groupByFunction(
		(row: InternalBgsRow) => row.bgsHeroQuestRewards,
	)(flattenedQuests);
	// logger.log('grouped', Object.keys(grouped).length);

	const result = Object.values(grouped).map(groupedRows => {
		const ref = groupedRows[0];
		const placementDistribution = buildPlacementDistribution(groupedRows);
		return {
			cardId: ref.bgsHeroQuestRewards,
			totalMatches: groupedRows.length,
			placementDistribution: placementDistribution,
		} as BgsGlobalHeroStat2;
	});
	return result;
};
