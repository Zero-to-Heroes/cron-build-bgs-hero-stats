import { S3 } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { gzipSync } from 'zlib';
import { InternalBgsRow } from '../internal-model';
import { BgsGlobalQuestStat, BgsGlobalRewardStat, BgsQuestStats } from '../model-quests';
import { MmrPercentile } from '../models';
import { HOURLY_KEY_QUEST, STATS_BUCKET } from './_build-battlegrounds-hero-stats';
import { buildQuestStatsForMmr } from './quests/quest-stats-buikder';
import { buildRewardStatsForMmr } from './quests/reward-stats-builder';
import { buildMmrPercentiles } from './utils';

export const buildQuestStats = async (
	startDate: string,
	percentile: 100 | 50 | 25 | 10 | 1,
	rows: readonly InternalBgsRow[],
	allCards: AllCardsService,
	s3: S3,
) => {
	const rowsWithQuests = rows
		.filter((row) => row.quests && row.bgsHeroQuests?.length > 0)
		.filter((row) => {
			const diff = row.bgsQuestsDifficulties;
			return diff != null && !!diff?.length && !!parseInt(diff) && !isNaN(parseInt(diff));
		});
	const mmrPercentiles: readonly MmrPercentile[] = buildMmrPercentiles(rowsWithQuests);
	const mmrPercentile = mmrPercentiles.find((p) => p.percentile === percentile);
	const mmrRows = rowsWithQuests.filter((row) => mmrPercentile.percentile === 100 || row.rating >= mmrPercentile.mmr);

	const questStats: readonly BgsGlobalQuestStat[] = buildQuestStatsForMmr(mmrRows, allCards);
	const rewardStats: readonly BgsGlobalRewardStat[] = buildRewardStatsForMmr(mmrRows, allCards);
	const statsV2: BgsQuestStats = {
		lastUpdateDate: new Date(),
		mmrPercentiles: mmrPercentiles,
		questStats: questStats.map((stat) => ({
			...stat,
			mmrPercentile: percentile,
			timePeriod: null,
		})),
		rewardStats: rewardStats.map((stat) => ({
			...stat,
			mmrPercentile: percentile,
			timePeriod: null,
		})),
		dataPoints: questStats.map((s) => s.dataPoints).reduce((a, b) => a + b, 0),
	};
	// logger.log('\tbuilt stats', statsV2.dataPoints, statsV2.heroStats?.length);
	const destination = HOURLY_KEY_QUEST.replace('%mmrPercentile%', `${percentile}`).replace('%startDate%', startDate);
	await s3.writeFile(gzipSync(JSON.stringify(statsV2)), STATS_BUCKET, destination, 'application/json', 'gzip');
	// console.log('written file', destination);
};
