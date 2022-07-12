/* eslint-disable @typescript-eslint/no-use-before-define */
import { MmrPercentile } from '../bgs-global-stats';
import { InternalBgsRow, RankGroup, Slice } from '../internal-model';

export const buildAllRankGroups = (slices: readonly Slice[], rows: readonly InternalBgsRow[]): readonly RankGroup[] => {
	const rowMmrs = rows.map(row => row.rating) ?? [];
	const slicesMmr = slices?.flatMap(slice => slice.allMmr);
	const highestMmr = Math.max(...rowMmrs, ...slicesMmr);
	return buildDefaultRankGroups(highestMmr);
};

const buildDefaultRankGroups = (highestMmr: number): readonly RankGroup[] => {
	const result: RankGroup[] = [];
	let currentMmr = 0;
	while (currentMmr <= highestMmr) {
		const group: RankGroup = {
			mmrThreshold: currentMmr,
			mmrRangeUp: 500, // Might tweak that for lower / higher MMRs if need be
		};
		result.push(group);
		currentMmr += group.mmrRangeUp;
	}
	return result;
};

export const buildMmrPercentiles = (slices: readonly Slice[]): readonly MmrPercentile[] => {
	const sortedMmrs: readonly number[] = slices.flatMap(slice => slice.allMmr).sort((a, b) => a - b);
	const median = sortedMmrs[Math.floor(sortedMmrs.length / 2)];
	const top25 = sortedMmrs[Math.floor((sortedMmrs.length / 4) * 3)];
	const top10 = sortedMmrs[Math.floor((sortedMmrs.length / 10) * 9)];
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
	];
};
