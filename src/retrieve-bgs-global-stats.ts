/* eslint-disable @typescript-eslint/no-empty-interface */
/* eslint-disable @typescript-eslint/no-use-before-define */
import { BgsGlobalHeroStat, BgsGlobalStats } from './bgs-global-stats';
import { groupByFunction, http } from './utils/util-functions';

export const loadStats = async (mysql, mysqlBgs): Promise<BgsGlobalStats> => {
	const allHeroes = await getAllHeroes(mysqlBgs);
	const heroStats: readonly BgsGlobalHeroStat[] = await getHeroStats(mysqlBgs, allHeroes);
	// TODO: test the updated endpoint
	const tribesDbResults: readonly TribeStat[] = await getTribesDbResults(mysql);
	const warbandStatsDbResults: readonly WarbandStat[] = await getWarbandStatsDbResults(mysql);
	const winrateDbResults: readonly WinrateStat[] = await getWinrateDbResults(mysql);
	await mysql.end();

	const heroStatsWithTribes = heroStats.map(stat => {
		const relevantTribes = tribesDbResults.filter(tribeStat => tribeStat.heroCardId === stat.id);
		return {
			...stat,
			tribesStat: relevantTribes.map(tribe => ({
				tribe: tribe.tribe.toLowerCase(),
				percent: tribe.percent,
			})),
		} as BgsGlobalHeroStat;
	});

	const heroStatsWithWarband = heroStatsWithTribes.map(stat => {
		const warbandStatInfo = warbandStatsDbResults.filter(warbandStat => warbandStat.heroCardId === stat.id);
		const winrateInfo = winrateDbResults.filter(warbandStat => warbandStat.heroCardId === stat.id);
		// console.log('winrateInfo for', stat.id, winrateInfo);
		return {
			...stat,
			warbandStats: !warbandStatInfo
				? []
				: warbandStatInfo
						// In the endgame the results are skewed too much by the outliers and by the fact that some heroes never make it there
						.filter(info => info.turn <= 15)
						.map(info => ({
							turn: info.turn,
							totalStats: info.totalStats,
						})),
			combatWinrate: !winrateInfo
				? []
				: winrateInfo
						.filter(info => info.turn <= 18)
						.map(info => ({
							turn: info.turn,
							winrate: info.winrate,
						})),
		} as BgsGlobalHeroStat;
	});
	// console.log('hero stats with warbnd stats', heroStatsWithWarband);

	const result = {
		heroStats: heroStatsWithWarband,
	} as BgsGlobalStats;
	return result;
};

const getHeroStats = async (mysql, allHeroes: string): Promise<readonly BgsGlobalHeroStat[]> => {
	// Global stats, like popularity, etc.
	const heroStatsQuery = `
			SELECT * FROM bgs_hero_stats 
			WHERE date is NULL
			AND heroCardId in (${allHeroes})
			ORDER BY heroCardId ASC
		`;
	const heroStatsDbResults: readonly any[] = await mysql.query(heroStatsQuery);
	const heroStats = [
		...heroStatsDbResults.map(
			result =>
				({
					id: result.heroCardId,
					averagePosition: result.averagePosition,
					popularity: result.popularity,
					top4: result.top4,
					top1: result.top1,
					tier: result.tier,
				} as BgsGlobalHeroStat),
		),
		{
			id: 'average',
		} as BgsGlobalHeroStat,
	];
	return heroStats;
};

const getWinrateDbResults = async (mysql): Promise<readonly WinrateStat[]> => {
	const periodStart = new Date(new Date().getTime() - 100 * 24 * 60 * 60 * 1000);
	const statsQuery = `
		SELECT * FROM bgs_winrate 
		WHERE periodStart >= '${periodStart.toISOString()}'
		ORDER BY heroCardId ASC
	`;
	const rawDbResults: readonly WinrateDbRow[] = await mysql.query(statsQuery);
	const resultsByHero = groupByFunction((stat: WinrateDbRow) => stat.heroCardId)(rawDbResults);
	return Object.keys(resultsByHero)
		.map(heroCardId => {
			const statsForHero: readonly WinrateDbRow[] = resultsByHero[heroCardId];
			const resultsByTurn = groupByFunction((stat: WinrateDbRow) => '' + stat.turn)(statsForHero);
			return Object.keys(resultsByTurn).map(turn => {
				const statsForTurn: readonly WinrateDbRow[] = resultsByTurn[turn];
				const totalStatsForTurn = statsForTurn.map(stat => stat.totalValue).reduce((a, b) => a + b, 0) || 0;
				const totalDataPointsForTurn = statsForTurn.map(stat => stat.dataPoints).reduce((a, b) => a + b, 0);
				return {
					heroCardId: heroCardId,
					turn: +turn,
					winrate: totalDataPointsForTurn ? totalStatsForTurn / totalDataPointsForTurn : 0,
				} as WinrateStat;
			});
		})
		.reduce((a, b) => a.concat(b), []);
};

const getWarbandStatsDbResults = async (mysql): Promise<readonly WarbandStat[]> => {
	const periodStart = new Date(new Date().getTime() - 100 * 24 * 60 * 60 * 1000);
	const statsQuery = `
		SELECT * FROM bgs_warband_stats 
		WHERE periodStart >= '${periodStart.toISOString()}'
		ORDER BY heroCardId ASC
	`;
	const rawDbResults: readonly WarbandDbRow[] = await mysql.query(statsQuery);
	const resultsByHero = groupByFunction((stat: WarbandDbRow) => stat.heroCardId)(rawDbResults);
	return Object.keys(resultsByHero)
		.map(heroCardId => {
			const statsForHero: readonly WarbandDbRow[] = resultsByHero[heroCardId];
			const resultsByTurn = groupByFunction((stat: WarbandDbRow) => '' + stat.turn)(statsForHero);
			return Object.keys(resultsByTurn).map(turn => {
				const statsForTurn: readonly WarbandDbRow[] = resultsByTurn[turn];
				const totalStatsForTurn = statsForTurn.map(stat => stat.totalValue).reduce((a, b) => a + b, 0) || 0;
				const totalDataPointsForTurn = statsForTurn.map(stat => stat.dataPoints).reduce((a, b) => a + b, 0);
				return {
					heroCardId: heroCardId,
					turn: +turn,
					totalStats: totalDataPointsForTurn ? totalStatsForTurn / totalDataPointsForTurn : 0,
				} as WarbandStat;
			});
		})
		.reduce((a, b) => a.concat(b), []);
};

const getTribesDbResults = async (mysql): Promise<readonly TribeStat[]> => {
	const periodStart = new Date(new Date().getTime() - 100 * 24 * 60 * 60 * 1000);
	const tribesAtEndStatsQuery = `
		SELECT * FROM bgs_tribes_at_end 
		WHERE periodStart >= '${periodStart.toISOString()}'
		ORDER BY heroCardId ASC
	`;
	const rawTribesDbResults: readonly TribeDbRow[] = await mysql.query(tribesAtEndStatsQuery);
	const resultsByHero = groupByFunction((stat: TribeDbRow) => stat.heroCardId)(rawTribesDbResults);
	return Object.keys(resultsByHero)
		.map(heroCardId => {
			const statsForHero: readonly TribeDbRow[] = resultsByHero[heroCardId];
			const totalStatsForHero = statsForHero.map(stat => stat.totalValue).reduce((a, b) => a + b, 0);
			const resultsByTribe = groupByFunction((stat: any) => stat.tribe)(statsForHero);
			return Object.keys(resultsByTribe).map(tribe => {
				const statsForTribe: readonly TribeDbRow[] = resultsByTribe[tribe];
				const totalStatsForTribe = statsForTribe.map(stat => stat.totalValue).reduce((a, b) => a + b, 0);
				return {
					heroCardId: heroCardId,
					tribe: tribe,
					percent: (100 * totalStatsForTribe) / totalStatsForHero,
				} as TribeStat;
			});
		})
		.reduce((a, b) => a.concat(b), []);
};

const getAllHeroes = async (mysql): Promise<string> => {
	// First get the list of active heroes
	const heroesDateQuery = `
		SELECT date FROM bgs_hero_stats WHERE date IS NOT NULL ORDER BY id desc limit 1 
	`;
	const heroesLastDate: Date = (await mysql.query(heroesDateQuery))[0].date;
	const allHeroesQuery = `
		SELECT heroCardId FROM bgs_hero_stats 
		WHERE date = '${heroesLastDate.toISOString()}'
		ORDER BY heroCardId ASC
	`;
	const allHeroesDbResult: readonly any[] = await mysql.query(allHeroesQuery);
	const allHeroes: string = allHeroesDbResult.map(result => `'${result.heroCardId}'`).join(',');
	return allHeroes;
};

interface TribeDbRow {
	id: number;
	periodStart: string;
	heroCardId: string;
	tribe: string;
	dataPoints: number;
	totalValue: number;
}

interface TribeStat {
	heroCardId: string;
	tribe: string;
	percent: number;
}

interface WarbandDbRow {
	id: number;
	periodStart: string;
	heroCardId: string;
	turn: number;
	dataPoints: number;
	totalValue: number;
}

interface WinrateDbRow extends WarbandDbRow {}

interface WarbandStat {
	heroCardId: string;
	turn: number;
	// Caution: this is the total average warband stat
	totalStats: number;
}

interface WinrateStat {
	heroCardId: string;
	turn: number;
	winrate: number;
}

export const getLastPatch = async (): Promise<any> => {
	const patchInfo = await http(`https://static.zerotoheroes.com/hearthstone/data/patches.json`);
	const structuredPatch = JSON.parse(patchInfo);
	const patchNumber = structuredPatch.currentDuelsMetaPatch;
	return patchInfo.patches.find(patch => patch.number === patchNumber);
};
