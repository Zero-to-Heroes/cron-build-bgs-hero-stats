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
	// console.debug('allStats', mmrPercentile, allStats.length, '/', hourlyData.length);
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
		averagePosition: round(averagePosition),
		standardDeviation: round(standardDeviation),
		standardDeviationOfTheMean: round(standardDeviationOfTheMean),
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
	const rawMerge = mergePlacementDistributionsRaw(stats);
	const result: { rank: number; percentage: number }[] = [];
	const totalDataPoints = rawMerge.map((s) => s.totalMatches).reduce((a, b) => a + b, 0);
	for (let i = 1; i <= 8; i++) {
		const total: number = rawMerge.find((d) => d.rank === i)?.totalMatches ?? 0;
		result.push({ rank: i, percentage: round((100 * total) / totalDataPoints) });
	}
	return result;
};

const mergePlacementDistributionsRaw = (
	stats: readonly BgsGlobalHeroStat[],
): readonly { rank: number; totalMatches: number }[] => {
	const rawStats = stats.map((stat) => stat.placementDistributionRaw);
	// console.debug(
	// 	'will merge placement distributions',
	// 	stats[0].heroCardId,
	// 	stats[0],
	// 	rawStats.length,
	// 	rawStats.filter((s) => !!s).length,
	// );
	// Legacy, can be removed after 2024-01-31
	const pStats = stats
		.filter((stat) => stat.placementDistribution?.length)
		.map((stat) =>
			stat.placementDistribution.map((s) => ({
				rank: s.rank,
				totalMatches: s.percentage * stat.dataPoints,
			})),
		);
	const allRawStats = [...rawStats, ...pStats].filter((s) => !!s);
	const result: { rank: number; totalMatches: number }[] = [];
	for (let i = 1; i <= 8; i++) {
		const total: number = allRawStats
			.map((d) => d?.find((info) => info.rank === i)?.totalMatches ?? 0)
			.reduce((a, b) => a + b, 0);
		result.push({ rank: i, totalMatches: total });
	}
	return result;
};

const mergeWarbandStats = (stats: readonly BgsGlobalHeroStat[]): readonly { turn: number; averageStats: number }[] => {
	const { rawMerge, maxTurn } = mergeWarbandStatsRaw(stats);
	const result: { turn: number; averageStats: number }[] = [];
	const totalDataPoints = rawMerge.map((s) => s.dataPoints).reduce((a, b) => a + b, 0);
	for (let i = 1; i <= maxTurn; i++) {
		const totalStats: number = rawMerge.find((d) => d.turn === i)?.totalStats ?? 0;
		result.push({ turn: i, averageStats: round(totalStats / totalDataPoints) });
	}
	return result;
};

const mergeWarbandStatsRaw = (
	stats: readonly BgsGlobalHeroStat[],
): { rawMerge: readonly { turn: number; dataPoints: number; totalStats: number }[]; maxTurn: number } => {
	const rawStats = stats.map((stat) => stat.warbandStatsRaw).filter((s) => !!s?.length);
	const pStats = stats
		.filter((stat) => stat.warbandStats?.length)
		.map((stat) =>
			stat.warbandStats.map((s) => ({
				turn: s.turn,
				dataPoints: stat.dataPoints,
				totalStats: s.averageStats * stat.dataPoints,
			})),
		);
	const allRawStats = [...rawStats, ...pStats].filter((s) => !!s);
	const result: { turn: number; dataPoints: number; totalStats: number }[] = [];
	const maxTurn = Math.min(20, Math.max(...allRawStats.map((stat) => getMaxTurn(stat))));
	for (let i = 1; i <= maxTurn; i++) {
		const totalStats: number = allRawStats
			.map((d) => d?.find((info) => info.turn === i)?.totalStats ?? 0)
			.reduce((a, b) => a + b, 0);
		const totalDataPoints = allRawStats
			.map((d) => d?.find((info) => info.turn === i)?.dataPoints ?? 0)
			.reduce((a, b) => a + b, 0);
		result.push({ turn: i, totalStats: totalStats, dataPoints: totalDataPoints });
	}
	return { rawMerge: result, maxTurn: maxTurn };
};

const mergeCombatWinrate = (stats: readonly BgsGlobalHeroStat[]): readonly { turn: number; winrate: number }[] => {
	const { rawMerge, maxTurn } = mergeCombatWinrateRaw(stats);
	const result: { turn: number; winrate: number }[] = [];
	const totalDataPoints = rawMerge.map((s) => s.dataPoints).reduce((a, b) => a + b, 0);
	for (let i = 1; i <= maxTurn; i++) {
		const totalWinrate: number = rawMerge.find((d) => d.turn === i)?.totalWinrate ?? 0;
		result.push({ turn: i, winrate: round(totalWinrate / totalDataPoints) });
	}
	return result;
};

const mergeCombatWinrateRaw = (
	stats: readonly BgsGlobalHeroStat[],
): { rawMerge: readonly { turn: number; dataPoints: number; totalWinrate: number }[]; maxTurn: number } => {
	const rawStats = stats.map((stat) => stat.combatWinrateRaw);
	const pStats = stats
		.filter((stat) => stat.combatWinrate?.length)
		.map((stat) =>
			stat.combatWinrate.map((s) => ({
				turn: s.turn,
				dataPoints: stat.dataPoints,
				totalWinrate: s.winrate * stat.dataPoints,
			})),
		);
	const allRawStats = [...rawStats, ...pStats].filter((s) => !!s);
	const result: { turn: number; dataPoints: number; totalWinrate: number }[] = [];
	const maxTurn = Math.min(20, Math.max(...allRawStats.map((stat) => getMaxTurn(stat))));
	for (let i = 0; i <= maxTurn; i++) {
		const totalWinrate: number = allRawStats
			.map((d) => d?.find((info) => info.turn === i)?.totalWinrate ?? 0)
			.reduce((a, b) => a + b, 0);
		const totalDataPoints = allRawStats
			.map((d) => d?.find((info) => info.turn === i)?.dataPoints ?? 0)
			.reduce((a, b) => a + b, 0);
		result.push({ turn: i, totalWinrate: totalWinrate, dataPoints: totalDataPoints });
	}
	return { rawMerge: result, maxTurn: maxTurn };
};

const getMaxTurn = (rawStats: readonly { turn: number }[]): number => {
	return Math.max(...rawStats.map((stat) => stat.turn));
};
