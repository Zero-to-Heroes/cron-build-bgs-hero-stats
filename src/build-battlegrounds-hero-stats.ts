/* eslint-disable @typescript-eslint/no-use-before-define */
import { ServerlessMysql } from 'serverless-mysql';
import { BgsGlobalHeroStat, BgsHeroTier } from './bgs-global-hero-stat';
import { getConnection as getConnectionStats } from './db/rds';
import { getConnection as getConnectionBgs } from './db/rds-bgs';

// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.
// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event): Promise<any> => {
	console.log('event', JSON.stringify(event, null, 4));
	const mysqlBgs = await getConnectionBgs();
	const mysqlStats = await getConnectionStats();

	const buildNumberResult: any[] = await mysqlStats.query(
		'SELECT buildNumber FROM replay_summary ORDER BY buildNumber desc LIMIT 1',
	);
	const buildNumber = buildNumberResult[0].buildNumber;
	console.log('buildNumber', buildNumber);

	await updateAggregatedStats(mysqlBgs, mysqlStats, buildNumber);
	await updateLastPeriodStats(mysqlBgs, mysqlStats, buildNumber);

	return { statusCode: 200, body: null };
};

const updateAggregatedStats = async (mysqlBgs: ServerlessMysql, mysqlStats: ServerlessMysql, buildNumber: number) => {
	// This won't be fully accurate, as not all update will be installed simulatenously, but it's good enough
	const now = Date.now();
	const earliestStartDate = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
	console.log('earliestStartDate', earliestStartDate);
	await updateStats(mysqlBgs, mysqlStats, earliestStartDate, buildNumber, false);
};

const updateLastPeriodStats = async (mysqlBgs: ServerlessMysql, mysqlStats: ServerlessMysql, buildNumber: number) => {
	// Get all the reviews from the last hour
	const now = Date.now();
	const earliestStartDate = new Date(now - 60 * 60 * 1000).toISOString();
	console.log('earliestStartDate', earliestStartDate);
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
		WHERE creationDate > '${creationDate}'
		AND gameMode = 'battlegrounds'
		AND playerCardId like 'TB_BaconShop_Hero%'
		AND buildNumber = ${buildNumber}
		GROUP BY playerCardId
	`;
	console.log('running query', allHeroesQuery);
	const allHeroesResult: readonly any[] = await mysqlStats.query(allHeroesQuery);
	console.log('dbResults', allHeroesResult);
	// We don't use the battlegrounds placement stuff because it's not reliable when the player is not first place
	const heroPopularityQuery = `
		SELECT playerCardId, avg(additionalResult) as position, count(*) as count
		FROM replay_summary
		WHERE creationDate > '${creationDate}'
		AND gameMode = 'battlegrounds'
		AND playerCardId like 'TB_BaconShop_Hero%'
		AND buildNumber = ${buildNumber}
		AND playerRank > 6000
		GROUP BY playerCardId
	`;
	// const heroPopularityQuery = `
	// 	SELECT playerCardId, additionalResult
	// 	FROM replay_summary
	// 	WHERE creationDate > '${creationDate}'
	// 	AND gameMode = 'battlegrounds'
	// `;
	console.log('running query', heroPopularityQuery);
	const heroPopularityResults: readonly any[] = await mysqlStats.query(heroPopularityQuery);
	console.log('dbResults', heroPopularityResults);

	const heroTop4Query = `
		SELECT playerCardId, count(*) as count
		FROM replay_summary
		WHERE creationDate > '${creationDate}'
		AND gameMode = 'battlegrounds'
		AND playerCardId like 'TB_BaconShop_Hero%'
		AND buildNumber = ${buildNumber}
		AND additionalResult <= 4
		AND playerRank > 6000
		GROUP BY playerCardId
	`;
	// console.log('running query', heroPopularityQuery);
	const heroTop4Results: readonly any[] = await mysqlStats.query(heroTop4Query);
	// console.log('dbResults', heroTop4Results);

	const heroTop1Query = `
		SELECT playerCardId, count(*) as count
		FROM replay_summary
		WHERE creationDate > '${creationDate}'
		AND gameMode = 'battlegrounds'
		AND playerCardId like 'TB_BaconShop_Hero%'
		AND buildNumber = ${buildNumber}
		AND additionalResult = 1
		AND playerRank > 6000
		GROUP BY playerCardId
	`;
	// console.log('running query', heroPopularityQuery);
	const heroTop1Results: readonly any[] = await mysqlStats.query(heroTop1Query);
	// console.log('dbResults', heroTop4Results);
	// console.log('hero results', heroPopularityResults.length);
	// const grouped = groupBy(result => result.playerCardId)(heroPopularityResults);
	// console.log('grouped', grouped);
	const total = heroPopularityResults.map(result => result.count).reduce((a, b) => a + b, 0);
	const stats: BgsGlobalHeroStat[] = allHeroesResult
		.map(
			result =>
				heroPopularityResults.find(r => r.playerCardId === result.playerCardId) || {
					playerCardId: result.playerCardId,
				},
		)
		.map(
			result =>
				({
					id: result.playerCardId,
					popularity: (100 * (result.count || 0)) / total,
					averagePosition: result.position || 0,
					top4: !result.count
						? 0
						: (100 *
								heroTop4Results
									.filter(r => r.playerCardId === result.playerCardId)
									.map(r => r.count || 0)
									.reduce((a, b) => a + b, 0)) /
						  result.count,
					top1: !result.count
						? 0
						: (100 *
								heroTop1Results
									.filter(r => r.playerCardId === result.playerCardId)
									.map(r => r.count)
									.reduce((a, b) => a + b, 0)) /
						  result.count,
					tier: getTier(result.position),
				} as BgsGlobalHeroStat),
		);
	console.log('build stats', JSON.stringify(stats, null, 4));
	console.log('from heroPopularityResults', JSON.stringify(heroPopularityResults, null, 4));

	// const heroCardIds = stats.map(stat => "'" + stat.id + "'").join(',');
	const now = new Date().toISOString();
	if (insertCreationDate) {
		const values = stats
			.map(
				stat =>
					`('${stat.id}', ${insertCreationDate ? "'" + now + "'" : null}, ${stat.popularity}, 
					${stat.averagePosition}, ${stat.top4}, ${stat.top1}, '${stat.tier}')`,
			)
			.join(',');
		const insertQuery = `
				INSERT INTO bgs_hero_stats
				(heroCardId, date, popularity, averagePosition, top4, top1, tier)
				VALUES ${values}
			`;
		console.log('running update query', insertQuery);
		const updateResult = await mysqlBgs.query(insertQuery);
		console.log('data inserted', updateResult);
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
						tier = '${stat.tier}'
					WHERE heroCardId = '${stat.id}' AND date is NULL
				`;
			console.log('running update query', updateQuery);
			const updateResult: any = await mysqlBgs.query(updateQuery);
			console.log('data updated?', updateResult, updateResult.affectedRows);
			// Non-existing data
			if (updateResult.affectedRows === 0) {
				const insertQuery = `
					INSERT INTO bgs_hero_stats
					(heroCardId, date, popularity, averagePosition, top4, top1, tier)
					VALUES ('${stat.id}', NULL, ${stat.popularity}, ${stat.averagePosition}, ${stat.top4}, ${stat.top1}, '${stat.tier}')
				`;
				console.log('running insert query', insertQuery);
				const insertResult = await mysqlBgs.query(insertQuery);
				console.log('data inserted?', insertResult);
			}
		}
		// First delete existing results
		// const deleteQuery = `
		// 	DELETE FROM bgs_hero_stats
		// 	WHERE heroCardId in (${heroCardIds}) AND date is NULL
		// `;
		// const deleteResult = await mysqlBgs.query(deleteQuery);
		// console.log('data removed', deleteResult);
		// const updateQuery = `
		// 		UPDATE bgs_hero_stats
		// 		(heroCardId, date, popularity, averagePosition)
		// 		VALUES ${values}
		// 	`;
	}

	return { statusCode: 200, body: null };
};

const getTier = (averagePosition: number): BgsHeroTier => {
	if (averagePosition < 3.7) {
		return 'S';
	} else if (averagePosition < 4) {
		return 'A';
	} else if (averagePosition < 4.4) {
		return 'B';
	} else if (averagePosition < 4.7) {
		return 'C';
	}
	return 'D';
};
