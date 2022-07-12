import { groupByFunction, logger } from '@firestone-hs/aws-lambda-utils';
import { Race } from '@firestone-hs/reference-data';
import { BgsGlobalHeroStat2, MmrPercentile } from '../bgs-global-stats';
import { DataForTribes, HeroStat, InternalBgsGlobalStats, Slice } from '../internal-model';
import { formatDate } from '../utils/util-functions';

// export const buildFinalStats = (
// 	slices: readonly Slice[],
// 	mmrPercentiles: readonly MmrPercentile[],
// 	allTribes: readonly Race[],
// 	timePeriod: 'all-time' | 'past-three' | 'past-seven' | 'last-patch',
// ): FinalBgsDataForTimePeriod => {
// 	const tribePermutations = [null, ...combine(allTribes, 5)];
// 	const statsForTribes: readonly InternalBgsGlobalStats[] = tribePermutations
// 		.map(permutation => buildStatsForTribes(slices, permutation, mmrPercentiles, timePeriod))
// 		.map(stats => ({
// 			...stats,
// 			allTribes: allTribes,
// 		}));
// 	return {
// 		statsForTribes: statsForTribes,
// 	};
// };

export const buildStatsForTribes = (
	slices: readonly Slice[],
	tribes: readonly Race[],
	mmrPercentiles: readonly MmrPercentile[],
	timePeriod: 'all-time' | 'past-three' | 'past-seven' | 'last-patch',
): InternalBgsGlobalStats => {
	const relevantDataForTribes = slices
		.flatMap(slice => slice.dataForTribes)
		.filter(dataForTribes => dataForTribes.tribes?.join('-') == tribes?.join('-'));

	const heroStats: readonly BgsGlobalHeroStat2[] = mmrPercentiles
		.flatMap(mmr => buildStatsForMmr(relevantDataForTribes, mmr))
		.map(stat => ({
			...stat,
			date: timePeriod,
			tribes: tribes,
		}));
	return {
		lastUpdateDate: formatDate(new Date()),
		allTribes: null, // Populated outside of the loop
		tribes: tribes,
		timePeriod: timePeriod,
		mmrPercentiles: mmrPercentiles,
		heroStats: heroStats,
		dataPoints: heroStats.map(stat => stat.totalMatches).reduce((a, b) => a + b, 0),
	};
};

const buildStatsForMmr = (
	dataForTribes: readonly DataForTribes[],
	mmr: MmrPercentile,
): readonly BgsGlobalHeroStat2[] => {
	const dataForRank = dataForTribes.flatMap(data => data.dataForRank).filter(data => data.mmrCeiling >= mmr.mmr);
	const heroStats = dataForRank.flatMap(data => data.heroStats);
	const groupedByHero = groupByFunction((stat: HeroStat) => stat.heroCardId)(heroStats);
	return Object.keys(groupedByHero).map(heroCardId => {
		const relevantStats = groupedByHero[heroCardId];
		return {
			cardId: heroCardId,
			totalMatches: relevantStats.map(stat => stat.dataPoints).reduce((a, b) => a + b, 0),
			mmrPercentile: mmr.percentile,
			placementDistribution: mergePlacement(relevantStats.flatMap(stat => stat.placementDistribution)),
			combatWinrate: mergeCombatWinrates(relevantStats.flatMap(stat => stat.combatWinrate)),
			warbandStats: mergeWarbandStats(relevantStats.flatMap(stat => stat.warbandStats)),
			// Set outside the loop
			date: null,
			tribes: null,
		};
	});
};

const mergeWarbandStats = (
	warbandStats: { turn: number; dataPoints: number; totalStats: number }[],
): { turn: number; dataPoints: number; totalStats: number }[] => {
	let result: { turn: number; dataPoints: number; totalStats: number }[] = [];
	for (const winrate of warbandStats) {
		const existing = result.find(p => p.turn === winrate.turn) ?? {
			turn: winrate.turn,
			dataPoints: 0,
			totalStats: 0,
		};
		result = result.filter(p => p.turn !== winrate.turn);
		result.push({
			turn: winrate.turn,
			dataPoints: existing.dataPoints + winrate.dataPoints,
			totalStats: existing.totalStats + winrate.totalStats,
		});
	}
	return result.sort((a, b) => a.turn - b.turn);
};

const mergeCombatWinrates = (
	combatWinrates: { turn: number; dataPoints: number; totalWinrate: number }[],
): { turn: number; dataPoints: number; totalWinrate: number }[] => {
	let result: { turn: number; dataPoints: number; totalWinrate: number }[] = [];
	for (const winrate of combatWinrates) {
		const existing = result.find(p => p.turn === winrate.turn) ?? {
			turn: winrate.turn,
			dataPoints: 0,
			totalWinrate: 0,
		};
		result = result.filter(p => p.turn !== winrate.turn);
		result.push({
			turn: winrate.turn,
			dataPoints: existing.dataPoints + winrate.dataPoints,
			totalWinrate: existing.totalWinrate + winrate.totalWinrate,
		});
	}
	return result.sort((a, b) => a.turn - b.turn);
};

const mergePlacement = (
	placements: {
		rank: number;
		totalMatches: number;
	}[],
): { rank: number; totalMatches: number }[] => {
	let result: { rank: number; totalMatches: number }[] = [];
	for (const placement of placements) {
		const existing = result.find(p => p.rank === placement.rank) ?? {
			rank: placement.rank,
			totalMatches: 0,
		};
		result = result.filter(p => p.rank !== placement.rank);
		result.push({
			rank: placement.rank,
			totalMatches: existing.totalMatches + placement.totalMatches,
		});
	}
	return result.sort((a, b) => a.rank - b.rank);
};
