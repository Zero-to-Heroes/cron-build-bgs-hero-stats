/* eslint-disable @typescript-eslint/no-use-before-define */
import { groupByFunction, logger } from '@firestone-hs/aws-lambda-utils';
import { MmrPercentile } from '../bgs-global-stats';
import { InternalBgsRow, RankGroup, Slice } from '../internal-model';
import { getMax } from '../utils/util-functions';

export const buildAllRankGroups = (slices: readonly Slice[], rows: readonly InternalBgsRow[]): readonly RankGroup[] => {
	const highestRowMmr = getMax(rows.map(row => row.rating ?? 0));
	const highestSlicesMmrs = slices.map(slice => slice.highestMmr);
	const highestMmr = getMax([highestRowMmr, ...highestSlicesMmrs]);
	logger.log('highestMmr', highestMmr, highestSlicesMmrs, highestRowMmr);
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
	const groupedGroups = groupByFunction((group: RankGroup) => group.mmrThreshold)(
		slices.flatMap(slice => slice.mmrGroups),
	);
	const consolidatedGroups: readonly RankGroup[] = Object.keys(groupedGroups)
		.sort((a, b) => +a - +b)
		.map(mmrThreshold => {
			logger.log('will map group', mmrThreshold, groupedGroups[mmrThreshold]);
			return {
				mmrThreshold: +mmrThreshold,
				mmrRangeUp: groupedGroups[mmrThreshold][0].mmrRangeUp,
				quantity: groupedGroups[mmrThreshold].map(g => g.quantity ?? 0).reduce((a, b) => a + b, 0),
			};
		});
	const highestMmr = Math.max(...consolidatedGroups.map(g => g.mmrThreshold));
	let median = 0;
	let top25 = 0;
	let top10 = 0;
	for (const group of consolidatedGroups) {
		logger.log('handling goup', group, highestMmr);
		if (!median && group.mmrThreshold >= highestMmr / 2) {
			median = group.mmrThreshold;
		}
		if (!top25 && group.mmrThreshold >= highestMmr * 0.75) {
			top25 = group.mmrThreshold;
		}
		if (!top10 && group.mmrThreshold >= highestMmr * 0.9) {
			top10 = group.mmrThreshold;
		}
	}
	logger.log('mmrPercentile data', median, top25, top10);
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
