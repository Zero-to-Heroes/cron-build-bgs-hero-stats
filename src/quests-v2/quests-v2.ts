import { logger } from '@firestone-hs/aws-lambda-utils';
import { gzipSync } from 'zlib';
import { s3 } from '../build-battlegrounds-hero-stats-new';
import { PatchInfo } from '../common';
import { InternalBgsRow } from '../internal-model';
import { BgsQuestStats } from './bgs-quest-stat';
import { buildSplitStats } from './data-filter';
import { buildStats } from './stats-buikder';

export const QUESTS_BUCKET = `static.zerotoheroes.com`;

export const handleQuestsV2 = async (
	timePeriod: 'all-time' | 'past-three' | 'past-seven' | 'last-patch',
	rows: readonly InternalBgsRow[],
	lastPatch: PatchInfo,
) => {
	const rowsWithQuests = rows
		.filter(row => row.quests)
		.filter(row => !!row.bgsHeroQuestRewards?.length)
		.filter(row => !!row.bgsQuestsDifficulties?.length);
	console.log('total relevant rows', rowsWithQuests?.length);

	const statResult = await buildSplitStats(rowsWithQuests, timePeriod, lastPatch, (data: InternalBgsRow[]) =>
		buildStats(data),
	);
	const stats = statResult.stats;
	const statsForQuests: BgsQuestStats = {
		lastUpdateDate: new Date(),
		mmrPercentiles: statResult.mmrPercentiles,
		questStats: stats,
		dataPoints: rowsWithQuests.length,
	};
	logger.log('\tbuilt stats', statsForQuests.dataPoints, statsForQuests.questStats?.length);
	const timeSuffix = timePeriod;
	await s3.writeFile(
		gzipSync(JSON.stringify(statsForQuests)),
		QUESTS_BUCKET,
		`api/bgs/quests/bgs-quests-v2-${timeSuffix}.gz.json`,
		'application/json',
		'gzip',
	);
};
