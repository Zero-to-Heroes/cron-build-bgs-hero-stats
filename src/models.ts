import { Race } from '@firestone-hs/reference-data';

export interface BgsHeroStatsV2 {
	readonly lastUpdateDate: Date;
	readonly mmrPercentiles: readonly MmrPercentile[];
	readonly dataPoints: number;
	readonly heroStats: readonly WithMmrAndTimePeriod<BgsGlobalHeroStat>[];
}

export interface BgsGlobalHeroStat {
	readonly heroCardId: string;
	readonly dataPoints: number;
	readonly totalOffered: number;
	readonly totalPicked: number;
	readonly averagePosition: number;
	readonly standardDeviation: number;
	readonly standardDeviationOfTheMean: number;
	readonly conservativePositionEstimate: number;
	readonly placementDistribution?: readonly { rank: number; percentage: number }[];
	readonly placementDistributionRaw?: readonly { rank: number; totalMatches: number }[];
	readonly combatWinrate?: readonly { turn: number; winrate: number }[];
	readonly combatWinrateRaw?: readonly { turn: number; dataPoints: number; totalWinrate: number }[];
	readonly warbandStats?: readonly { turn: number; averageStats: number }[];
	readonly warbandStatsRaw?: readonly { turn: number; dataPoints: number; totalStats: number }[];
	readonly tribeStats: readonly BgsHeroTribeStat[];
	readonly anomalyStats: readonly BgsHeroAnomalyStat[];
}

export interface BgsHeroTribeStat {
	readonly tribe: Race;
	readonly dataPoints: number;
	readonly dataPointsOnMissingTribe: number;
	readonly totalOffered: number;
	readonly totalPicked: number;
	readonly averagePosition: number;
	readonly averagePositionWithoutTribe: number;
	// Impacts are only meant to be used in the final output
	readonly impactAveragePosition: number;
	readonly impactAveragePositionVsMissingTribe: number;
	// readonly placementDistribution: readonly { rank: number; percentage: number }[];
	// readonly impactPlacementDistribution: readonly { rank: number; impact: number }[];
	// readonly combatWinrate: readonly { turn: number; winrate: number }[];
	// readonly impactCombatWinrate: readonly { turn: number; impact: number }[];
	// readonly warbandStats: readonly { turn: number; averageStats: number }[];
	// readonly impactWarbandStats: readonly { turn: number; impact: number }[];
}

export interface BgsHeroAnomalyStat {
	readonly anomaly: string;
	readonly dataPoints: number;
	readonly averagePosition: number;
	readonly impactAveragePosition: number;
	readonly placementDistribution: readonly { rank: number; percentage: number }[];
	readonly placementDistributionRaw: readonly { rank: number; totalMatches: number }[];
	readonly impactPlacementDistribution: readonly { rank: number; impact: number }[];
	readonly combatWinrate: readonly { turn: number; winrate: number }[];
	readonly impactCombatWinrate: readonly { turn: number; impact: number }[];
	readonly warbandStats: readonly { turn: number; averageStats: number }[];
	readonly impactWarbandStats: readonly { turn: number; impact: number }[];
}

export type WithMmrAndTimePeriod<T> = T & {
	readonly mmrPercentile: MmrPercentileFilter;
	readonly timePeriod: TimePeriod;
};

export interface MmrPercentile {
	readonly mmr: number;
	readonly percentile: MmrPercentileFilter;
}

export type TimePeriod = 'all-time' | 'past-three' | 'past-seven' | 'last-patch';
export type MmrPercentileFilter = 100 | 50 | 25 | 10 | 1;
