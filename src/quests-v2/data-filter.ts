import { MmrPercentile } from '../bgs-global-stats';
import { buildMmrPercentiles, filterRowsForTimePeriod, PatchInfo } from '../common';
import { InternalBgsRow } from '../internal-model';
import { ChargedStat } from './charged-stat';

export const buildSplitStats = async <T>(
	rows: readonly InternalBgsRow[],
	timePeriod: 'all-time' | 'past-three' | 'past-seven' | 'last-patch',
	lastPatch: PatchInfo,
	statsBuilder: (data: readonly InternalBgsRow[]) => readonly T[],
): Promise<{
	stats: readonly ChargedStat<T>[];
	mmrPercentiles: readonly MmrPercentile[];
}> => {
	const rowsForTimePeriod = filterRowsForTimePeriod(rows, timePeriod, lastPatch);
	const mmrPercentiles: readonly MmrPercentile[] = buildMmrPercentiles(rowsForTimePeriod);
	const result: ChargedStat<T>[] = [];
	for (const mmrPercentile of mmrPercentiles) {
		const mmrRows = rowsForTimePeriod.filter(
			row => mmrPercentile.percentile === 100 || row.rating >= mmrPercentile.mmr,
		);
		result.push(
			...statsBuilder(mmrRows).map(r => ({
				...r,
				mmrPercentile: mmrPercentile.percentile,
				timePeriod: timePeriod,
			})),
		);
	}
	return {
		stats: result,
		mmrPercentiles: mmrPercentiles,
	};
};