import { Race } from '@firestone-hs/reference-data';
import { MmrPercentile } from '../bgs-global-stats';
import { WithMmrAndTimePeriod } from './charged-stat';

export interface BgsQuestStats {
	readonly lastUpdateDate: Date;
	readonly mmrPercentiles: readonly MmrPercentile[];
	readonly dataPoints: number;
	readonly questStats: readonly WithMmrAndTimePeriod<BgsGlobalQuestStat>[];
}

export interface BgsGlobalQuestStat {
	readonly questCardId: string;
	readonly dataPoints: number;
	readonly averageTurnToComplete: number;
	readonly completionRate: number;
	readonly difficultyStats: readonly BgsQuestDifficultyStat[];
	readonly heroStats: readonly BgsQuestHeroStat[];
	readonly tribeStats: readonly BgsQuestTribeStat[];
}

export interface BgsQuestDifficultyStat {
	readonly difficulty: number;
	readonly dataPoints: number;
	readonly averageTurnToComplete: number;
	readonly completionRate: number;
	readonly impactTurnToComplete: number;
	readonly impactCompletionRate: number;
}

export interface BgsQuestHeroStat {
	readonly heroCardId: string;
	readonly dataPoints: number;
	readonly averageTurnToComplete: number;
	readonly completionRate: number;
}

export interface BgsQuestTribeStat {
	readonly tribe: Race;
	readonly dataPoints: number;
	readonly averageTurnToComplete: number;
	readonly completionRate: number;
	readonly impactTurnToComplete: number;
	readonly impactCompletionRate: number;
}

// export interface BgsQuestStat {
// 	readonly questCardId: string;
// 	readonly heroCardId?: string | null;

// 	readonly dataPoints: number;
// 	readonly averageDifficulty: number;
// 	readonly difficultyCurve: DataCurve;
// 	readonly completionRate: number;
// 	readonly averageTurnsToComplete: number;
// 	readonly turnsToCompleteCurve: DataCurve;
// 	readonly averagePlacement: number;
// 	readonly placementCurve: DataCurve;
// 	readonly averagePlacementOnceCompleted: number;
// 	readonly placementCurveOnceCompleted: DataCurve;
// 	readonly tribeInfos: readonly BgsQuestTribeInfo[];
// 	readonly difficultyInfos: readonly BgsQuestDifficultyInfo[];
// }

// export interface BgsQuestTribeInfo {
// 	readonly tribe: Race;
// 	readonly dataPoints: number;
// 	readonly averageTurnsToCompleteForRace: number;
// 	readonly averagePlacementForRace: number;
// 	readonly averagePlacementOnceCompletedForRace: number;
// 	readonly raceImpactTurnsToComplete: number;
// 	readonly raceImpactPlacement: number;
// 	readonly raceImpactPlacementOnceCompleted: number;
// }

// export interface BgsQuestDifficultyInfo {
// 	readonly difficulty: number;
// 	readonly dataPoints: number;
// 	readonly averageTurnsToCompleteForDifficulty: number;
// 	readonly averagePlacementForDifficulty: number;
// 	readonly averagePlacementOnceCompletedForDifficulty: number;
// 	readonly difficultyImpactTurnsToComplete: number;
// 	readonly difficultyImpactPlacement: number;
// 	readonly difficultyImpactPlacementOnceCompleted: number;
// }

// export type DataCurve = readonly {
// 	data: number;
// 	totalMatches: number;
// }[];
