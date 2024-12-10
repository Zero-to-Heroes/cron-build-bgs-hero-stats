import { Race } from '@firestone-hs/reference-data';

// bgs_run_stats and bgs_run_stats_duo
export interface InternalBgsRow {
	readonly id: number;
	readonly reviewId: string;
	readonly creationDate: Date;
	readonly buildNumber: number;
	readonly rating: number;
	// Normalized once it goes out of the "rows.ts" process
	readonly heroCardId: string;
	readonly playerRank: number;
	/** @deprecated */
	readonly tribes: string;
	readonly tribesExpanded: readonly Race[];
	/** @deprecated */
	readonly combatWinrate: string;
	// readonly combatWinrateExpanded: readonly { turn: number; winrate: number }[];
	/** @deprecated */
	readonly warbandStats: string;
	// readonly warbandStatsExpanded: readonly { turn: number; totalStats: number }[];
	readonly darkmoonPrizes: boolean;
	readonly quests: boolean;
	readonly bgsHeroQuests: string;
	readonly bgsQuestsCompletedTimings: string;
	readonly bgsQuestsDifficulties: string;
	readonly bgsHeroQuestRewards: string;
	readonly bgsAnomalies: string;
	readonly bgsTrinkets: string;
	readonly bgsTrinketsOptions: string;
	/** @deprecated */
	readonly heroesOptions: string;
	readonly heroesOptionsExpanded: readonly string[];
	readonly playedCards: string;
	readonly playedCardsExpanded: readonly { cardId: string; turn: number }[];
}

import { MmrPercentile, WithMmrAndTimePeriod } from './models';

export interface InternalBgsTrinketStats {
	readonly lastUpdateDate: Date;
	readonly mmrPercentiles: readonly MmrPercentile[];
	readonly dataPoints: number;
	readonly trinketStats: readonly WithMmrAndTimePeriod<InternalBgsGlobalTrinketStat>[];
}

export interface InternalBgsCardStats {
	readonly lastUpdateDate: Date;
	readonly mmrPercentiles: readonly MmrPercentile[];
	readonly dataPoints: number;
	readonly cardStats: readonly WithMmrAndTimePeriod<InternalBgsCardStat>[];
}

export interface InternalBgsCardStat {
	readonly cardId: string;
	readonly totalPlayed: number;
	readonly averagePlacement: number;
	readonly totalOther: number;
	readonly averagePlacementOther: number;
	readonly turnStats: readonly InternalBgsCardTurnStat[];
	readonly heroStats: readonly InternalBgsCardHeroStat[];
}

export interface InternalBgsCardHeroStat {
	readonly heroCardId: string;
	readonly totalPlayedWithHero: number;
	readonly averagePlacement: number;
	readonly turnStats: readonly InternalBgsCardTurnStat[];
}

export interface InternalBgsCardTurnStat {
	readonly turn: number;
	readonly totalPlayedAtTurn: number;
	readonly averagePlacement: number;
	readonly totalPlayedAtTurnOther: number;
	readonly averagePlacementOther: number;
}

export interface InternalBgsGlobalTrinketStat {
	readonly trinketCardId: string;
	readonly dataPoints: number;
	readonly totalOffered: number;
	readonly averagePlacement: number;
	readonly heroStats: readonly InternalBgsTrinketHeroStat[];
}

export interface InternalBgsTrinketHeroStat {
	readonly heroCardId: string;
	readonly dataPoints: number;
	readonly averagePlacement: number;
}
