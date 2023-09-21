import { logger } from '@firestone-hs/aws-lambda-utils';
import { gzipSync } from 'zlib';
import { s3 } from '../build-battlegrounds-hero-stats-new';
import { PatchInfo } from '../common';
import { InternalBgsRow } from '../internal-model';
import { BgsQuestStats } from './bgs-quest-stat';
import { buildSplitStats } from './data-filter';
import { buildQuestStats } from './quests-stats-buikder';
import { buildRewardsStats } from './rewards-stats-buikder';

export const QUESTS_BUCKET = `static.zerotoheroes.com`;

export const handleQuestsV2 = async (
	timePeriod: 'all-time' | 'past-three' | 'past-seven' | 'last-patch',
	mmrPercentile: 100 | 50 | 25 | 10 | 1,
	rows: readonly InternalBgsRow[],
	lastPatch: PatchInfo,
) => {
	const rowsWithQuests = rows
		.filter((row) => row.quests)
		.filter((row) => !!row.bgsHeroQuestRewards?.length)
		.filter((row) => !!row.bgsQuestsDifficulties?.length);
	// console.log('total relevant rows', rowsWithQuests?.length);

	const questStatsResult = await buildSplitStats(
		rowsWithQuests,
		timePeriod,
		mmrPercentile,
		lastPatch,
		(data: InternalBgsRow[]) => buildQuestStats(data),
	);
	const questStats = questStatsResult.stats;

	const rewardStatsResult = await buildSplitStats(
		rowsWithQuests,
		timePeriod,
		mmrPercentile,
		lastPatch,
		(data: InternalBgsRow[]) => buildRewardsStats(data),
	);
	const rewardStats = rewardStatsResult.stats;

	const statsForQuests: BgsQuestStats = {
		lastUpdateDate: new Date(),
		mmrPercentiles: questStatsResult.mmrPercentiles,
		questStats: questStats,
		rewardStats: rewardStats,
		dataPoints: rowsWithQuests.length,
	};
	logger.log('\tbuilt stats', timePeriod, statsForQuests.dataPoints, statsForQuests.questStats?.length);
	const timeSuffix = timePeriod;
	await s3.writeFile(
		gzipSync(JSON.stringify(statsForQuests)),
		QUESTS_BUCKET,
		`api/bgs/quests/mmr-${mmrPercentile}/bgs-quests-v2-${timeSuffix}.gz.json`,
		'application/json',
		'gzip',
	);
};
