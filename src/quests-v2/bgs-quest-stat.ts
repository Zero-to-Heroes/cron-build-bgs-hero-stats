import { Race } from '@firestone-hs/reference-data';
import { MmrPercentile } from '../bgs-global-stats';
import { ChargedStat } from './charged-stat';

export interface BgsQuestStats {
	lastUpdateDate: Date;
	mmrPercentiles: readonly MmrPercentile[];
	dataPoints: number;
	stats: readonly ChargedStat<BgsQuestStat>[];
}

export interface BgsQuestStat {
	readonly questCardId: string;
	readonly heroCardId?: string | null;

	readonly dataPoints: number;
	readonly averageDifficulty: number;
	readonly difficultyCurve: DataCurve;
	readonly completionRate: number;
	readonly averageTurnsToComplete: number;
	readonly turnsToCompleteCurve: DataCurve;
	readonly averagePlacement: number;
	readonly placementCurve: DataCurve;
	readonly averagePlacementOnceCompleted: number;
	readonly placementCurveOnceCompleted: DataCurve;
	readonly tribeInfos: readonly BgsQuestTribeInfo[];
	readonly difficultyInfos: readonly BgsQuestDifficultyInfo[];
}

export interface BgsQuestTribeInfo {
	readonly tribe: Race;
	readonly dataPoints: number;
	readonly averageTurnsToCompleteForRace: number;
	readonly averagePlacementForRace: number;
	readonly averagePlacementOnceCompletedForRace: number;
	readonly raceImpactTurnsToComplete: number;
	readonly raceImpactPlacement: number;
	readonly raceImpactPlacementOnceCompleted: number;
}

export interface BgsQuestDifficultyInfo {
	readonly difficulty: number;
	readonly dataPoints: number;
	readonly averageTurnsToCompleteForDifficulty: number;
	readonly averagePlacementForDifficulty: number;
	readonly averagePlacementOnceCompletedForDifficulty: number;
	readonly difficultyImpactTurnsToComplete: number;
	readonly difficultyImpactPlacement: number;
	readonly difficultyImpactPlacementOnceCompleted: number;
}

export type DataCurve = readonly {
	data: number;
	totalMatches: number;
}[];
