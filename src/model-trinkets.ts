import { MmrPercentile, WithMmrAndTimePeriod } from './models';

export interface BgsTrinketStats {
	readonly lastUpdateDate: Date;
	readonly mmrPercentiles: readonly MmrPercentile[];
	readonly dataPoints: number;
	readonly trinketStats: readonly WithMmrAndTimePeriod<BgsGlobalTrinketStat>[];
}

export interface BgsGlobalTrinketStat {
	readonly trinketCardId: string;
	readonly dataPoints: number;
	readonly averagePlacement: number;
	readonly heroStats: readonly BgsTrinketHeroStat[];
}

export interface BgsTrinketHeroStat {
	readonly heroCardId: string;
	readonly dataPoints: number;
	readonly averagePlacement: number;
}
