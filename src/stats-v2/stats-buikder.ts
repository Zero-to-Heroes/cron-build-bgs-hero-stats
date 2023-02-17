import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService, Race } from '@firestone-hs/reference-data';
import { buildCombatWinrate, buildWarbandStats } from '../build-battlegrounds-hero-stats-new';
import { buildPlacementDistributionWithPercentages } from '../common';
import { InternalBgsRow } from '../internal-model';
import { normalizeHeroCardId } from '../utils/util-functions';
import { BgsGlobalHeroStat, BgsHeroTribeStat } from './bgs-hero-stat';

export const buildStats = (
	rows: readonly InternalBgsRow[],
	allCards: AllCardsService,
): readonly BgsGlobalHeroStat[] => {
	const groupedByHero: {
		[questCardId: string]: readonly InternalBgsRow[];
	} = groupByFunction((row: InternalBgsRow) => normalizeHeroCardId(row.heroCardId, allCards))(rows);
	return Object.values(groupedByHero).flatMap(data => buildStatsForSingleHero(data));
};

// All rows here belong to a single hero
const buildStatsForSingleHero = (rows: readonly InternalBgsRow[]): BgsGlobalHeroStat => {
	const ref = rows[0];
	const averagePosition = average(rows.map(r => r.rank));
	const placementDistribution = buildPlacementDistributionWithPercentages(rows);
	const rawCombatWinrates = buildCombatWinrate(rows);
	const combatWinrate: readonly { turn: number; winrate: number }[] = rawCombatWinrates.map(info => ({
		turn: info.turn,
		winrate: info.totalWinrate / info.dataPoints,
	}));
	const rawWarbandStats = buildWarbandStats(rows);
	const warbandStats: readonly { turn: number; averageStats: number }[] = rawWarbandStats.map(info => ({
		turn: info.turn,
		averageStats: info.totalStats / info.dataPoints,
	}));
	const result: BgsGlobalHeroStat = {
		heroCardId: ref.heroCardId,
		dataPoints: rows.length,
		averagePosition: averagePosition,
		placementDistribution: placementDistribution,
		combatWinrate: combatWinrate,
		warbandStats: warbandStats,
		tribeStats: buildTribeStats(rows, averagePosition, placementDistribution, combatWinrate, warbandStats),
	};
	return result;
};

const buildTribeStats = (
	rows: readonly InternalBgsRow[],
	refAveragePosition: number,
	refPlacementDistribution: readonly { rank: number; percentage: number }[],
	refCombatWinrate: readonly { turn: number; winrate: number }[],
	refWarbandStats: readonly { turn: number; averageStats: number }[],
): readonly BgsHeroTribeStat[] => {
	const uniqueTribes: readonly Race[] = [...new Set(rows.flatMap(r => r.tribes.split(',')).map(r => parseInt(r)))];
	return uniqueTribes.map(tribe => {
		const rowsForTribe = rows.filter(r => r.tribes.split(',').includes('' + tribe));
		const rowsWithoutTribe = rows.filter(r => !r.tribes.split(',').includes('' + tribe));
		const averagePosition = average(rowsForTribe.map(r => r.rank));
		const placementDistribution = buildPlacementDistributionWithPercentages(rowsForTribe);
		const rawCombatWinrates = buildCombatWinrate(rowsForTribe);
		const combatWinrate = rawCombatWinrates.map(info => ({
			turn: info.turn,
			winrate: info.totalWinrate / info.dataPoints,
		}));
		const rawWarbandStats = buildWarbandStats(rowsForTribe);
		const warbandStats: readonly { turn: number; averageStats: number }[] = rawWarbandStats.map(info => ({
			turn: info.turn,
			averageStats: info.totalStats / info.dataPoints,
		}));
		return {
			tribe: tribe,
			dataPoints: rowsForTribe.length,
			dataPointsOnMissingTribe: rowsWithoutTribe.length,
			averagePosition: averagePosition,
			impactAveragePosition: averagePosition - refAveragePosition,
			placementDistribution: placementDistribution,
			impactPlacementDistribution: refPlacementDistribution.map(p => {
				const newPlacementInfo = placementDistribution.find(p2 => p2.rank === p.rank);
				// Cna happen when there isn't a lot of data points, typically for high MMR
				if (!newPlacementInfo) {
					// console.log('missing placement info', placementDistribution, p);
				}
				return {
					rank: p.rank,
					impact: (newPlacementInfo?.percentage ?? 0) - p.percentage,
				};
			}),
			combatWinrate: combatWinrate,
			impactCombatWinrate: refCombatWinrate.map(c => {
				const newCombatWinrate = combatWinrate.find(c2 => c2.turn === c.turn);
				if (!newCombatWinrate) {
					// console.debug('missing winrate info', combatWinrate);
				}
				return {
					turn: c.turn,
					impact: (newCombatWinrate?.winrate ?? 0) - c.winrate,
				};
			}),
			warbandStats: warbandStats,
			impactWarbandStats: refWarbandStats.map(c => {
				const newWarbandStats = warbandStats.find(c2 => c2.turn === c.turn);
				if (!newWarbandStats) {
					// console.debug('missing warband info', warbandStats);
				}
				return {
					turn: c.turn,
					impact: (newWarbandStats?.averageStats ?? 0) - c.averageStats,
				};
			}),
		};
	});
};

const average = (data: readonly number[]): number => {
	return data.reduce((a, b) => a + b, 0) / data.length;
};
