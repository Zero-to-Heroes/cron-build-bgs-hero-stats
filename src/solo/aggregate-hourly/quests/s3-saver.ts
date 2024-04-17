import { gzipSync } from 'zlib';
import { BgsGlobalQuestStat, BgsGlobalRewardStat, BgsQuestStats } from '../../../model-quests';
import { MmrPercentile, MmrPercentileFilter, TimePeriod } from '../../../models';
import { STATS_BUCKET } from '../../hourly/_build-battlegrounds-hero-stats';
import { STAT_KEY_QUEST } from '../config';
import { s3 } from './_build-aggregated-stats';

export const persistData = async (
	questStats: readonly BgsGlobalQuestStat[],
	rewardStats: readonly BgsGlobalRewardStat[],
	mmrPercentiles: readonly MmrPercentile[],
	lastUpdate: Date,
	timePeriod: TimePeriod,
	mmrPercentile: MmrPercentileFilter,
) => {
	const stat: BgsQuestStats = {
		questStats: questStats.map((stat) => ({
			...stat,
			mmrPercentile: mmrPercentile,
			timePeriod: timePeriod,
		})),
		rewardStats: rewardStats.map((stat) => ({
			...stat,
			mmrPercentile: mmrPercentile,
			timePeriod: timePeriod,
		})),
		lastUpdateDate: lastUpdate,
		dataPoints: questStats.map((s) => s.dataPoints).reduce((a, b) => a + b, 0),
		mmrPercentiles: mmrPercentiles,
	};
	// console.log('persisting data', stat.dataPoints, stat.heroStats?.length);
	await s3.writeFile(
		gzipSync(JSON.stringify(stat)),
		STATS_BUCKET,
		STAT_KEY_QUEST.replace('%mmrPercentile%', `${mmrPercentile}`).replace('%timePeriod%', timePeriod),
		'application/json',
		'gzip',
	);
};
