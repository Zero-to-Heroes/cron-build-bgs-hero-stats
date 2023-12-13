import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { BgsGlobalHeroStat, BgsHeroStatsV2, BgsHeroTribeStat, MmrPercentileFilter } from '../models';
import { round } from '../utils/util-functions';

export const mergeStats = (
	hourlyData: readonly BgsHeroStatsV2[],
	mmrPercentile: MmrPercentileFilter,
	allCards: AllCardsService,
): readonly BgsGlobalHeroStat[] => {
	const allStats: readonly BgsGlobalHeroStat[] = hourlyData
		.flatMap((data) => data.heroStats)
		.filter((stat) => stat.mmrPercentile === mmrPercentile);
	console.debug('allStats', mmrPercentile, allStats.length, '/', hourlyData.length);
	const groupedByHero: {
		[heroCardId: string]: readonly BgsGlobalHeroStat[];
	} = groupByFunction((stat: BgsGlobalHeroStat) => stat.heroCardId)(allStats);
	const result: readonly BgsGlobalHeroStat[] = Object.values(groupedByHero).map((stats) =>
		mergeStatsForSingleHero(stats, allCards),
	);
	return result;
};

const mergeStatsForSingleHero = (stats: readonly BgsGlobalHeroStat[], allCards: AllCardsService): BgsGlobalHeroStat => {
	const ref = stats[0];

	const totalWeightedAverage = stats.map((s) => s.averagePosition * s.dataPoints).reduce((a, b) => a + b, 0);
	const totalDataPoints = stats.map((s) => s.dataPoints).reduce((a, b) => a + b, 0);
	const averagePosition = totalWeightedAverage / totalDataPoints;

	const totalWeightedVariance = stats
		.map((s) => s.standardDeviation * s.standardDeviation * s.dataPoints)
		.reduce((a, b) => a + b, 0);
	const overallVariance = totalWeightedVariance / totalDataPoints;
	const standardDeviation = Math.sqrt(overallVariance);
	const standardDeviationOfTheMean = standardDeviation / Math.sqrt(totalDataPoints);

	const result: BgsGlobalHeroStat = {
		heroCardId: ref.heroCardId,
		dataPoints: stats.map((stat) => stat.dataPoints).reduce((a, b) => a + b, 0),
		averagePosition: averagePosition,
		standardDeviation: standardDeviation,
		standardDeviationOfTheMean: standardDeviationOfTheMean,
		conservativePositionEstimate: round(averagePosition + 3 * standardDeviationOfTheMean),
		placementDistribution: mergePlacementDistributions(stats),
		warbandStats: mergeWarbandStats(stats),
		combatWinrate: mergeCombatWinrate(stats),
		tribeStats: mergeTribeStats(stats, averagePosition),
		anomalyStats: [], // mergeAnomalyStats(stats),
	};
	return result;
};

const mergeTribeStats = (
	stats: readonly BgsGlobalHeroStat[],
	refAveragePosition: number,
): readonly BgsHeroTribeStat[] => {
	const allTribeStats = stats.flatMap((stat) => stat.tribeStats);
	const uniqueTribes = new Set(allTribeStats.map((tribe) => tribe.tribe));
	const result: BgsHeroTribeStat[] = [...uniqueTribes].map((tribe) => {
		const tribeStats = allTribeStats.filter((stat) => stat.tribe === tribe);
		const averagePosition =
			tribeStats.map((stat) => stat.averagePosition * stat.dataPoints).reduce((a, b) => a + b, 0) /
			tribeStats.map((stat) => stat.dataPoints).reduce((a, b) => a + b, 0);
		return {
			tribe: tribe,
			dataPoints: tribeStats.map((stat) => stat.dataPoints).reduce((a, b) => a + b, 0),
			dataPointsOnMissingTribe: tribeStats
				.map((stat) => stat.dataPointsOnMissingTribe)
				.reduce((a, b) => a + b, 0),
			averagePosition: round(averagePosition),
			impactAveragePosition: round(averagePosition - refAveragePosition),
		};
	});
	return result;
};

const mergePlacementDistributions = (
	stats: readonly BgsGlobalHeroStat[],
): readonly { rank: number; percentage: number }[] => {
	const result: { rank: number; percentage: number }[] = [];
	const totalDataPoints = stats.map((s) => s.dataPoints).reduce((a, b) => a + b, 0);
	for (let i = 1; i <= 8; i++) {
		const total: number = stats
			.map((s) => (s.placementDistribution[i]?.percentage ?? 0) * s.dataPoints)
			.reduce((a, b) => a + b, 0);
		result.push({ rank: i, percentage: round((100 * total) / totalDataPoints) });
	}
	return result;
};

const mergeWarbandStats = (stats: readonly BgsGlobalHeroStat[]): readonly { turn: number; averageStats: number }[] => {
	const result: { turn: number; averageStats: number }[] = [];
	const totalDataPoints = stats.map((s) => s.dataPoints).reduce((a, b) => a + b, 0);
	for (let i = 1; i <= 8; i++) {
		const total: number = stats
			.map((s) => (s.warbandStats[i]?.averageStats ?? 0) * s.dataPoints)
			.reduce((a, b) => a + b, 0);
		result.push({ turn: i, averageStats: round(total / totalDataPoints) });
	}
	return result;
};

const mergeCombatWinrate = (
	stats: readonly BgsGlobalHeroStat[],
): readonly { turn: number; dataPoints: number; winrate: number }[] => {
	const result: { turn: number; dataPoints: number; winrate: number }[] = [];
	const totalDataPoints = stats.map((s) => s.dataPoints).reduce((a, b) => a + b, 0);
	for (let i = 1; i <= 8; i++) {
		const total: number = stats
			.map((s) => (s.combatWinrate[i]?.winrate ?? 0) * s.dataPoints)
			.reduce((a, b) => a + b, 0);
		result.push({ turn: i, dataPoints: totalDataPoints, winrate: round(total / totalDataPoints) });
	}
	return result;
};
