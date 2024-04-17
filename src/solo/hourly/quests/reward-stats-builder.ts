import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService, Race } from '@firestone-hs/reference-data';
import { InternalBgsRow } from '../../../internal-model';
import { BgsGlobalRewardStat, BgsRewardHeroStat, BgsRewardTribeStat } from '../../../model-quests';

export const buildRewardStatsForMmr = (
	rows: readonly InternalBgsRow[],
	allCards: AllCardsService,
): readonly BgsGlobalRewardStat[] => {
	// This assumes that Sire D's quest is not flagged as a normal quest. To be confirmed
	const groupedByReward: {
		[rewardCardId: string]: readonly InternalBgsRow[];
	} = groupByFunction((row: InternalBgsRow) => row.bgsHeroQuestRewards.trim())(rows);
	return Object.values(groupedByReward).flatMap((data) => buildStatsForSingleReward(data));
};

// All rows here belong to a single reward
const buildStatsForSingleReward = (rows: readonly InternalBgsRow[]): BgsGlobalRewardStat => {
	// const startTime = new Date().getTime();
	const ref = rows[0];
	const averagePlacement = average(rows.map((r) => r.rank));

	return {
		rewardCardId: ref.bgsHeroQuestRewards.trim(),
		dataPoints: rows.length,
		averagePlacement: averagePlacement,
		heroStats: buildHeroStats(rows, averagePlacement),
		tribeStats: buildTribeStats(rows, averagePlacement),
	};
};

const buildTribeStats = (
	rows: readonly InternalBgsRow[],
	refAveragePlacement: number,
): readonly BgsRewardTribeStat[] => {
	const rowsWithTribes = rows;
	const uniqueTribes: readonly Race[] = [...new Set(rowsWithTribes.flatMap((r) => r.tribesExpanded))];
	return uniqueTribes.map((tribe) => {
		const rowsForTribe = rowsWithTribes.filter((r) => r.tribesExpanded.includes(tribe));
		const placement = average(rowsForTribe.map((r) => r.rank));
		return {
			tribe: tribe,
			dataPoints: rowsForTribe.length,
			averagePlacement: placement,
			impactPlacement: placement - refAveragePlacement,
		};
	});
};

const buildHeroStats = (rows: readonly InternalBgsRow[], refAveragePlacement: number): readonly BgsRewardHeroStat[] => {
	const groupedByHero = groupByFunction((r: InternalBgsRow) => r.heroCardId)(rows);
	return Object.keys(groupedByHero).map((heroCardId) => {
		const rowsForHero = groupedByHero[heroCardId];
		return {
			heroCardId: heroCardId,
			dataPoints: rowsForHero.length,
			averagePlacement: average(rowsForHero.map((r) => r.rank)),
		};
	});
};

const average = (data: readonly number[]): number => {
	return data.reduce((a, b) => a + b, 0) / data.length;
};
