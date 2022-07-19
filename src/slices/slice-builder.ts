import { groupByFunction, logger } from '@firestone-hs/aws-lambda-utils';
import { Race } from '@firestone-hs/reference-data';
import { DataForMmr, DataForTribes, HeroStat, InternalBgsRow, RankGroup, Slice } from '../internal-model';
import { combine, getMax } from '../utils/util-functions';

export const buildNewSlice = (
	rows: readonly InternalBgsRow[],
	ranks: readonly RankGroup[],
	tribes: readonly Race[],
): Slice => {
	const tribePermutations = [null, ...combine(tribes, 5)];
	const dataForTribes: readonly DataForTribes[] = tribePermutations.map(permutation =>
		buildDataForTribes(rows, permutation, ranks),
	);
	const groupedMmr = groupByFunction((row: InternalBgsRow) => 100 * Math.round(row.rating / 100))(
		rows.filter(row => row.rating != null),
	);
	logger.log('groupedMmr', Object.keys(groupedMmr), groupedMmr);
	return {
		lastUpdateDate: new Date(),
		dataPoints: rows.length,
		dataForTribes: dataForTribes,
		highestMmr: getMax(rows.map(row => row.rating)),
		mmrGroups: Object.keys(groupedMmr).map(mmrThreshold => ({
			mmrThreshold: +mmrThreshold,
			mmrRangeUp: 100,
			quantity: groupedMmr[mmrThreshold].length,
		})),
	};
};

const buildDataForTribes = (
	rows: readonly InternalBgsRow[],
	tribes: readonly Race[],
	ranks: readonly RankGroup[],
): DataForTribes => {
	const tribesStr = !!tribes?.length ? tribes.join(',') : null;
	const validRows = !!tribesStr ? rows.filter(row => !!row.tribes).filter(row => row.tribes === tribesStr) : rows;
	const dataForRank: readonly DataForMmr[] = ranks.map(rank => buildDataForMmr(validRows, rank));
	return {
		lastUpdateDate: new Date(),
		tribes: tribes,
		dataPoints: validRows.length,
		dataForRank: dataForRank,
	};
};

const buildDataForMmr = (rows: readonly InternalBgsRow[], rank: RankGroup): DataForMmr => {
	const validRows = rows.filter(
		row =>
			rank.mmrThreshold === 0 ||
			(!!row.rating && row.rating >= rank.mmrThreshold && row.rating < rank.mmrThreshold + rank.mmrRangeUp),
	);
	const heroStats: readonly HeroStat[] = buildHeroStats(validRows);
	return {
		lastUpdateDate: new Date(),
		mmrThreshold: rank.mmrThreshold,
		mmrCeiling: rank.mmrThreshold + rank.mmrRangeUp,
		dataPoints: validRows.length,
		heroStats: heroStats,
	};
};

const buildHeroStats = (rows: readonly InternalBgsRow[]): readonly HeroStat[] => {
	const grouped: { [groupingKey: string]: readonly InternalBgsRow[] } = groupByFunction(
		(row: InternalBgsRow) => `${row.heroCardId}-${row.darkmoonPrizes}`,
	)(rows);

	return Object.values(grouped).map(groupedRows => {
		const ref = groupedRows[0];

		const placementDistribution = buildPlacementDistribution(groupedRows);
		const combatWinrate = buildCombatWinrate(groupedRows);
		const warbandStats = buildWarbandStats(groupedRows);

		return {
			heroCardId: ref.heroCardId,
			dataPoints: groupedRows.length,
			placementDistribution: placementDistribution,
			combatWinrate: combatWinrate,
			warbandStats: warbandStats,
		} as HeroStat;
	});
};

const buildWarbandStats = (
	rows: readonly InternalBgsRow[],
): readonly { turn: number; dataPoints: number; totalStats: number }[] => {
	const data: { [turn: string]: { dataPoints: number; totalStats: number } } = {};
	const validRows = rows;
	for (const row of validRows) {
		if (!row.warbandStats?.length) {
			continue;
		}

		const parsed: readonly { turn: number; totalStats: number }[] = JSON.parse(row.warbandStats);
		if (!parsed?.length) {
			continue;
		}

		for (const turnInfo of parsed) {
			if (turnInfo.turn === 0 || turnInfo.totalStats == null || isNaN(turnInfo.totalStats)) {
				continue;
			}
			// To avoid polluting the stats with big Tarecgosa outliers
			if (turnInfo.totalStats > 20000) {
				continue;
			}
			const existingInfo = data['' + turnInfo.turn] ?? { dataPoints: 0, totalStats: 0 };
			existingInfo.dataPoints = existingInfo.dataPoints + 1;
			existingInfo.totalStats = existingInfo.totalStats + Math.round(turnInfo.totalStats);
			data['' + turnInfo.turn] = existingInfo;
		}
	}

	const result: { turn: number; dataPoints: number; totalStats: number }[] = Object.keys(data).map(turn => ({
		turn: +turn,
		dataPoints: data[turn].dataPoints,
		totalStats: data[turn].totalStats,
	}));
	return result;
};

const buildCombatWinrate = (
	rows: readonly InternalBgsRow[],
): readonly { turn: number; dataPoints: number; totalWinrate: number }[] => {
	const data: { [turn: string]: { dataPoints: number; totalWinrate: number } } = {};
	for (const row of rows) {
		// console.log('building combatWinrate', row);
		if (!row.combatWinrate?.length) {
			continue;
		}

		let parsed: readonly { turn: number; winrate: number }[] = null;
		try {
			parsed = JSON.parse(row.combatWinrate);
			// console.log('parsed', parsed);
			if (!parsed?.length) {
				continue;
			}
		} catch (e) {
			console.error('Could not parse combat winrate', row, e);
			continue;
		}

		for (const turnInfo of parsed) {
			if (turnInfo.turn === 0 || turnInfo.winrate == null) {
				continue;
			}
			const existingInfo = data['' + turnInfo.turn] ?? { dataPoints: 0, totalWinrate: 0 };
			existingInfo.dataPoints = existingInfo.dataPoints + 1;
			existingInfo.totalWinrate = existingInfo.totalWinrate + Math.round(turnInfo.winrate);
			data['' + turnInfo.turn] = existingInfo;
		}
	}

	const result: { turn: number; dataPoints: number; totalWinrate: number }[] = Object.keys(data).map(turn => ({
		turn: +turn,
		dataPoints: data[turn].dataPoints,
		totalWinrate: data[turn].totalWinrate,
	}));
	return result;
};

const buildPlacementDistribution = (
	rows: readonly InternalBgsRow[],
): readonly { rank: number; totalMatches: number }[] => {
	const placementDistribution: { rank: number; totalMatches: number }[] = [];
	const groupedByPlacement: { [placement: string]: readonly InternalBgsRow[] } = groupByFunction(
		(res: InternalBgsRow) => '' + res.rank,
	)(rows);
	Object.keys(groupedByPlacement).forEach(placement =>
		placementDistribution.push({ rank: +placement, totalMatches: groupedByPlacement[placement].length }),
	);
	return placementDistribution;
};
