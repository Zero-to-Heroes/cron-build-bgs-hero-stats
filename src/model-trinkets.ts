import { TimePeriod } from './models';

export interface BgsTrinketStats {
	readonly lastUpdateDate: Date;
	readonly dataPoints: number;
	readonly timePeriod: TimePeriod;
	readonly trinketStats: readonly BgsTrinketStat[];
}

export interface BgsTrinketStat {
	readonly trinketCardId: string;
	readonly dataPoints: number;
	readonly pickRate: number;
	readonly pickRateAtMmr: readonly {
		mmr: number;
		pickRate: number;
	}[];
	readonly averagePlacement: number;
	readonly averagePlacementAtMmr: readonly {
		mmr: number;
		placement: number;
	}[];
}
