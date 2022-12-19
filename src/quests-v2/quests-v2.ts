import { groupByFunction, logger } from '@firestone-hs/aws-lambda-utils';
import { ALL_BG_RACES } from '@firestone-hs/reference-data';
import { gzipSync } from 'zlib';
import { s3 } from '../build-battlegrounds-hero-stats-new';
import { PatchInfo } from '../common';
import { InternalBgsRow } from '../internal-model';
import { BgsQuestDifficultyInfo, BgsQuestStat, BgsQuestStats, BgsQuestTribeInfo } from './bgs-quest-stat';
import { buildSplitStats } from './data-filter';

export const handleQuestsV2 = async (
	timePeriod: 'all-time' | 'past-three' | 'past-seven' | 'last-patch',
	rows: readonly InternalBgsRow[],
	lastPatch: PatchInfo,
) => {
	const rowsWithQuests = rows
		.filter(row => row.quests)
		.filter(row => !!row.bgsHeroQuestRewards?.length)
		.filter(row => !!row.bgsQuestsDifficulties?.length);
	console.log('total relevant rows', rowsWithQuests?.length);

	const statResult = await buildSplitStats(rowsWithQuests, timePeriod, lastPatch, (data: InternalBgsRow[]) =>
		buildStats(data),
	);
	const stats = statResult.stats;
	const statsForQuests: BgsQuestStats = {
		lastUpdateDate: new Date(),
		mmrPercentiles: statResult.mmrPercentiles,
		stats: stats,
		dataPoints: rowsWithQuests.length,
	};
	logger.log('\tbuilt stats', statsForQuests.dataPoints, statsForQuests.stats?.length);
	const timeSuffix = timePeriod;
	await s3.writeFile(
		gzipSync(JSON.stringify(statsForQuests)),
		'static.zerotoheroes.com',
		`api/bgs/quests/bgs-quests-v2-${timeSuffix}.gz.json`,
		'application/json',
		'gzip',
	);
};

const buildStats = (rows: readonly InternalBgsRow[]): readonly BgsQuestStat[] => {
	const groupedByQuest: {
		[questCardId: string]: readonly InternalBgsRow[];
	} = groupByFunction((row: InternalBgsRow) => row.bgsHeroQuests.trim())(rows);
	return Object.values(groupedByQuest).flatMap(data => buildStatsForSingleQuest(data));
};

// All rows here belong to a single quest
const buildStatsForSingleQuest = (rows: readonly InternalBgsRow[]): readonly BgsQuestStat[] => {
	const allHeroes = [null, ...new Set(rows.map(r => r.heroCardId))];
	return allHeroes
		.flatMap(hero => {
			const rowsForHero = rows.filter(r => r.heroCardId === hero);
			if (!rowsForHero.length) {
				return null;
			}

			const result = buildStatForSingleQuestAndHero(rowsForHero);
			return { ...result, heroCardId: hero } as BgsQuestStat;
		})
		.filter(stat => !!stat);
};

const buildStatForSingleQuestAndHero = (rows: readonly InternalBgsRow[]): BgsQuestStat => {
	if (rows.some(r => !r.bgsQuestsDifficulties?.length)) {
		throw new Error('all rows without difficulty should have been filtered out');
	}

	const ref = rows[0];

	// General stats
	const difficulties = rows.map(r => parseInt(r.bgsQuestsDifficulties));
	const averageDifficulty = average(difficulties);
	const difficultyCurve = curve(difficulties);

	const completedQuests = rows.filter(r => r.bgsQuestsCompletedTimings.length);
	const completionRate = completedQuests.length / rows.length;
	const turnsToComplete = completedQuests.map(r => parseInt(r.bgsQuestsCompletedTimings));
	const averageTurnsToComplete = average(turnsToComplete);
	const turnsToCompleteCurve = curve(turnsToComplete);

	const placements = rows.map(r => r.rank);
	const averagePlacement = average(placements);
	const placementCurve = curve(placements);

	const placementsOnceCompleted = completedQuests.map(r => r.rank);
	const averagePlacementOnceCompleted = average(placementsOnceCompleted);
	const placementCurveOnceCompleted = curve(placementsOnceCompleted);

	// Build stats based on the quest's difficulty
	const difficultyInfos: BgsQuestDifficultyInfo[] = [];
	const uniqueDifficulties = [...new Set(difficulties)];
	for (const difficulty of uniqueDifficulties) {
		const rowsWithDifficulty = rows.filter(r => parseInt(r.bgsQuestsDifficulties) === difficulty);
		const completedQuestsForDifficulty = rowsWithDifficulty.filter(r => r.bgsQuestsCompletedTimings.length);
		const averageTurnsToCompleteForDifficulty = average(
			completedQuestsForDifficulty.map(r => parseInt(r.bgsQuestsCompletedTimings)),
		);
		const averagePlacementForDifficulty = average(rowsWithDifficulty.map(r => r.rank));
		const averagePlacementOnceCompletedForDifficulty = average(
			rowsWithDifficulty.filter(r => r.bgsQuestsCompletedTimings?.length).map(r => r.rank),
		);
		const difficultyImpactTurnsToComplete = averageTurnsToCompleteForDifficulty - averageTurnsToComplete;
		const difficultyImpactPlacement = averagePlacementForDifficulty - averagePlacement;
		const difficultyImpactPlacementOnceCompleted =
			averagePlacementOnceCompletedForDifficulty - averagePlacementOnceCompleted;
		const difficultyInfo: BgsQuestDifficultyInfo = {
			difficulty: difficulty,
			dataPoints: rowsWithDifficulty.length,
			averageTurnsToCompleteForDifficulty: averageTurnsToCompleteForDifficulty,
			averagePlacementForDifficulty: averagePlacementForDifficulty,
			averagePlacementOnceCompletedForDifficulty: averagePlacementOnceCompletedForDifficulty,
			difficultyImpactTurnsToComplete: difficultyImpactTurnsToComplete,
			difficultyImpactPlacement: difficultyImpactPlacement,
			difficultyImpactPlacementOnceCompleted: difficultyImpactPlacementOnceCompleted,
		};
		difficultyInfos.push(difficultyInfo);
	}

	// Tribe stats
	const tribeInfos: BgsQuestTribeInfo[] = [];
	const rowsWithTribes = rows.filter(r => !!r.tribes?.length);
	for (const race of ALL_BG_RACES) {
		const rowsWithRace = rowsWithTribes.filter(r => r.tribes.includes(race.toString()));
		const averageTurnsToCompleteForRace = average(rowsWithRace.map(r => parseInt(r.bgsQuestsCompletedTimings)));
		const averagePlacementForRace = average(rowsWithRace.map(r => r.rank));
		const averagePlacementOnceCompletedForRace = average(
			rowsWithRace.filter(r => r.bgsQuestsCompletedTimings?.length).map(r => r.rank),
		);
		const raceImpactTurnsToComplete = averageTurnsToCompleteForRace - averageTurnsToComplete;
		const raceImpactPlacement = averagePlacementForRace - averagePlacement;
		const raceImpactPlacementOnceCompleted = averagePlacementOnceCompletedForRace - averagePlacementOnceCompleted;
		const tribeInfo: BgsQuestTribeInfo = {
			tribe: race,
			dataPoints: rowsWithRace.length,
			averageTurnsToCompleteForRace: averageTurnsToCompleteForRace,
			averagePlacementForRace: averagePlacementForRace,
			averagePlacementOnceCompletedForRace: averagePlacementOnceCompletedForRace,
			raceImpactTurnsToComplete: raceImpactTurnsToComplete,
			raceImpactPlacement: raceImpactPlacement,
			raceImpactPlacementOnceCompleted: raceImpactPlacementOnceCompleted,
		};
		tribeInfos.push(tribeInfo);
	}

	return {
		questCardId: ref.bgsHeroQuests,
		dataPoints: rows.length,

		averageDifficulty: averageDifficulty,
		difficultyCurve: difficultyCurve,

		completionRate: completionRate,
		averageTurnsToComplete: averageTurnsToComplete,
		turnsToCompleteCurve: turnsToCompleteCurve,

		averagePlacement: averagePlacement,
		placementCurve: placementCurve,
		averagePlacementOnceCompleted: averagePlacementOnceCompleted,
		placementCurveOnceCompleted: placementCurveOnceCompleted,

		tribeInfos: tribeInfos,
		difficultyInfos: difficultyInfos,
	};
};

const average = (data: readonly number[]): number => {
	return data.reduce((a, b) => a + b, 0) / data.length;
};

const curve = (data: readonly number[]): readonly { data: number; totalMatches: number }[] => {
	const placementDistribution: { data: number; totalMatches: number }[] = [];
	const groupedByData: { [data: string]: readonly number[] } = groupByFunction((res: number) => res)(data);
	Object.keys(groupedByData).forEach(data =>
		placementDistribution.push({ data: +data, totalMatches: groupedByData[data].length }),
	);
	return placementDistribution;
};
