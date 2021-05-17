/* eslint-disable @typescript-eslint/no-use-before-define */
import { ServerlessMysql } from 'serverless-mysql';
import { gzipSync } from 'zlib';
import { BgsGlobalHeroStat, BgsHeroTier } from './bgs-global-stats';
import { getConnection as getConnectionStats } from './db/rds';
import { getConnection as getConnectionBgs } from './db/rds-bgs';
import { S3 } from './db/s3';
import { loadStats } from './retrieve-bgs-global-stats';
import { http } from './utils/util-functions';

const s3 = new S3();

// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.
// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event): Promise<any> => {
	const mysql = await getConnectionStats();
	const mysqlBgs = await getConnectionBgs();

	const lastBattlegroundsPatch = await getLastBattlegroundsPatch();

	await updateAggregatedStats(mysqlBgs, mysql, lastBattlegroundsPatch);
	await updateLastPeriodStats(mysqlBgs, mysql, lastBattlegroundsPatch);

	const stats = await loadStats(mysql, mysqlBgs);
	const stringResults = JSON.stringify(stats);
	const gzippedResults = gzipSync(stringResults);
	await s3.writeFile(
		gzippedResults,
		'static.zerotoheroes.com',
		'api/bgs-global-stats.json',
		'application/json',
		'gzip',
	);

	await mysqlBgs.end();
	await mysql.end();

	return { statusCode: 200, body: null };
};

const getLastBattlegroundsPatch = async (): Promise<number> => {
	const patchInfo = await http(`https://static.zerotoheroes.com/hearthstone/data/patches.json`);
	const structuredPatch = JSON.parse(patchInfo);
	return structuredPatch.currentBattlegroundsMetaPatch;
};

const updateAggregatedStats = async (mysqlBgs: ServerlessMysql, mysqlStats: ServerlessMysql, buildNumber: number) => {
	// This won't be fully accurate, as not all update will be installed simulatenously, but it's good enough
	const now = Date.now();
	const earliestStartDate = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();
	await updateStats(mysqlBgs, mysqlStats, earliestStartDate, buildNumber, false);
};

//  TODO: remove this lastperiod stuff, add a new column with the last update Date, and do a query on that last update date
const updateLastPeriodStats = async (mysqlBgs: ServerlessMysql, mysqlStats: ServerlessMysql, buildNumber: number) => {
	// Get all the reviews from the last day
	const now = Date.now();
	const earliestStartDate = new Date(now - 24 * 60 * 60 * 1000).toISOString();
	await updateStats(mysqlBgs, mysqlStats, earliestStartDate, buildNumber, true);
};

const updateStats = async (
	mysqlBgs: ServerlessMysql,
	mysqlStats: ServerlessMysql,
	creationDate: string,
	buildNumber: number,
	insertCreationDate: boolean,
) => {
	const allHeroesQuery = `
		SELECT distinct playerCardId
		FROM replay_summary
		WHERE gameMode = 'battlegrounds'
		AND (playerCardId like 'TB_BaconShop_Hero%' OR playerCardId like 'BG%')
		AND buildNumber >= ${buildNumber}
		${creationDate ? "AND creationDate > '" + creationDate + "'" : ''}
	`;
	const allHeroesResult: readonly any[] = await mysqlStats.query(allHeroesQuery);
	const allHeroes: readonly string[] = allHeroesResult
		.map(result => result.playerCardId)
		.filter(playerCardId => playerCardId !== 'TB_BaconShop_HERO_59t');

	const heroStatsQuery = `
		SELECT playerCardId, additionalResult, count(*) as count, max(creationDate) as lastPlayedDate
		FROM replay_summary
		WHERE gameMode = 'battlegrounds'
		AND (playerCardId like 'TB_BaconShop_Hero%' OR playerCardId like 'BG%')
		AND playerRank >= 4000
		AND buildNumber >= ${buildNumber}
		${creationDate ? "AND creationDate > '" + creationDate + "'" : ''}
		GROUP BY playerCardId, additionalResult
	`;
	const heroStatsResults: readonly any[] = ((await mysqlStats.query(heroStatsQuery)) as any[])
		.map(result => ({
			...result,
			additionalResult: parseInt(result.additionalResult),
		}))
		.filter(result => result.additionalResult > 0)
		.filter(result => result.playerCardId !== 'TB_BaconShop_HERO_59t');

	const stats: BgsGlobalHeroStat[] = allHeroes.map(heroCardId => buildHeroInfo(heroCardId, heroStatsResults));

	const now = new Date().toISOString();
	if (insertCreationDate) {
		const values = stats
			.map(
				stat =>
					`('${stat.id}', ${insertCreationDate ? "'" + now + "'" : null}, ${stat.popularity}, 
					${stat.averagePosition}, ${stat.top4}, ${stat.top1}, '${stat.tier}', ${stat.totalGames})`,
			)
			.join(',');
		const insertQuery = `
				INSERT INTO bgs_hero_stats
				(heroCardId, date, popularity, averagePosition, top4, top1, tier, totalGames)
				VALUES ${values}
			`;
		const updateResult = await mysqlBgs.query(insertQuery);
	}
	// Here the assumption is that we have run the INSERT once, and now we just update the data
	// NULL date means aggregated data from the latest period. Maybe at one point we'll need
	// to support multiple aggregated data, but for now this is enough
	else {
		for (const stat of stats) {
			const updateQuery = `
					UPDATE bgs_hero_stats
					SET 
						popularity = ${stat.popularity}, 
						averagePosition = ${stat.averagePosition},
						top4 = ${stat.top4},
						top1 = ${stat.top1},
						tier = '${stat.tier}',
						totalGames = ${stat.totalGames}
					WHERE heroCardId = '${stat.id}' AND date is NULL
				`;
			const updateResult: any = await mysqlBgs.query(updateQuery);
			// Non-existing data
			if (updateResult.affectedRows === 0) {
				const insertQuery = `
					INSERT INTO bgs_hero_stats
					(heroCardId, date, popularity, averagePosition, top4, top1, tier, totalGames)
					VALUES ('${stat.id}', NULL, ${stat.popularity}, ${stat.averagePosition}, ${stat.top4}, ${stat.top1}, '${stat.tier}', ${stat.totalGames})
				`;
				const insertResult = await mysqlBgs.query(insertQuery);
			}
		}
	}

	return { statusCode: 200, body: null };
};

const buildHeroInfo = (heroCardId: string, heroStatsResults: readonly any[]): BgsGlobalHeroStat => {
	const total = heroStatsResults.map(result => result.count).reduce((a, b) => a + b, 0);
	const heroStatsForHero = heroStatsResults.filter(result => result.playerCardId === heroCardId);
	const totalGamesPlayedForHero = heroStatsForHero.map(result => result.count).reduce((a, b) => a + b, 0) || 0;
	const averagePosition =
		(heroStatsForHero.map(result => result.additionalResult * result.count).reduce((a, b) => a + b, 0) || 0) /
		totalGamesPlayedForHero;
	const top4Percentage =
		(100 *
			(heroStatsForHero
				.filter(result => result.additionalResult <= 4)
				.map(result => result.count)
				.reduce((a, b) => a + b, 0) || 0)) /
		totalGamesPlayedForHero;
	const top1Percentage =
		(100 *
			(heroStatsForHero
				.filter(result => result.additionalResult === 1)
				.map(result => result.count)
				.reduce((a, b) => a + b, 0) || 0)) /
		totalGamesPlayedForHero;
	return {
		id: heroCardId,
		popularity: (100 * totalGamesPlayedForHero) / total,
		averagePosition: averagePosition,
		top4: top4Percentage,
		top1: top1Percentage,
		tier: getTier(averagePosition),
		totalGames: totalGamesPlayedForHero,
	} as BgsGlobalHeroStat;
};

const getTier = (averagePosition: number): BgsHeroTier => {
	if (averagePosition < 3.7) {
		return 'S';
	} else if (averagePosition < 4.1) {
		return 'A';
	} else if (averagePosition < 4.4) {
		return 'B';
	} else if (averagePosition < 4.7) {
		return 'C';
	}
	return 'D';
};
