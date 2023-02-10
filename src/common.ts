import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { MmrPercentile } from './bgs-global-stats';
import { InternalBgsRow } from './internal-model';

export const filterRowsForTimePeriod = (
	rows: readonly InternalBgsRow[],
	timePeriod: 'all-time' | 'past-three' | 'past-seven' | 'last-patch',
	lastPatch: PatchInfo,
): readonly InternalBgsRow[] => {
	switch (timePeriod) {
		case 'last-patch':
			return rows.filter(
				row =>
					row.buildNumber >= lastPatch.number ||
					new Date(row.creationDate) > new Date(new Date(lastPatch.date).getTime() + 24 * 60 * 60 * 1000),
			);
		case 'past-three':
			return rows.filter(
				row => new Date(row.creationDate) > new Date(new Date().getTime() - 3 * 24 * 60 * 60 * 1000),
			);
		case 'past-seven':
			return rows.filter(
				row => new Date(row.creationDate) > new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000),
			);
		case 'all-time':
		default:
			return rows;
	}
};

export const buildMmrPercentiles = (rows: readonly InternalBgsRow[]): readonly MmrPercentile[] => {
	const sortedMmrs = rows.map(row => row.rating).sort((a, b) => a - b);
	const median = sortedMmrs[Math.floor(sortedMmrs.length / 2)];
	const top25 = sortedMmrs[Math.floor((sortedMmrs.length / 4) * 3)];
	const top10 = sortedMmrs[Math.floor((sortedMmrs.length / 10) * 9)];
	// const top1 = sortedMmrs[Math.floor((sortedMmrs.length / 100) * 99)];
	// logger.debug('percentiles', median, top25, top10, top1);
	return [
		{
			percentile: 100,
			mmr: 0,
		},
		{
			percentile: 50,
			mmr: median,
		},
		{
			percentile: 25,
			mmr: top25,
		},
		{
			percentile: 10,
			mmr: top10,
		},
		// {
		// 	percentile: 1,
		// 	mmr: top1,
		// },
	];
};

export const buildPlacementDistribution = (
	rows: readonly InternalBgsRow[],
): readonly { rank: number; totalMatches: number }[] => {
	const placementDistribution: { rank: number; totalMatches: number }[] = [];
	const groupedByPlacement: { [placement: string]: readonly InternalBgsRow[] } = groupByFunction(
		(res: InternalBgsRow) => '' + res.rank,
	)(rows);
	Object.keys(groupedByPlacement).forEach(placement =>
		placementDistribution.push({ rank: +placement, totalMatches: groupedByPlacement[placement].length }),
	);
	return placementDistribution;
};

export const buildPlacementDistributionWithPercentages = (
	rows: readonly InternalBgsRow[],
): readonly { rank: number; percentage: number }[] => {
	const placementDistribution = buildPlacementDistribution(rows);
	const totalMatches = placementDistribution.map(p => p.totalMatches).reduce((a, b) => a + b, 0);
	const result: readonly { rank: number; percentage: number }[] = placementDistribution.map(p => ({
		rank: p.rank,
		percentage: (100 * p.totalMatches) / totalMatches,
	}));
	return result;
};

export interface PatchInfo {
	readonly number: number;
	readonly version: string;
	readonly name: string;
	readonly date: string;
}
