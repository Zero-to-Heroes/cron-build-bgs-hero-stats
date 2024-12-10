import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { InternalBgsGlobalTrinketStat, InternalBgsRow, InternalBgsTrinketHeroStat } from '../../../internal-model';

export const buildTrinketStatsForMmr = (
	rows: readonly InternalBgsRow[],
	allCards: AllCardsService,
): readonly InternalBgsGlobalTrinketStat[] => {
	console.debug('building trinket stats for', rows.length, 'rows');
	const denormalized = rows.flatMap((row) => {
		const trinkets = row.bgsTrinkets?.split(',').map((trinket) => trinket.trim());
		return [...trinkets.map((trinket) => ({ ...row, bgsTrinkets: trinket }))];
	});
	const denormalizedOptions = rows.flatMap((row) => {
		const trinkets = row.bgsTrinketsOptions?.split(',').map((trinket) => trinket.trim());
		return [...trinkets.map((trinket) => ({ ...row, bgsTrinketsOptions: trinket }))];
	});
	console.debug('denormalized', denormalized.length, 'rows after denormalization');
	const groupedByTrinket: {
		[trinketCardId: string]: readonly InternalBgsRow[];
	} = groupByFunction((row: InternalBgsRow) => row.bgsTrinkets)(denormalized);
	return Object.values(groupedByTrinket).flatMap((data) => buildStatsForSingleTrinket(data, denormalizedOptions));
};

// All rows here belong to a single trinket
const buildStatsForSingleTrinket = (
	rows: readonly InternalBgsRow[],
	allDenormalizedOptions: readonly InternalBgsRow[],
): InternalBgsGlobalTrinketStat => {
	const ref = rows[0];
	const averagePlacement = average(rows.map((r) => r.playerRank));
	const totalOffered = allDenormalizedOptions.filter((r) => r.bgsTrinketsOptions === ref.bgsTrinkets).length;
	// console.debug('building stats for', ref.bgsTrinkets, 'with', rows.length, 'rows');

	return {
		trinketCardId: ref.bgsTrinkets.trim(),
		dataPoints: rows.length,
		totalOffered: totalOffered,
		averagePlacement: averagePlacement,
		heroStats: buildHeroStats(rows, averagePlacement),
	};
};

const buildHeroStats = (
	rows: readonly InternalBgsRow[],
	refAveragePlacement: number,
): readonly InternalBgsTrinketHeroStat[] => {
	const groupedByHero = groupByFunction((r: InternalBgsRow) => r.heroCardId)(rows);
	return Object.keys(groupedByHero).map((heroCardId) => {
		const rowsForHero = groupedByHero[heroCardId];
		return {
			heroCardId: heroCardId,
			dataPoints: rowsForHero.length,
			averagePlacement: average(rowsForHero.map((r) => r.playerRank)),
		};
	});
};

const average = (data: readonly number[]): number => {
	return data.reduce((a, b) => a + b, 0) / data.length;
};
