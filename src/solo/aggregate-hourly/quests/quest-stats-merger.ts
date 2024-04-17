import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import {
	BgsGlobalQuestStat,
	BgsQuestDifficultyStat,
	BgsQuestHeroStat,
	BgsQuestStats,
	BgsQuestTribeStat,
} from '../../../model-quests';
import { MmrPercentileFilter } from '../../../models';

export const mergeQuestStats = (
	hourlyData: readonly BgsQuestStats[],
	mmrPercentile: MmrPercentileFilter,
	allCards: AllCardsService,
): readonly BgsGlobalQuestStat[] => {
	const allStats: readonly BgsGlobalQuestStat[] = hourlyData
		.flatMap((data) => data.questStats)
		.filter((stat) => stat.mmrPercentile === mmrPercentile);
	// console.debug('allStats', mmrPercentile, allStats.length, '/', hourlyData.length);
	const groupedByQuest: {
		[questCardId: string]: readonly BgsGlobalQuestStat[];
	} = groupByFunction((stat: BgsGlobalQuestStat) => stat.questCardId)(allStats);
	const result: readonly BgsGlobalQuestStat[] = Object.values(groupedByQuest).map((stats) =>
		mergeStatsForSingleQuest(stats, allCards),
	);
	return result;
};

const mergeStatsForSingleQuest = (
	stats: readonly BgsGlobalQuestStat[],
	allCards: AllCardsService,
): BgsGlobalQuestStat => {
	const ref = stats[0];
	// const debug = ref.heroCardId === 'BG21_HERO_010';

	const totalDataPoints = stats.map((stat) => stat.dataPoints).reduce((a, b) => a + b, 0);
	const totalTurnsToComplete = stats.map((s) => s.averageTurnToComplete * s.dataPoints).reduce((a, b) => a + b, 0);
	const totalCompleted = stats.map((s) => s.completionRate * s.dataPoints).reduce((a, b) => a + b, 0);
	const refAverageTurnToComplete = totalTurnsToComplete / totalDataPoints;
	const refCompletionRate = totalCompleted / totalDataPoints;

	const result: BgsGlobalQuestStat = {
		questCardId: ref.questCardId,
		dataPoints: totalDataPoints,
		averageTurnToComplete: refAverageTurnToComplete,
		completionRate: refCompletionRate,
		difficultyStats: mergeDifficultyStatsForSingleQuest(stats, refAverageTurnToComplete, refCompletionRate),
		heroStats: mergeHeroStatsForSingleQuest(stats),
		tribeStats: mergeTribeStatsForSingleQuest(stats, refAverageTurnToComplete, refCompletionRate),
	};
	return result;
};

const mergeTribeStatsForSingleQuest = (
	stats: readonly BgsGlobalQuestStat[],
	refAverageTurnToComplete: number,
	refCompletionRate: number,
): readonly BgsQuestTribeStat[] => {
	const tribeStats = stats.flatMap((s) => s.tribeStats);
	const groupedByTribe: {
		[tribe: string]: readonly BgsQuestTribeStat[];
	} = groupByFunction((stat: BgsQuestTribeStat) => stat.tribe)(tribeStats);
	const result: readonly BgsQuestTribeStat[] = Object.values(groupedByTribe).map((stats) =>
		mergeTribeStatsForSingleTribe(stats, refAverageTurnToComplete, refCompletionRate),
	);
	return result;
};

const mergeTribeStatsForSingleTribe = (
	stats: readonly BgsQuestTribeStat[],
	refAverageTurnToComplete: number,
	refCompletionRate: number,
): BgsQuestTribeStat => {
	const ref = stats[0];

	const totalDataPoints = stats.map((s) => s.dataPoints).reduce((a, b) => a + b, 0);
	const totalTurnsToComplete = stats.map((s) => s.averageTurnToComplete * s.dataPoints).reduce((a, b) => a + b, 0);
	const totalCompleted = stats.map((s) => s.completionRate * s.dataPoints).reduce((a, b) => a + b, 0);
	const averageTurnToComplete = totalTurnsToComplete / totalDataPoints;
	const completionRate = totalCompleted / totalDataPoints;

	const result: BgsQuestTribeStat = {
		tribe: ref.tribe,
		dataPoints: totalDataPoints,
		averageTurnToComplete: averageTurnToComplete,
		completionRate: completionRate,
		impactTurnToComplete: averageTurnToComplete - refAverageTurnToComplete,
		impactCompletionRate: completionRate - refCompletionRate,
	};
	return result;
};

const mergeHeroStatsForSingleQuest = (stats: readonly BgsGlobalQuestStat[]): readonly BgsQuestHeroStat[] => {
	const heroStats = stats.flatMap((s) => s.heroStats);
	const groupedByHero: {
		[heroCardId: string]: readonly BgsQuestHeroStat[];
	} = groupByFunction((stat: BgsQuestHeroStat) => stat.heroCardId)(heroStats);
	const result: readonly BgsQuestHeroStat[] = Object.values(groupedByHero).map((stats) =>
		mergeHeroStatsForSingleHero(stats),
	);
	return result;
};

const mergeHeroStatsForSingleHero = (stats: readonly BgsQuestHeroStat[]): BgsQuestHeroStat => {
	const ref = stats[0];

	const totalDataPoints = stats.map((s) => s.dataPoints).reduce((a, b) => a + b, 0);
	const totalTurnsToComplete = stats.map((s) => s.averageTurnToComplete * s.dataPoints).reduce((a, b) => a + b, 0);
	const totalCompleted = stats.map((s) => s.completionRate * s.dataPoints).reduce((a, b) => a + b, 0);
	const averageTurnToComplete = totalTurnsToComplete / totalDataPoints;
	const completionRate = totalCompleted / totalDataPoints;

	const result: BgsQuestHeroStat = {
		heroCardId: ref.heroCardId,
		dataPoints: totalDataPoints,
		averageTurnToComplete: averageTurnToComplete,
		completionRate: completionRate,
	};
	return result;
};

const mergeDifficultyStatsForSingleQuest = (
	stats: readonly BgsGlobalQuestStat[],
	refAverageTurnToComplete: number,
	refCompletionRate: number,
): readonly BgsQuestDifficultyStat[] => {
	const difficultyStats = stats.flatMap((s) => s.difficultyStats);
	const groupedByDifficulty: {
		[difficulty: string]: readonly BgsQuestDifficultyStat[];
	} = groupByFunction((stat: BgsQuestDifficultyStat) => stat.difficulty)(difficultyStats);
	const result: readonly BgsQuestDifficultyStat[] = Object.values(groupedByDifficulty).map((stats) =>
		mergeDifficultyStatsForSingleDifficulty(stats, refAverageTurnToComplete, refCompletionRate),
	);
	return result;
};

const mergeDifficultyStatsForSingleDifficulty = (
	stats: readonly BgsQuestDifficultyStat[],
	refAverageTurnToComplete: number,
	refCompletionRate: number,
): BgsQuestDifficultyStat => {
	const ref = stats[0];

	const totalDataPoints = stats.map((s) => s.dataPoints).reduce((a, b) => a + b, 0);
	const totalTurnsToComplete = stats.map((s) => s.averageTurnToComplete * s.dataPoints).reduce((a, b) => a + b, 0);
	const totalCompleted = stats.map((s) => s.completionRate * s.dataPoints).reduce((a, b) => a + b, 0);
	const averageTurnToComplete = totalTurnsToComplete / totalDataPoints;
	const completionRate = totalCompleted / totalDataPoints;

	const result: BgsQuestDifficultyStat = {
		difficulty: ref.difficulty,
		dataPoints: totalDataPoints,
		averageTurnToComplete: averageTurnToComplete,
		completionRate: completionRate,
		impactTurnToComplete: averageTurnToComplete - refAverageTurnToComplete,
		impactCompletionRate: completionRate - refCompletionRate,
	};
	return result;
};
