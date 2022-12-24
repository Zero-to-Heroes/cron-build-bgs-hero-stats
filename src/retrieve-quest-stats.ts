import { logger } from '@firestone-hs/aws-lambda-utils';
import { Race } from '@firestone-hs/reference-data';
import { gzipSync } from 'zlib';
import { s3 } from './build-battlegrounds-hero-stats-new';
import { BgsGlobalQuestStat, BgsQuestStats } from './quests-v2/bgs-quest-stat';
import { WithMmrAndTimePeriod } from './quests-v2/charged-stat';
import { QUESTS_BUCKET } from './quests-v2/quests-v2';

export default async (event): Promise<any> => {
	logger.log('serving event', event, event.queryStringParameters.mmrPercentile === 100);
	const statsStr = await s3.readGzipContent(QUESTS_BUCKET, `api/bgs/quests/bgs-quests-v2-last-patch.gz.json`);
	const stats: BgsQuestStats = JSON.parse(statsStr);
	const quest: string = event.queryStringParameters.questCardId;
	const hero: string = event.queryStringParameters.heroCardId;
	const difficulty: number = !!event.queryStringParameters.difficulty?.length
		? parseInt(event.queryStringParameters.difficulty)
		: null;
	const tribes: readonly Race[] = !!event.queryStringParameters.tribes?.length
		? event.queryStringParameters.tribes.split(',').map(t => parseInt(t))
		: null;
	const mmrPercentile: 100 | 50 | 25 | 10 | 1 = parseInt(event.queryStringParameters.mmrPercentile ?? '100') as
		| 100
		| 50
		| 25
		| 10
		| 1;
	const stat = buildStat(stats, quest, hero, difficulty, tribes, mmrPercentile);
	const gzippedResults = !!statsStr?.length ? gzipSync(JSON.stringify(stat)).toString('base64') : null;
	const response = {
		statusCode: 200,
		isBase64Encoded: true,
		body: gzippedResults,
		headers: {
			'Content-Type': 'application/json',
			'Content-Encoding': 'gzip',
		},
	};
	return response;
};

const buildStat = (
	stats: BgsQuestStats,
	quest: string,
	hero: string,
	difficulty: number,
	tribes: readonly Race[],
	mmrPercentile: 100 | 50 | 25 | 10 | 1,
): BgsQuestStatResult => {
	const questStat: WithMmrAndTimePeriod<BgsGlobalQuestStat> = stats.questStats.find(
		s => s.questCardId === quest && s.mmrPercentile === mmrPercentile,
	);
	console.log('questStat', questStat, quest, mmrPercentile);
	const baseTtc = questStat.averageTurnToComplete;
	const baseCr = questStat.completionRate;
	const { heroTtcMod, heroCrMod } = buildHeroMods(questStat, hero);
	const { difficultyTtcMod, difficultyCrMod } = buildDifficultyMods(questStat, difficulty);
	const tribesMods = buildTribeMods(questStat, tribes);

	const turnsToComplete = applyMods(
		baseTtc,
		heroTtcMod,
		difficultyTtcMod,
		tribesMods.map(t => t.tribeTtcMod),
	);
	const completionRate = applyMods(
		baseCr,
		heroCrMod,
		difficultyCrMod,
		tribesMods.map(t => t.tribeCrMod),
	);

	return {
		turnsToComplete: turnsToComplete,
		completionRate: completionRate,
		dataPoints: stats.dataPoints,
		debugInfo: {
			// rawStat: questStat,
			baseTtc: baseTtc,
			baseCr: baseCr,
			heroTtcMod: heroTtcMod,
			heroCrMod: heroCrMod,
			difficultyTtcMod: difficultyTtcMod,
			difficultyCrMod: difficultyCrMod,
			tribesMods: tribesMods,
		},
	};
};

const applyMods = (base: number, heroMod: number, difficultyMod: number, tribeMods: readonly number[]): number => {
	let result = base * heroMod * difficultyMod;
	for (const tribeMod of tribeMods) {
		result *= tribeMod;
	}
	return result;
};

const buildTribeMods = (
	stat: BgsGlobalQuestStat,
	tribes: readonly Race[],
): { tribe: Race; tribeTtcMod: number; tribeCrMod: number }[] => {
	if (!tribes?.length) {
		return [];
	}

	return tribes.map(tribe => {
		const tribeStat = stat.tribeStats.find(s => s.tribe === tribe);
		return {
			tribe: tribe,
			tribeTtcMod: tribeStat.averageTurnToComplete / stat.averageTurnToComplete,
			tribeCrMod: tribeStat.completionRate / stat.completionRate,
		};
	});
};

const buildDifficultyMods = (
	stat: BgsGlobalQuestStat,
	difficulty: number,
): { difficultyTtcMod: number; difficultyCrMod: number } => {
	const difficultyStat = stat.difficultyStats.find(s => s.difficulty === difficulty);
	if (!difficultyStat) {
		return { difficultyTtcMod: 1, difficultyCrMod: 1 };
	}

	const difficultyTtcMod = difficultyStat.averageTurnToComplete / stat.averageTurnToComplete;
	const difficultyCrMod = difficultyStat.completionRate / stat.completionRate;
	return { difficultyTtcMod, difficultyCrMod };
};

const buildHeroMods = (stat: BgsGlobalQuestStat, heroCardId: string): { heroTtcMod: number; heroCrMod: number } => {
	const heroStat = stat.heroStats.find(s => s.heroCardId === heroCardId);
	if (!heroStat) {
		return { heroTtcMod: 1, heroCrMod: 1 };
	}

	const heroTtcMod = heroStat.averageTurnToComplete / stat.averageTurnToComplete;
	const heroCrMod = heroStat.completionRate / stat.completionRate;
	return { heroTtcMod, heroCrMod };
};

export interface BgsQuestStatResult {
	turnsToComplete: number;
	completionRate: number;
	dataPoints: number;
	readonly debugInfo: any;
}
