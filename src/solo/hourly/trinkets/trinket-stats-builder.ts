import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { InternalBgsRow } from '../../../internal-model';
import { BgsGlobalTrinketStat, BgsTrinketHeroStat } from '../../../model-trinkets';

export const buildTrinketStatsForMmr = (
	rows: readonly InternalBgsRow[],
	allCards: AllCardsService,
): readonly BgsGlobalTrinketStat[] => {
	const denormalized = rows.flatMap((row) => {
		const quests = row.bgsHeroQuests?.split(',').map((quest) => quest.trim());
		return [...quests.map((quest) => ({ ...row, bgsHeroQuests: quest }))];
	});
	const groupedByTrinket: {
		[trinketCardId: string]: readonly InternalBgsRow[];
	} = groupByFunction((row: InternalBgsRow) => row.bgsHeroQuests)(denormalized);
	return Object.values(groupedByTrinket).flatMap((data) => buildStatsForSingleTrinket(data));
};

// All rows here belong to a single trinket
const buildStatsForSingleTrinket = (rows: readonly InternalBgsRow[]): BgsGlobalTrinketStat => {
	const ref = rows[0];
	const averagePlacement = average(rows.map((r) => r.playerRank));

	return {
		trinketCardId: ref.bgsHeroQuests.trim(),
		dataPoints: rows.length,
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
