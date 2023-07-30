import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { Race } from '@firestone-hs/reference-data';
import { InternalBgsRow } from '../internal-model';
import { BgsGlobalRewardStat, BgsRewardHeroStat, BgsRewardTribeStat } from './bgs-quest-stat';

export const buildRewardsStats = (rows: readonly InternalBgsRow[]): readonly BgsGlobalRewardStat[] => {
	const groupedByReward: {
		[rewardCardId: string]: readonly InternalBgsRow[];
	} = groupByFunction((row: InternalBgsRow) => row.bgsHeroQuestRewards.trim())(rows);
	return Object.values(groupedByReward).flatMap((data) => buildStatsForSingleReward(data));
};

// All rows here belong to a single quest
const buildStatsForSingleReward = (rows: readonly InternalBgsRow[]): BgsGlobalRewardStat => {
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
	const rowsWithTribes = rows.filter((r) => !!r.tribes?.length);
	const uniqueTribes: readonly Race[] = [
		...new Set(rowsWithTribes.flatMap((r) => r.tribes.split(',')).map((r) => parseInt(r))),
	];
	return uniqueTribes.map((tribe) => {
		const rowsForTribe = rowsWithTribes.filter((r) => r.tribes.split(',').includes('' + tribe));
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
