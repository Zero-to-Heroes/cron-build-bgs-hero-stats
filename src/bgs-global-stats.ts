import { Race } from '@firestone-hs/reference-data';
import { MmrPercentile } from './models';

export class BgsGlobalStats2 {
	readonly lastUpdateDate: string;
	readonly mmrPercentiles: readonly MmrPercentile[];
	readonly heroStats: readonly BgsGlobalHeroStat2[];
	readonly allTribes: readonly Race[];
	readonly totalMatches: number;
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

export * from './quests-v2/bgs-quest-stat';
export * from './stats-v2/bgs-hero-stat';
