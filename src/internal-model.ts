import { Race } from '@firestone-hs/reference-data';
import { BgsGlobalStats2 } from './bgs-global-stats';

export interface InternalBgsRow {
	readonly creationDate: Date;
	readonly buildNumber: number;
	readonly rating: number;
	readonly heroCardId: string;
	readonly rank: number;
	readonly tribes: string;
	readonly combatWinrate: string;
	readonly warbandStats: string;
	readonly darkmoonPrizes: boolean;
}

export interface Slice {
	readonly lastUpdateDate: Date;
	readonly dataPoints: number;
	readonly dataForTribes: readonly DataForTribes[];
	readonly allMmr: readonly number[];
}

export interface DataForTribes {
	readonly lastUpdateDate: Date;
	readonly tribes: readonly Race[];
	readonly dataPoints: number;
	readonly dataForRank: readonly DataForMmr[];
}

export interface DataForMmr {
	readonly lastUpdateDate: Date;
	// works in 500 MMR increments. All data in that group is for players between mmr and mmr + 500
	readonly mmrThreshold: number;
	readonly mmrCeiling: number;
	readonly dataPoints: number;
	readonly heroStats: readonly HeroStat[];
}

export interface HeroStat {
	readonly heroCardId: string;
	readonly dataPoints: number;
	readonly placementDistribution: readonly { rank: number; totalMatches: number }[];
	// To get the actual winrate, you will have to divide the totalWinrate by the dataPoints
	readonly combatWinrate: readonly { turn: number; dataPoints: number; totalWinrate: number }[];
	// Same
	readonly warbandStats: readonly { turn: number; dataPoints: number; totalStats: number }[];
}

export interface FinalBgsDataForTimePeriod {
	readonly statsForTribes: readonly InternalBgsGlobalStats[];
}

export interface InternalBgsGlobalStats extends BgsGlobalStats2 {
	readonly timePeriod: 'all-time' | 'past-three' | 'past-seven' | 'last-patch';
	readonly tribes: readonly Race[];
	readonly dataPoints: number;
}

export interface RankGroup {
	readonly mmrThreshold: number;
	readonly mmrRangeUp: number;
}
