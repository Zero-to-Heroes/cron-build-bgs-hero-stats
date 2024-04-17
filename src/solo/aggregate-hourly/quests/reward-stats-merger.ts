import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { BgsGlobalRewardStat, BgsQuestStats, BgsRewardHeroStat, BgsRewardTribeStat } from '../../../model-quests';
import { MmrPercentileFilter } from '../../../models';

export const mergeRewardStats = (
	hourlyData: readonly BgsQuestStats[],
	mmrPercentile: MmrPercentileFilter,
	allCards: AllCardsService,
): readonly BgsGlobalRewardStat[] => {
	const allStats: readonly BgsGlobalRewardStat[] = hourlyData
		.flatMap((data) => data.rewardStats)
		.filter((stat) => stat.mmrPercentile === mmrPercentile);
	// console.debug('allStats', mmrPercentile, allStats.length, '/', hourlyData.length);
	const groupedByReward: {
		[rewardCardId: string]: readonly BgsGlobalRewardStat[];
	} = groupByFunction((stat: BgsGlobalRewardStat) => stat.rewardCardId)(allStats);
	const result: readonly BgsGlobalRewardStat[] = Object.values(groupedByReward).map((stats) =>
		mergeStatsForSingleReward(stats, allCards),
	);
	return result;
};

const mergeStatsForSingleReward = (
	stats: readonly BgsGlobalRewardStat[],
	allCards: AllCardsService,
): BgsGlobalRewardStat => {
	const ref = stats[0];
	// const debug = ref.heroCardId === 'BG21_HERO_010';

	const totalDataPoints = stats.map((stat) => stat.dataPoints).reduce((a, b) => a + b, 0);
	const totalPlacement = stats.map((s) => s.averagePlacement * s.dataPoints).reduce((a, b) => a + b, 0);
	const refAveragePlacement = totalPlacement / totalDataPoints;

	const result: BgsGlobalRewardStat = {
		rewardCardId: ref.rewardCardId,
		dataPoints: totalDataPoints,
		averagePlacement: refAveragePlacement,
		heroStats: mergeHeroStatsForSingleReward(stats),
		tribeStats: mergeTribeStatsForSingleReward(stats, refAveragePlacement),
	};
	return result;
};

const mergeTribeStatsForSingleReward = (
	stats: readonly BgsGlobalRewardStat[],
	refAveragePlacement: number,
): readonly BgsRewardTribeStat[] => {
	const tribeStats = stats.flatMap((s) => s.tribeStats);
	const groupedByTribe: {
		[tribe: string]: readonly BgsRewardTribeStat[];
	} = groupByFunction((stat: BgsRewardTribeStat) => stat.tribe)(tribeStats);
	const result: readonly BgsRewardTribeStat[] = Object.values(groupedByTribe).map((stats) =>
		mergeTribeStatsForSingleTribe(stats, refAveragePlacement),
	);
	return result;
};

const mergeTribeStatsForSingleTribe = (
	stats: readonly BgsRewardTribeStat[],
	refAveragePlacement: number,
): BgsRewardTribeStat => {
	const ref = stats[0];

	const totalDataPoints = stats.map((s) => s.dataPoints).reduce((a, b) => a + b, 0);
	const totalPlacement = stats.map((s) => s.averagePlacement * s.dataPoints).reduce((a, b) => a + b, 0);
	const averagePlacement = totalPlacement / totalDataPoints;

	const result: BgsRewardTribeStat = {
		tribe: ref.tribe,
		dataPoints: totalDataPoints,
		averagePlacement: averagePlacement,
		impactPlacement: averagePlacement - refAveragePlacement,
	};
	return result;
};

const mergeHeroStatsForSingleReward = (stats: readonly BgsGlobalRewardStat[]): readonly BgsRewardHeroStat[] => {
	const heroStats = stats.flatMap((s) => s.heroStats);
	const groupedByHero: {
		[heroCardId: string]: readonly BgsRewardHeroStat[];
	} = groupByFunction((stat: BgsRewardHeroStat) => stat.heroCardId)(heroStats);
	const result: readonly BgsRewardHeroStat[] = Object.values(groupedByHero).map((stats) =>
		mergeHeroStatsForSingleHero(stats),
	);
	return result;
};

const mergeHeroStatsForSingleHero = (stats: readonly BgsRewardHeroStat[]): BgsRewardHeroStat => {
	const ref = stats[0];

	const totalDataPoints = stats.map((s) => s.dataPoints).reduce((a, b) => a + b, 0);
	const totalPlacement = stats.map((s) => s.averagePlacement * s.dataPoints).reduce((a, b) => a + b, 0);
	const averagePlacement = totalPlacement / totalDataPoints;

	const result: BgsRewardHeroStat = {
		heroCardId: ref.heroCardId,
		dataPoints: totalDataPoints,
		averagePlacement: averagePlacement,
	};
	return result;
};
