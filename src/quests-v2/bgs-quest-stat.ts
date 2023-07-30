import { Race } from '@firestone-hs/reference-data';
import { MmrPercentile } from '../bgs-global-stats';
import { WithMmrAndTimePeriod } from './charged-stat';

export interface BgsQuestStats {
	readonly lastUpdateDate: Date;
	readonly mmrPercentiles: readonly MmrPercentile[];
	readonly dataPoints: number;
	readonly questStats: readonly WithMmrAndTimePeriod<BgsGlobalQuestStat>[];
	readonly rewardStats: readonly WithMmrAndTimePeriod<BgsGlobalRewardStat>[];
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

export interface BgsGlobalRewardStat {
	readonly rewardCardId: string;
	readonly dataPoints: number;
	readonly averagePlacement: number;
	readonly heroStats: readonly BgsRewardHeroStat[];
	readonly tribeStats: readonly BgsRewardTribeStat[];
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

export interface BgsRewardHeroStat {
	readonly heroCardId: string;
	readonly dataPoints: number;
	readonly averagePlacement: number;
}

export interface BgsRewardTribeStat {
	readonly tribe: Race;
	readonly dataPoints: number;
	readonly averagePlacement: number;
	readonly impactPlacement: number;
}
