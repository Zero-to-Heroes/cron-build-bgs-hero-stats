import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService, Race } from '@firestone-hs/reference-data';
import { buildCombatWinrate, buildWarbandStats } from '../build-battlegrounds-hero-stats-new';
import { buildPlacementDistributionWithPercentages } from '../common';
import { InternalBgsRow } from '../internal-model';
import { normalizeHeroCardId, round } from '../utils/util-functions';
import { BgsGlobalHeroStat, BgsHeroAnomalyStat, BgsHeroTribeStat } from './bgs-hero-stat';

export const buildStats = (
	rows: readonly InternalBgsRow[],
	allCards: AllCardsService,
): readonly BgsGlobalHeroStat[] => {
	// This takes about 3s, so not impactful
	const groupedByHero: {
		[questCardId: string]: readonly InternalBgsRow[];
	} = groupByFunction((row: InternalBgsRow) => normalizeHeroCardId(row.heroCardId, allCards))(rows);
	return Object.values(groupedByHero).flatMap((data) => buildStatsForSingleHero(data));
};

// All rows here belong to a single hero
const buildStatsForSingleHero = (rows: readonly InternalBgsRow[]): BgsGlobalHeroStat => {
	const startTime = new Date().getTime();
	const ref = rows[0];
	const averagePosition = average(rows.map((r) => r.rank));
	const placementStartTime = new Date().getTime();
	const placementDistribution = buildPlacementDistributionWithPercentages(rows);
	const placementProcessTime = new Date().getTime() - placementStartTime;
	const winrateStartTime = new Date().getTime();
	const rawCombatWinrates = buildCombatWinrate(rows);
	const winrateProcessTime = new Date().getTime() - winrateStartTime;
	const combatWinrate: readonly { turn: number; winrate: number }[] = rawCombatWinrates.map((info) => ({
		turn: info.turn,
		winrate: round(info.totalWinrate / info.dataPoints),
	}));
	const rawWarbandStats = buildWarbandStats(rows);
	const warbandStats: readonly { turn: number; averageStats: number }[] = rawWarbandStats.map((info) => ({
		turn: info.turn,
		averageStats: round(info.totalStats / info.dataPoints),
	}));

	const allRanks = rows.map((r) => r.rank);
	const allDeviations = allRanks.map((r) => averagePosition - r);
	const squareDeviations = allDeviations.map((d) => Math.pow(d, 2));
	const sumOfSquares = squareDeviations.reduce((a, b) => a + b, 0);
	const variance = sumOfSquares / rows.length;
	const standardDeviation = Math.sqrt(variance);
	const standardDeviationOfTheMean = standardDeviation / Math.sqrt(rows.length);
	const tribeStartTime = new Date().getTime();
	const tribeStats = buildTribeStats(rows, averagePosition, placementDistribution, combatWinrate, warbandStats);
	const tribeProcessTime = new Date().getTime() - tribeStartTime;
	const anomalyStartTime = new Date().getTime();
	const anomalyStats = buildAnomalyStats(rows, averagePosition, placementDistribution, combatWinrate, warbandStats);
	const anomalyProcessTime = new Date().getTime() - anomalyStartTime;
	const result: BgsGlobalHeroStat = {
		heroCardId: ref.heroCardId,
		dataPoints: rows.length,
		averagePosition: round(averagePosition),
		standardDeviation: round(standardDeviation),
		standardDeviationOfTheMean: round(standardDeviationOfTheMean),
		conservativePositionEstimate: round(averagePosition + 3 * standardDeviationOfTheMean),
		placementDistribution: placementDistribution,
		combatWinrate: combatWinrate,
		warbandStats: warbandStats,
		tribeStats: tribeStats,
		anomalyStats: anomalyStats,
	};
	const processTime = new Date().getTime() - startTime;
	console.log(
		'\tbuilt for hero',
		processTime,
		round(processTime / result.dataPoints),
		result.heroCardId,
		result.dataPoints,
	);
	console.log('\t\tplacement', placementProcessTime);
	console.log('\t\twinrate', winrateProcessTime);
	console.log('\t\ttribe', tribeProcessTime);
	console.log('\t\tanomaly', anomalyProcessTime);
	return result;
};

const buildTribeStats = (
	rows: readonly InternalBgsRow[],
	refAveragePosition: number,
	refPlacementDistribution: readonly { rank: number; percentage: number }[],
	refCombatWinrate: readonly { turn: number; winrate: number }[],
	refWarbandStats: readonly { turn: number; averageStats: number }[],
): readonly BgsHeroTribeStat[] => {
	const uniqueTribes: readonly Race[] = [...new Set(rows.flatMap((r) => r.tribesExpanded))];
	return uniqueTribes.map((tribe) => {
		const rowsForTribe = rows.filter((r) => r.tribesExpanded.includes(tribe));
		const rowsWithoutTribe = rows.filter((r) => !r.tribesExpanded.includes(tribe));
		const averagePosition = average(rowsForTribe.map((r) => r.rank));
		// const distStartTime = new Date().getTime();
		// const placementDistribution = buildPlacementDistributionWithPercentages(rowsForTribe);
		// const distProcessTime = new Date().getTime() - distStartTime;
		// const combatStartTime = new Date().getTime();
		// const rawCombatWinrates = buildCombatWinrate(rowsForTribe);
		// const combatWinrate = rawCombatWinrates.map((info) => ({
		// 	turn: info.turn,
		// 	winrate: round(info.totalWinrate / info.dataPoints),
		// }));
		// const combatProcessTime = new Date().getTime() - combatStartTime;
		// const warbandStartTime = new Date().getTime();
		// const rawWarbandStats = buildWarbandStats(rowsForTribe);
		// const warbandStats: readonly { turn: number; averageStats: number }[] = rawWarbandStats.map((info) => ({
		// 	turn: info.turn,
		// 	averageStats: info.totalStats / info.dataPoints,
		// }));
		// const warbandProcessTime = new Date().getTime() - warbandStartTime;
		// console.log(
		// 	'tribeStats durations',
		// 	'placement',
		// 	distProcessTime,
		// 	'combat',
		// 	combatProcessTime,
		// 	'\twarband',
		// 	warbandProcessTime,
		// );
		const result: BgsHeroTribeStat = {
			tribe: tribe,
			dataPoints: rowsForTribe.length,
			dataPointsOnMissingTribe: rowsWithoutTribe.length,
			averagePosition: round(averagePosition),
			impactAveragePosition: round(averagePosition - refAveragePosition),
			// placementDistribution: placementDistribution,
			// impactPlacementDistribution: refPlacementDistribution.map((p) => {
			// 	const newPlacementInfo = placementDistribution.find((p2) => p2.rank === p.rank);
			// 	// Cna happen when there isn't a lot of data points, typically for high MMR
			// 	if (!newPlacementInfo) {
			// 		// console.log('missing placement info', placementDistribution, p);
			// 	}
			// 	return {
			// 		rank: p.rank,
			// 		impact: round((newPlacementInfo?.percentage ?? 0) - p.percentage),
			// 	};
			// }),
			// combatWinrate: combatWinrate,
			// impactCombatWinrate: refCombatWinrate.map((c) => {
			// 	const newCombatWinrate = combatWinrate.find((c2) => c2.turn === c.turn);
			// 	if (!newCombatWinrate) {
			// 		// console.debug('missing winrate info', combatWinrate);
			// 	}
			// 	return {
			// 		turn: c.turn,
			// 		impact: round((newCombatWinrate?.winrate ?? 0) - c.winrate),
			// 	};
			// }),
			// warbandStats: warbandStats,
			// impactWarbandStats: refWarbandStats.map((c) => {
			// 	const newWarbandStats = warbandStats.find((c2) => c2.turn === c.turn);
			// 	if (!newWarbandStats) {
			// 		// console.debug('missing warband info', warbandStats);
			// 	}
			// 	return {
			// 		turn: c.turn,
			// 		impact: (newWarbandStats?.averageStats ?? 0) - c.averageStats,
			// 	};
			// }),
		};
		return result;
	});
};

const buildAnomalyStats = (
	rows: readonly InternalBgsRow[],
	refAveragePosition: number,
	refPlacementDistribution: readonly { rank: number; percentage: number }[],
	refCombatWinrate: readonly { turn: number; winrate: number }[],
	refWarbandStats: readonly { turn: number; averageStats: number }[],
): readonly BgsHeroAnomalyStat[] => {
	const rowsWithAnomalies = rows.filter((r) => !!r.bgsAnomalies?.length);
	const uniqueAnomalies: readonly string[] = [...new Set(rowsWithAnomalies.flatMap((r) => r.bgsAnomalies))];
	return uniqueAnomalies.map((anomaly) => {
		const rowsForAnomaly = rowsWithAnomalies.filter((r) => r.bgsAnomalies.includes(anomaly));
		const averagePosition = average(rowsForAnomaly.map((r) => r.rank));
		const placementDistribution = buildPlacementDistributionWithPercentages(rowsForAnomaly);
		const rawCombatWinrates = buildCombatWinrate(rowsForAnomaly);
		const combatWinrate = rawCombatWinrates.map((info) => ({
			turn: info.turn,
			winrate: round(info.totalWinrate / info.dataPoints),
		}));
		const rawWarbandStats = buildWarbandStats(rowsForAnomaly);
		const warbandStats: readonly { turn: number; averageStats: number }[] = rawWarbandStats.map((info) => ({
			turn: info.turn,
			averageStats: round(info.totalStats / info.dataPoints),
		}));
		const result: BgsHeroAnomalyStat = {
			anomaly: anomaly,
			dataPoints: rowsForAnomaly.length,
			averagePosition: round(averagePosition),
			impactAveragePosition: round(averagePosition - refAveragePosition),
			placementDistribution: placementDistribution,
			impactPlacementDistribution: refPlacementDistribution.map((p) => {
				const newPlacementInfo = placementDistribution.find((p2) => p2.rank === p.rank);
				// Cna happen when there isn't a lot of data points, typically for high MMR
				if (!newPlacementInfo) {
					// console.log('missing placement info', placementDistribution, p);
				}
				return {
					rank: p.rank,
					impact: round((newPlacementInfo?.percentage ?? 0) - p.percentage),
				};
			}),
			combatWinrate: combatWinrate,
			impactCombatWinrate: refCombatWinrate.map((c) => {
				const newCombatWinrate = combatWinrate.find((c2) => c2.turn === c.turn);
				if (!newCombatWinrate) {
					// console.debug('missing winrate info', combatWinrate);
				}
				return {
					turn: c.turn,
					impact: round((newCombatWinrate?.winrate ?? 0) - c.winrate),
				};
			}),
			warbandStats: warbandStats,
			impactWarbandStats: refWarbandStats.map((c) => {
				const newWarbandStats = warbandStats.find((c2) => c2.turn === c.turn);
				if (!newWarbandStats) {
					// console.debug('missing warband info', warbandStats);
				}
				return {
					turn: c.turn,
					impact: round((newWarbandStats?.averageStats ?? 0) - c.averageStats),
				};
			}),
		};
		return result;
	});
};

const average = (data: readonly number[]): number => {
	return data.reduce((a, b) => a + b, 0) / data.length;
};
