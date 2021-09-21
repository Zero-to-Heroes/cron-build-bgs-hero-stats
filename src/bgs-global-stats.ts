import { Race } from '@firestone-hs/reference-data';

export class BgsGlobalStats {
	lastUpdateDate: string;
	heroStats: readonly BgsGlobalHeroStat[];
}

export class BgsGlobalHeroStat {
	id: string;
	popularity: number;
	averagePosition: number;
	top4: number;
	top1: number;
	tier: BgsHeroTier;
	totalGames: number;
	tribesStat: readonly { tribe: string; percent: number }[];
	warbandStats: readonly { turn: number; totalStats: number }[];
	combatWinrate: readonly { turn: number; winrate: number }[];
}

export type BgsHeroTier = 'S' | 'A' | 'B' | 'C' | 'D';

// ===============================
// New stats
// =================================
export class BgsGlobalStats2 {
	readonly lastUpdateDate: string;
	readonly mmrPercentiles: readonly MmrPercentile[];
	readonly heroStats: readonly BgsGlobalHeroStat2[];
	readonly allTribes: readonly Race[];
}

export class BgsGlobalHeroStat2 {
	// The filters
	readonly date: 'all-time' | 'past-three' | 'past-seven' | 'last-patch';
	readonly mmrPercentile: 100 | 50 | 25 | 10 | 1;
	readonly cardId: string;
	readonly tribes: readonly Race[];

	// The values
	readonly totalMatches: number;
	readonly placementDistribution: readonly { rank: number; totalMatches: number }[];
	// To get the actual winrate, you will have to divide the totalWinrate by the dataPoints
	readonly combatWinrate: readonly { turn: number; dataPoints: number; totalWinrate: number }[];
	// Same
	readonly warbandStats: readonly { turn: number; dataPoints: number; totalStats: number }[];
}

export interface MmrPercentile {
	readonly mmr: number;
	readonly percentile: 100 | 50 | 25 | 10 | 1;
}
