import { BgsHeroStatsV2, MmrPercentile } from '../models';

export const buildMmrPercentiles = (hourlyData: readonly BgsHeroStatsV2[]): readonly MmrPercentile[] => {
	// For now we simply pick the latest MMR percentiles, as it reflects the most accurately the current
	// state of the game
	return [...hourlyData].sort(
		(a, b) => new Date(b.lastUpdateDate).getTime() - new Date(a.lastUpdateDate).getTime(),
	)[0].mmrPercentiles;
};
