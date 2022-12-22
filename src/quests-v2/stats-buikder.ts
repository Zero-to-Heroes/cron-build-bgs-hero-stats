import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { Race } from '@firestone-hs/reference-data';
import { InternalBgsRow } from '../internal-model';
import { BgsGlobalQuestStat, BgsQuestDifficultyStat, BgsQuestHeroStat, BgsQuestTribeStat } from './bgs-quest-stat';

export const buildStats = (rows: readonly InternalBgsRow[]): readonly BgsGlobalQuestStat[] => {
	const groupedByQuest: {
		[questCardId: string]: readonly InternalBgsRow[];
	} = groupByFunction((row: InternalBgsRow) => row.bgsHeroQuests.trim())(rows);
	return Object.values(groupedByQuest).flatMap(data => buildStatsForSingleQuest(data));
};

// All rows here belong to a single quest
const buildStatsForSingleQuest = (rows: readonly InternalBgsRow[]): BgsGlobalQuestStat => {
	const ref = rows[0];
	const completed = rows.filter(r => !!r.bgsQuestsCompletedTimings?.length);
	const averageTurnToComplete = average(completed.map(r => parseInt(r.bgsQuestsCompletedTimings)));
	const completionRate = completed.length / rows.length;
	return {
		questCardId: ref.bgsHeroQuests.trim(),
		dataPoints: rows.length,
		averageTurnToComplete: averageTurnToComplete,
		completionRate: completionRate,
		difficultyStats: buildDifficultyStats(rows, averageTurnToComplete, completionRate),
		heroStats: buildHeroStats(rows, averageTurnToComplete, completionRate),
		tribeStats: buildTribeStats(rows, averageTurnToComplete, completionRate),
	};
};

const buildTribeStats = (
	rows: readonly InternalBgsRow[],
	refAverageTurnToComplete: number,
	refCompletionRate: number,
): readonly BgsQuestTribeStat[] => {
	const rowsWithTribes = rows.filter(r => !!r.tribes?.length);
	const uniqueTribes: readonly Race[] = [
		...new Set(rowsWithTribes.flatMap(r => r.tribes.split(',')).map(r => parseInt(r))),
	];
	return uniqueTribes.map(tribe => {
		const rowsForTribe = rowsWithTribes.filter(r => r.tribes.split(',').includes('' + tribe));
		const completed = rowsForTribe.filter(r => !!r?.bgsQuestsCompletedTimings?.length);
		const completionRate = completed.length / rowsForTribe.length;
		const averageTurnToComplete = average(completed.map(r => parseInt(r.bgsQuestsCompletedTimings)));
		return {
			tribe: tribe,
			dataPoints: rowsForTribe.length,
			completionRate: completionRate,
			averageTurnToComplete: averageTurnToComplete,
			impactCompletionRate: completionRate - refCompletionRate,
			impactTurnToComplete: averageTurnToComplete - refAverageTurnToComplete,
		};
	});
};

const buildHeroStats = (
	rows: readonly InternalBgsRow[],
	refAverageTurnToComplete: number,
	refCompletionRate: number,
): readonly BgsQuestHeroStat[] => {
	const groupedByHero = groupByFunction((r: InternalBgsRow) => r.heroCardId)(rows);
	return Object.keys(groupedByHero).map(heroCardId => {
		const rowsForHero = groupedByHero[heroCardId];
		const completed = rowsForHero.filter(r => !!r?.bgsQuestsCompletedTimings?.length);
		const completionRate = completed.length / rowsForHero.length;
		const averageTurnToComplete = average(completed.map(r => parseInt(r.bgsQuestsCompletedTimings)));
		return {
			heroCardId: heroCardId,
			dataPoints: rowsForHero.length,
			averageTurnToComplete: averageTurnToComplete,
			completionRate: completionRate,
		};
	});
};

const buildDifficultyStats = (
	rows: readonly InternalBgsRow[],
	refAverageTurnToComplete: number,
	refCompletionRate: number,
): readonly BgsQuestDifficultyStat[] => {
	const groupedByDifficulty = groupByFunction((r: InternalBgsRow) => parseInt(r.bgsQuestsDifficulties))(rows);
	return Object.keys(groupedByDifficulty)
		.filter(diff => diff != null && !!diff?.length && !!parseInt(diff) && !isNaN(parseInt(diff)))
		.map(diff => {
			const rowsForDifficulty = groupedByDifficulty[diff];
			const completed = rowsForDifficulty.filter(r => !!r?.bgsQuestsCompletedTimings?.length);
			const completionRate = completed.length / rowsForDifficulty.length;
			const averageTurnToComplete = average(completed.map(r => parseInt(r.bgsQuestsCompletedTimings)));
			return {
				difficulty: parseInt(diff),
				dataPoints: rowsForDifficulty.length,
				completionRate: completionRate,
				averageTurnToComplete: averageTurnToComplete,
				impactCompletionRate: completionRate - refCompletionRate,
				impactTurnToComplete: averageTurnToComplete - refAverageTurnToComplete,
			};
		});
};

const average = (data: readonly number[]): number => {
	return data.reduce((a, b) => a + b, 0) / data.length;
};
