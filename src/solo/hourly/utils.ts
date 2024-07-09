import { PatchInfo, groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { InternalBgsRow } from '../../internal-model';
import { MmrPercentile } from '../../public-api';

export const filterRowsForTimePeriod = (
	rows: readonly InternalBgsRow[],
	timePeriod: 'all-time' | 'past-three' | 'past-seven' | 'last-patch',
	lastPatch: PatchInfo,
): readonly InternalBgsRow[] => {
	switch (timePeriod) {
		case 'last-patch':
			return rows.filter(
				(row) => row.buildNumber >= lastPatch.number || new Date(row.creationDate) > new Date(lastPatch.date),
			);
		case 'past-three':
			return rows.filter(
				(row) => new Date(row.creationDate) > new Date(new Date().getTime() - 3 * 24 * 60 * 60 * 1000),
			);
		case 'past-seven':
			return rows.filter(
				(row) => new Date(row.creationDate) > new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000),
			);
		case 'all-time':
		default:
			return rows;
	}
};

export const buildMmrPercentiles = (rows: readonly InternalBgsRow[]): readonly MmrPercentile[] => {
	const sortedMmrs = rows.map((row) => row.rating).sort((a, b) => a - b);
	const median = sortedMmrs[Math.floor(sortedMmrs.length / 2)];
	const top25 = sortedMmrs[Math.floor((sortedMmrs.length / 4) * 3)];
	const top10 = sortedMmrs[Math.floor((sortedMmrs.length / 10) * 9)];
	const top1 = sortedMmrs[Math.floor((sortedMmrs.length / 100) * 99)];
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
		{
			percentile: 1,
			mmr: top1,
		},
	];
};

export const buildPlacementDistribution = (
	rows: readonly InternalBgsRow[],
): readonly { rank: number; totalMatches: number }[] => {
	const placementDistribution: { rank: number; totalMatches: number }[] = [];
	const groupedByPlacement: { [placement: string]: readonly InternalBgsRow[] } = groupByFunction(
		(res: InternalBgsRow) => '' + res.playerRank,
	)(rows);
	Object.keys(groupedByPlacement).forEach((placement) =>
		placementDistribution.push({ rank: +placement, totalMatches: groupedByPlacement[placement].length }),
	);
	return placementDistribution;
};
