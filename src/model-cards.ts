import { TimePeriod } from './models';

export interface BgsCardStats {
	readonly lastUpdateDate: Date;
	readonly dataPoints: number;
	readonly timePeriod: TimePeriod;
	readonly cardStats: readonly BgsCardStat[];
}

export interface BgsCardStat {
	readonly cardId: string;
	readonly totalPlayed: number;
	readonly averagePlacement: number;
	readonly averagePlacementAtMmr: readonly {
		mmr: number;
		placement: number;
	}[];
	readonly turnStats: readonly BgsCardTurnStat[];
	readonly heroStats: readonly BgsCardHeroStat[];
}

export interface BgsCardHeroStat {
	readonly heroCardId: string;
	readonly totalPlayedWithHero: number;
	readonly averagePlacement: number;
	readonly averagePlacementAtMmr: readonly {
		mmr: number;
		placement: number;
	}[];
	readonly turnStats: readonly BgsCardTurnStat[];
}

export interface BgsCardTurnStat {
	readonly turn: number;
	readonly totalPlayedAtTurn: number;
	readonly averagePlacement: number;
	readonly averagePlacementAtMmr: readonly {
		mmr: number;
		placement: number;
	}[];
}
