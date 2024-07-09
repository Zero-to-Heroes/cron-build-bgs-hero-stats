import { Race } from '@firestone-hs/reference-data';

export interface InternalBgsRow {
	readonly id: number;
	readonly reviewId: string;
	readonly creationDate: Date;
	readonly buildNumber: number;
	readonly rating: number;
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
}
