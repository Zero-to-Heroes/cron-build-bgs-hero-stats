import { MmrPercentile } from '../bgs-global-stats';
import { buildMmrPercentiles, filterRowsForTimePeriod, PatchInfo } from '../common';
import { InternalBgsRow } from '../internal-model';
import { WithMmrAndTimePeriod } from './charged-stat';

export const buildSplitStats = async <T>(
	rows: readonly InternalBgsRow[],
	timePeriod: 'all-time' | 'past-three' | 'past-seven' | 'last-patch',
	percentile: 100 | 50 | 25 | 10 | 1,
	lastPatch: PatchInfo,
	statsBuilder: (data: readonly InternalBgsRow[]) => readonly T[],
): Promise<{
	stats: readonly WithMmrAndTimePeriod<T>[];
	mmrPercentiles: readonly MmrPercentile[];
}> => {
	const rowsForTimePeriod = filterRowsForTimePeriod(rows, timePeriod, lastPatch);
	console.log('rowsForTimePeriod', timePeriod, rowsForTimePeriod.length);
	const mmrPercentiles: readonly MmrPercentile[] = buildMmrPercentiles(rowsForTimePeriod);
	const mmrPercentile = mmrPercentiles.find((p) => p.percentile === percentile);
	const result: WithMmrAndTimePeriod<T>[] = [];
	const mmrRows = rowsForTimePeriod.filter(
		(row) => mmrPercentile.percentile === 100 || row.rating >= mmrPercentile.mmr,
	);
	console.log('mmrRows', mmrRows.length, mmrPercentile.percentile, mmrPercentile.mmr);
	result.push(
		...statsBuilder(mmrRows).map((r) => ({
			...r,
			mmrPercentile: mmrPercentile.percentile,
			timePeriod: timePeriod,
		})),
	);
	return {
		stats: result,
		mmrPercentiles: mmrPercentiles,
	};
};
