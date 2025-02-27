import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService, Race } from '@firestone-hs/reference-data';
import { round } from '../../common/util-functions';
import { InternalBgsRow } from '../../internal-model';
import { BgsGlobalHeroStat, BgsHeroTribeStat } from '../../models';
import { buildCombatWinrate, buildWarbandStats } from './builders';
import { buildPlacementDistribution } from './utils';

export const buildHeroStatsForMmr = (
	rows: readonly InternalBgsRow[],
	allCards: AllCardsService,
): readonly BgsGlobalHeroStat[] => {
	// This takes about 3s, so not impactful
	const groupedByHero: {
		[questCardId: string]: readonly InternalBgsRow[];
	} = groupByFunction((row: InternalBgsRow) => row.heroCardId)(rows);
	return Object.values(groupedByHero).flatMap((data) => buildStatsForSingleHero(data, rows));
};

// All rows here belong to a single hero
const buildStatsForSingleHero = (
	rowsForHero: readonly InternalBgsRow[],
	allRows: readonly InternalBgsRow[],
): BgsGlobalHeroStat => {
	// const startTime = new Date().getTime();
	const offeredRows = allRows.filter((r) => r.heroesOptionsExpanded.includes(rowsForHero[0].heroCardId));
	const totalOffered = offeredRows.length;
	const totalPicked = offeredRows.filter((r) => r.heroCardId === rowsForHero[0].heroCardId).length;
	const ref = rowsForHero[0];
	const averagePosition = average(rowsForHero.map((r) => r.playerRank));
	// const placementStartTime = new Date().getTime();
	const placementDistribution = buildPlacementDistribution(rowsForHero);
	// const placementProcessTime = new Date().getTime() - placementStartTime;
	// const winrateStartTime = new Date().getTime();
	const rawCombatWinrates = buildCombatWinrate(rowsForHero);
	// const winrateProcessTime = new Date().getTime() - winrateStartTime;
	// const combatWinrate: readonly { turn: number; winrate: number }[] = rawCombatWinrates.map((info) => ({
	// 	turn: info.turn,
	// 	winrate: round(info.totalWinrate / info.dataPoints),
	// }));
	const rawWarbandStats = buildWarbandStats(rowsForHero);
	// const warbandStats: readonly { turn: number; averageStats: number }[] = rawWarbandStats.map((info) => ({
	// 	turn: info.turn,
	// 	averageStats: round(info.totalStats / info.dataPoints),
	// }));

	const allRanks = rowsForHero.map((r) => r.playerRank);
	const allDeviations = allRanks.map((r) => averagePosition - r);
	const squareDeviations = allDeviations.map((d) => Math.pow(d, 2));
	const sumOfSquares = squareDeviations.reduce((a, b) => a + b, 0);
	const variance = sumOfSquares / rowsForHero.length;
	const standardDeviation = Math.sqrt(variance);
	const standardDeviationOfTheMean = standardDeviation / Math.sqrt(rowsForHero.length);
	// const tribeStartTime = new Date().getTime();
	const tribeStats = buildTribeStats(rowsForHero, offeredRows, averagePosition);
	const result: BgsGlobalHeroStat = {
		heroCardId: ref.heroCardId,
		dataPoints: rowsForHero.length,
		totalOffered: totalOffered,
		totalPicked: totalPicked,
		averagePosition: round(averagePosition),
		standardDeviation: round(standardDeviation),
		standardDeviationOfTheMean: round(standardDeviationOfTheMean),
		conservativePositionEstimate: round(averagePosition + 3 * standardDeviationOfTheMean),
		placementDistributionRaw: placementDistribution,
		combatWinrateRaw: rawCombatWinrates,
		warbandStatsRaw: rawWarbandStats,
		tribeStats: tribeStats,
	};
	// const processTime = new Date().getTime() - startTime;
	// console.log('\tbuilt for hero', result.heroCardId, result.dataPoints, result);
	return result;
};

const buildTribeStats = (
	rowsForHero: readonly InternalBgsRow[],
	offeredRows: readonly InternalBgsRow[],
	refAveragePosition: number,
): readonly BgsHeroTribeStat[] => {
	const uniqueTribes: readonly Race[] = [...new Set(rowsForHero.flatMap((r) => r.tribesExpanded))];
	return uniqueTribes.map((tribe) => {
		const rowsForTribe = rowsForHero.filter((r) => r.tribesExpanded.includes(tribe));
		const offeredRowsForTribe = offeredRows.filter((r) => r.tribesExpanded.includes(tribe));
		const totalOffered = offeredRowsForTribe.length;
		const totalPicked = offeredRowsForTribe.filter((r) => r.heroCardId === rowsForHero[0].heroCardId).length;
		const rowsWithoutTribe = rowsForHero.filter((r) => !r.tribesExpanded.includes(tribe));
		const averagePosition = average(rowsForTribe.map((r) => r.playerRank));
		const averagePositionWithoutTribe = average(rowsWithoutTribe.map((r) => r.playerRank));
		const result: BgsHeroTribeStat = {
			tribe: tribe,
			dataPoints: rowsForTribe.length,
			dataPointsOnMissingTribe: rowsWithoutTribe.length,
			totalOffered: totalOffered,
			totalPicked: totalPicked,
			averagePosition: averagePosition,
			averagePositionWithoutTribe: averagePositionWithoutTribe,
			impactAveragePosition: averagePosition - refAveragePosition,
			impactAveragePositionVsMissingTribe: averagePosition - averagePositionWithoutTribe,
		};
		return result;
	});
};

const average = (data: readonly number[]): number => {
	return data.reduce((a, b) => a + b, 0) / data.length;
};
