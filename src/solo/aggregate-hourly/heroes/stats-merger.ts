import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService, CardIds } from '@firestone-hs/reference-data';
import { round } from '../../../common/util-functions';
import { BgsGlobalHeroStat, BgsHeroStatsV2, BgsHeroTribeStat, MmrPercentileFilter } from '../../../models';

export const mergeStats = (
	hourlyData: readonly BgsHeroStatsV2[],
	mmrPercentile: MmrPercentileFilter,
	allCards: AllCardsService,
): readonly BgsGlobalHeroStat[] => {
	const allStats: readonly BgsGlobalHeroStat[] = hourlyData
		.flatMap((data) => data.heroStats)
		.filter((stat) => stat.mmrPercentile === mmrPercentile)
		.filter((stat) => stat.heroCardId !== CardIds.BaconphheroHeroic);
	// console.debug('allStats', mmrPercentile, allStats.length, '/', hourlyData.length);
	const groupedByHero: {
		[heroCardId: string]: readonly BgsGlobalHeroStat[];
	} = groupByFunction((stat: BgsGlobalHeroStat) => stat.heroCardId)(allStats);
	const result: readonly BgsGlobalHeroStat[] = Object.values(groupedByHero).map((stats) =>
		mergeStatsForSingleHero(stats, allCards),
	);
	const maxDataPoints = Math.max(...result.map((r) => r.dataPoints));
	const filtered = result.filter((r) => r.dataPoints > maxDataPoints / 50);
	return filtered;
};

const mergeStatsForSingleHero = (stats: readonly BgsGlobalHeroStat[], allCards: AllCardsService): BgsGlobalHeroStat => {
	const ref = stats[0];
	const debug = ref.heroCardId === 'BG21_HERO_010';

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
		totalOffered: stats.map((stat) => stat.totalOffered ?? 0).reduce((a, b) => a + b, 0),
		totalPicked: stats.map((stat) => stat.totalPicked ?? 0).reduce((a, b) => a + b, 0),
		averagePosition: round(averagePosition),
		standardDeviation: round(standardDeviation),
		standardDeviationOfTheMean: round(standardDeviationOfTheMean),
		conservativePositionEstimate: round(averagePosition + 3 * standardDeviationOfTheMean),
		placementDistribution: mergePlacementDistributions(stats),
		warbandStats: mergeWarbandStats(stats),
		combatWinrate: mergeCombatWinrate(stats, debug),
		tribeStats: mergeTribeStats(stats, averagePosition).filter(
			(s) => s.dataPointsOnMissingTribe > s.dataPoints / 20,
		),
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
		const averagePositionWithoutTribe =
			tribeStats
				.map((stat) => stat.averagePositionWithoutTribe * stat.dataPointsOnMissingTribe)
				.reduce((a, b) => a + b, 0) /
			tribeStats.map((stat) => stat.dataPointsOnMissingTribe).reduce((a, b) => a + b, 0);
		// const impactAveragePosition =
		// 	tribeStats.map((stat) => stat.impactAveragePosition * stat.dataPoints).reduce((a, b) => a + b, 0) /
		// 	tribeStats.map((stat) => stat.dataPoints).reduce((a, b) => a + b, 0);
		// const impactAveragePositionVsMissingTribe =
		// 	tribeStats
		// 		.map((stat) => stat.impactAveragePositionVsMissingTribe * stat.dataPoints)
		// 		.reduce((a, b) => a + b, 0) / tribeStats.map((stat) => stat.dataPoints).reduce((a, b) => a + b, 0);
		return {
			tribe: tribe,
			dataPoints: tribeStats.map((stat) => stat.dataPoints).reduce((a, b) => a + b, 0),
			dataPointsOnMissingTribe: tribeStats
				.map((stat) => stat.dataPointsOnMissingTribe)
				.reduce((a, b) => a + b, 0),
			totalOffered: tribeStats.map((stat) => stat.totalOffered ?? 0).reduce((a, b) => a + b, 0),
			totalPicked: tribeStats.map((stat) => stat.totalPicked ?? 0).reduce((a, b) => a + b, 0),
			averagePosition: round(averagePosition),
			averagePositionWithoutTribe: round(averagePositionWithoutTribe),
			refAveragePosition: round(refAveragePosition),
			impactAveragePosition: round(averagePosition - refAveragePosition),
			impactAveragePositionVsMissingTribe: round(averagePosition - averagePositionWithoutTribe),
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
	// const pStats = stats
	// 	.filter((stat) => stat.placementDistribution?.length)
	// 	.map((stat) =>
	// 		stat.placementDistribution.map((s) => ({
	// 			rank: s.rank,
	// 			totalMatches: s.percentage * stat.dataPoints,
	// 		})),
	// 	);
	// const allRawStats = [...rawStats, ...pStats].filter((s) => !!s);
	const result: { rank: number; totalMatches: number }[] = [];
	for (let i = 1; i <= 8; i++) {
		const total: number = rawStats
			.map((d) => d?.find((info) => info.rank === i)?.totalMatches ?? 0)
			.reduce((a, b) => a + b, 0);
		result.push({ rank: i, totalMatches: total });
	}
	return result;
};

const mergeWarbandStats = (stats: readonly BgsGlobalHeroStat[]): readonly { turn: number; averageStats: number }[] => {
	const { rawMerge, maxTurn } = mergeWarbandStatsRaw(stats);
	const result: { turn: number; averageStats: number }[] = [];
	for (let i = 1; i <= maxTurn; i++) {
		const statsForTurn = rawMerge.find((d) => d.turn === i);
		result.push({ turn: i, averageStats: round(statsForTurn.totalStats / statsForTurn.dataPoints) });
	}
	return result;
};

const mergeWarbandStatsRaw = (
	stats: readonly BgsGlobalHeroStat[],
): { rawMerge: readonly { turn: number; dataPoints: number; totalStats: number }[]; maxTurn: number } => {
	const rawStats = stats.map((stat) => stat.warbandStatsRaw).filter((s) => !!s?.length);
	const result: { turn: number; dataPoints: number; totalStats: number }[] = [];
	const maxTurn = Math.min(20, Math.max(...rawStats.map((stat) => getMaxTurn(stat))));
	for (let i = 1; i <= maxTurn; i++) {
		const rawStatsForTurn = rawStats.map((stat) => stat.find((info) => info.turn === i));
		const totalStats: number = rawStatsForTurn.map((d) => d?.totalStats ?? 0).reduce((a, b) => a + b, 0);
		const totalDataPoints = rawStatsForTurn.map((d) => d?.dataPoints ?? 0).reduce((a, b) => a + b, 0);
		result.push({ turn: i, totalStats: totalStats, dataPoints: totalDataPoints });
	}
	return { rawMerge: result, maxTurn: maxTurn };
};

const mergeCombatWinrate = (
	stats: readonly BgsGlobalHeroStat[],
	debug = false,
): readonly { turn: number; winrate: number }[] => {
	const { rawMerge, maxTurn } = mergeCombatWinrateRaw(stats, debug);
	const result: { turn: number; winrate: number }[] = [];
	for (let i = 1; i <= maxTurn; i++) {
		const statForTurn = rawMerge.find((d) => d.turn === i);
		result.push({ turn: i, winrate: round(statForTurn.totalWinrate / statForTurn.dataPoints) });
	}
	return result;
};

const mergeCombatWinrateRaw = (
	stats: readonly BgsGlobalHeroStat[],
	debug = false,
): { rawMerge: readonly { turn: number; dataPoints: number; totalWinrate: number }[]; maxTurn: number } => {
	const rawStats = stats.map((stat) => stat.combatWinrateRaw).filter((stat) => !!stat?.length);
	// debug && console.log('rawStats', rawStats?.length, rawStats);
	const result: { turn: number; dataPoints: number; totalWinrate: number }[] = [];
	const maxTurn = Math.min(20, Math.max(...rawStats.map((stat) => getMaxTurn(stat))));
	// debug && console.log('maxTurn', maxTurn);
	for (let i = 0; i <= maxTurn; i++) {
		const rawStatsForTurn = rawStats.map((stat) => stat.find((info) => info.turn === i));
		const totalWinrate: number = rawStatsForTurn.map((d) => d?.totalWinrate ?? 0).reduce((a, b) => a + b, 0);
		const totalDataPoints = rawStatsForTurn.map((d) => d?.dataPoints ?? 0).reduce((a, b) => a + b, 0);
		result.push({ turn: i, totalWinrate: totalWinrate, dataPoints: totalDataPoints });
	}
	// debug && console.log('result', result);
	return { rawMerge: result, maxTurn: maxTurn };
};

const getMaxTurn = (rawStats: readonly { turn: number }[]): number => {
	if (!rawStats?.length) {
		return 0;
	}
	return Math.max(...rawStats.map((stat) => stat.turn));
};
