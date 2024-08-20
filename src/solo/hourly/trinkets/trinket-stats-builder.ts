import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { InternalBgsRow } from '../../../internal-model';
import { BgsGlobalTrinketStat, BgsTrinketHeroStat } from '../../../model-trinkets';

export const buildTrinketStatsForMmr = (
	rows: readonly InternalBgsRow[],
	allCards: AllCardsService,
): readonly BgsGlobalTrinketStat[] => {
	const denormalized = rows.flatMap((row) => {
		const trinkets = row.bgsTrinkets?.split(',').map((trinket) => trinket.trim());
		return [...trinkets.map((trinket) => ({ ...row, bgsTrinkets: trinket }))];
	});
	const denormalizedOptions = rows.flatMap((row) => {
		const trinkets = row.bgsTrinketsOptions?.split(',').map((trinket) => trinket.trim());
		return [...trinkets.map((trinket) => ({ ...row, bgsTrinketsOptions: trinket }))];
	});
	const groupedByTrinket: {
		[trinketCardId: string]: readonly InternalBgsRow[];
	} = groupByFunction((row: InternalBgsRow) => row.bgsTrinkets)(denormalized);
	return Object.values(groupedByTrinket).flatMap((data) => buildStatsForSingleTrinket(data, denormalizedOptions));
};

// All rows here belong to a single trinket
const buildStatsForSingleTrinket = (
	rows: readonly InternalBgsRow[],
	allDenormalizedOptions: readonly InternalBgsRow[],
): BgsGlobalTrinketStat => {
	const ref = rows[0];
	const averagePlacement = average(rows.map((r) => r.playerRank));
	const totalOffered = allDenormalizedOptions.filter((r) => r.bgsTrinketsOptions === ref.bgsTrinkets).length;

	return {
		trinketCardId: ref.bgsHeroQuests.trim(),
		dataPoints: rows.length,
		totalOffered: totalOffered,
		averagePlacement: averagePlacement,
		heroStats: buildHeroStats(rows, averagePlacement),
	};
};

const buildHeroStats = (
	rows: readonly InternalBgsRow[],
	refAveragePlacement: number,
): readonly BgsTrinketHeroStat[] => {
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
