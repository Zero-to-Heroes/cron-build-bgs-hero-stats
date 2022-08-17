/* eslint-disable @typescript-eslint/no-use-before-define */
import { getConnection, groupByFunction, http, logBeforeTimeout, logger, S3 } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService, CardIds, Race } from '@firestone-hs/reference-data';
import { Context } from 'aws-lambda';
import AWS from 'aws-sdk';
import { ServerlessMysql } from 'serverless-mysql';
import { Readable } from 'stream';
import { gzipSync } from 'zlib';
import { BgsGlobalHeroStat2, BgsGlobalStats2, MmrPercentile } from './bgs-global-stats';
import { formatDate, normalizeHeroCardId } from './utils/util-functions';

const s3 = new S3();
const allCards = new AllCardsService();
const lambda = new AWS.Lambda();

const allTimePeriods: ('all-time' | 'past-three' | 'past-seven' | 'last-patch')[] = [
	'all-time',
	'past-three',
	'past-seven',
	'last-patch',
];

// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.
// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event, context: Context): Promise<any> => {
	await handleNewStats(event, context);
};

export const handleNewStats = async (event, context: Context) => {
	const cleanup = logBeforeTimeout(context);
	logger.log('event', event);
	await allCards.initializeCardsDb();
	const lastPatch = await getLastBattlegroundsPatch();

	if (event.permutation) {
		const rows: readonly InternalBgsRow[] = await readRowsFromS3();
		logger.log('read rows', rows?.length);
		for (const timePeriod of allTimePeriods) {
			await handlePermutation(event.permutation, timePeriod, event.allTribes, rows, lastPatch);
		}
	} else {
		const mysql = await getConnection();
		const rows: readonly InternalBgsRow[] = await loadRows(mysql);
		await mysql.end();
		await saveRowsOnS3(rows);
		await dispatchNewLambdas(rows, context);
	}

	cleanup();
	return { statusCode: 200, body: null };
};

const dispatchNewLambdas = async (rows: readonly InternalBgsRow[], context: Context) => {
	const allTribes = extractAllTribes(rows);
	logger.log('all tribes', allTribes);
	const tribePermutations: ('all' | Race[])[] = ['all', ...combine(allTribes, 5)];
	logger.log('tribe permutations, should be 127 (126 + 1), because 9 tribes', tribePermutations.length);
	for (const tribes of tribePermutations) {
		logger.log('handling tribes', tribes);
		const newEvent = {
			permutation: tribes,
			allTribes: allTribes,
		};
		const params = {
			FunctionName: context.functionName,
			InvocationType: 'Event',
			LogType: 'Tail',
			Payload: JSON.stringify(newEvent),
		};
		logger.log('\tinvoking lambda', params);
		const result = await lambda
			.invoke({
				FunctionName: context.functionName,
				InvocationType: 'Event',
				LogType: 'Tail',
				Payload: JSON.stringify(newEvent),
			})
			.promise();
		logger.log('\tinvocation result', result);
	}
};

const handlePermutation = async (
	tribes: 'all' | readonly Race[],
	timePeriod: 'all-time' | 'past-three' | 'past-seven' | 'last-patch',
	allTribes: readonly Race[],
	rows: readonly InternalBgsRow[],
	lastPatch: PatchInfo,
) => {
	const rowsForTimePeriod = filterRowsForTimePeriod(rows, timePeriod, lastPatch);
	const tribesStr = tribes === 'all' ? null : tribes.join(',');
	const rowsWithTribes = !!tribesStr
		? rowsForTimePeriod.filter(row => !!row.tribes).filter(row => row.tribes === tribesStr)
		: rowsForTimePeriod;
	const mmrPercentiles: readonly MmrPercentile[] = buildMmrPercentiles(rowsWithTribes);
	logger.log('handling permutation', tribes);
	const stats: readonly BgsGlobalHeroStat2[] = buildHeroes(rowsForTimePeriod, mmrPercentiles).map(stat => ({
		...stat,
		tribes: tribes === 'all' ? allTribes : tribes,
		date: timePeriod,
	}));
	const statsForTribes: BgsGlobalStats2 = {
		lastUpdateDate: formatDate(new Date()),
		mmrPercentiles: mmrPercentiles,
		heroStats: stats,
		allTribes: allTribes,
	};
	logger.log('\tbuilt stats', statsForTribes.heroStats?.length);
	const tribesSuffix = tribes === 'all' ? 'all-tribes' : tribes.join('-');
	const timeSuffix = timePeriod;
	await s3.writeFile(
		gzipSync(JSON.stringify(statsForTribes)),
		'static.zerotoheroes.com',
		`api/bgs/heroes/bgs-global-stats-${tribesSuffix}-${timeSuffix}.gz.json`,
		'application/json',
		'gzip',
	);
};

const saveRowsOnS3 = async (rows: readonly InternalBgsRow[]) => {
	logger.log('saving rows on s3', rows.length);
	await s3.writeArrayAsMultipart(rows, 'static.zerotoheroes.com', `api/bgs/working-rows.json`, 'application/json');
	logger.log('file saved');
};

const readRowsFromS3 = async (): Promise<readonly InternalBgsRow[]> => {
	return new Promise<readonly InternalBgsRow[]>((resolve, reject) => {
		let parseErrors = 0;
		let totalParsed = 0;
		const stream: Readable = s3.readStream('static.zerotoheroes.com', `api/bgs/working-rows.json`);
		const result: InternalBgsRow[] = [];
		let previousString = '';
		stream
			.on('data', chunk => {
				const str = Buffer.from(chunk).toString('utf-8');
				const newStr = previousString + str;
				const split = newStr.split('\n');
				const rows: readonly InternalBgsRow[] = split.slice(0, split.length - 1).map(row => {
					try {
						const result = JSON.parse(row);
						totalParsed++;
						return result;
					} catch (e) {
						// logger.warn('could not parse row', row);
						parseErrors++;
					}
				});
				previousString = split[split.length - 1];
				// logger.log('parsing errors', parseErrors, 'and successes', totalParsed);
				result.push(...rows);
			})
			.on('end', () => {
				const finalResult = result.filter(row => !!row);
				logger.log('stream end', result.length, finalResult.length);
				logger.log('parsing errors', parseErrors, 'and successes', totalParsed);
				resolve(finalResult);
			});
	});
};

// https://stackoverflow.com/a/47204248/548701
const combine = <T>(input: readonly T[], chooseN: number): T[][] => {
	const finalResult: T[][] = [];

	const intermediateResult = [];
	intermediateResult.length = chooseN;
	const combineInternal = <T>(input: readonly T[], chooseN: number, start = 0): void => {
		if (chooseN === 0) {
			finalResult.push([...intermediateResult].sort());
			return;
		}
		for (let i = start; i <= input.length - chooseN; i++) {
			intermediateResult[intermediateResult.length - chooseN] = input[i];
			combineInternal(input, chooseN - 1, i + 1);
		}
	};
	combineInternal(input, chooseN, 0);

	return finalResult;
};

const extractAllTribes = (rows: readonly InternalBgsRow[]): readonly Race[] => {
	return [
		...new Set(
			rows
				.map(row => row.tribes)
				.filter(tribes => !!tribes?.length)
				.map(tribes => tribes.split(',').map(strTribe => parseInt(strTribe) as Race))
				.reduce((a, b) => [...new Set(a.concat(b))], []),
		),
	];
};

const buildHeroes = (
	rows: readonly InternalBgsRow[],
	mmrPercentiles: readonly MmrPercentile[],
): readonly BgsGlobalHeroStat2[] => {
	const mappedByMmr = mmrPercentiles.map(
		mmrPercentile =>
			[
				mmrPercentile,
				// So that we also include rows where data collection failed
				rows.filter(row => mmrPercentile.percentile === 100 || row.rating >= mmrPercentile.mmr),
			] as [MmrPercentile, readonly InternalBgsRow[]],
	);
	logger.log('mappedByMmr');
	return mappedByMmr
		.map(([mmr, rows]) => {
			logger.log('building heroes for mmr', mmr.percentile, rows.length);
			return buildHeroStats(rows).map(stat => ({
				...stat,
				mmrPercentile: mmr.percentile,
			}));
		})
		.reduce((a, b) => [...a, ...b], []);
};

const buildHeroStats = (rows: readonly InternalBgsRow[]): readonly BgsGlobalHeroStat2[] => {
	const grouped: { [groupingKey: string]: readonly InternalBgsRow[] } = groupByFunction(
		// (row: InternalBgsRow) => `${row.heroCardId}-${row.darkmoonPrizes}`,
		(row: InternalBgsRow) => row.heroCardId,
	)(rows);
	logger.log('grouped', Object.keys(grouped).length);

	const result = Object.values(grouped).map(groupedRows => {
		const ref = groupedRows[0];
		const placementDistribution = buildPlacementDistribution(groupedRows);
		const combatWinrate = buildCombatWinrate(groupedRows);
		const warbandStats = buildWarbandStats(groupedRows);
		return {
			cardId: ref.heroCardId,
			totalMatches: groupedRows.length,
			placementDistribution: placementDistribution,
			combatWinrate: combatWinrate,
			warbandStats: warbandStats,
		} as BgsGlobalHeroStat2;
	});
	logger.log('built result');
	return result;
};

const buildWarbandStats = (
	rows: readonly InternalBgsRow[],
): readonly { turn: number; dataPoints: number; totalStats: number }[] => {
	const data: { [turn: string]: { dataPoints: number; totalStats: number } } = {};
	// Before that, there was an issue with disconnects, where the first turn after the
	// reconnect would be turn 0, leading to an inflation of early turn stats
	const validRows = rows.filter(row => row.id > 5348374);
	for (const row of validRows) {
		if (!row.warbandStats?.length) {
			continue;
		}

		const parsed: readonly { turn: number; totalStats: number }[] = JSON.parse(row.warbandStats);
		if (!parsed?.length) {
			continue;
		}

		for (const turnInfo of parsed) {
			if (turnInfo.turn === 0 || turnInfo.totalStats == null || isNaN(turnInfo.totalStats)) {
				continue;
			}
			// To avoid polluting the stats with big Tarecgosa outliers
			if (turnInfo.totalStats > 20000) {
				continue;
			}
			const existingInfo = data['' + turnInfo.turn] ?? { dataPoints: 0, totalStats: 0 };
			existingInfo.dataPoints = existingInfo.dataPoints + 1;
			existingInfo.totalStats = existingInfo.totalStats + Math.round(turnInfo.totalStats);
			data['' + turnInfo.turn] = existingInfo;
		}
	}

	const result: { turn: number; dataPoints: number; totalStats: number }[] = Object.keys(data).map(turn => ({
		turn: +turn,
		dataPoints: data[turn].dataPoints,
		totalStats: data[turn].totalStats,
	}));
	return result;
};

const buildCombatWinrate = (
	rows: readonly InternalBgsRow[],
): readonly { turn: number; dataPoints: number; totalWinrate: number }[] => {
	const ref = rows[0];
	const debug = ref.heroCardId === 'BG21_HERO_000';

	const data: { [turn: string]: { dataPoints: number; totalWinrate: number } } = {};
	for (const row of rows) {
		// logger.debug('building combatWinrate', row);
		if (!row.combatWinrate?.length) {
			continue;
		}

		let parsed: readonly { turn: number; winrate: number }[] = null;
		try {
			parsed = JSON.parse(row.combatWinrate);
			// logger.debug('parsed', parsed);
			if (!parsed?.length) {
				continue;
			}
		} catch (e) {
			logger.error('Could not parse combat winrate', row.id, e);
			continue;
		}

		// if (debug) {
		// 	logger.log('handling combat winrate', parsed);
		// }

		for (const turnInfo of parsed) {
			if (turnInfo.turn === 0 || turnInfo.winrate == null) {
				continue;
			}
			// if (debug) {
			// 	logger.log('\t turnInfo', turnInfo);
			// }
			const existingInfo = data['' + turnInfo.turn] ?? { dataPoints: 0, totalWinrate: 0 };
			// if (debug) {
			// 	logger.log('\t existingInfo', existingInfo);
			// }
			existingInfo.dataPoints = existingInfo.dataPoints + 1;
			existingInfo.totalWinrate = existingInfo.totalWinrate + Math.round(turnInfo.winrate);
			// if (debug) {
			// 	logger.log('\t existingInfo after', existingInfo);
			// }
			data['' + turnInfo.turn] = existingInfo;
			// if (debug) {
			// 	logger.log('\t data', data);
			// }
		}
	}

	// if (debug) {
	// 	logger.log('\t data', data);
	// }
	const result: { turn: number; dataPoints: number; totalWinrate: number }[] = Object.keys(data).map(turn => ({
		turn: +turn,
		dataPoints: data[turn].dataPoints,
		totalWinrate: data[turn].totalWinrate,
	}));
	// if (debug) {
	// 	logger.log('\t result', result);
	// }
	return result;
};

const buildPlacementDistribution = (
	rows: readonly InternalBgsRow[],
): readonly { rank: number; totalMatches: number }[] => {
	const placementDistribution: { rank: number; totalMatches: number }[] = [];
	const groupedByPlacement: { [placement: string]: readonly InternalBgsRow[] } = groupByFunction(
		(res: InternalBgsRow) => '' + res.rank,
	)(rows);
	Object.keys(groupedByPlacement).forEach(placement =>
		placementDistribution.push({ rank: +placement, totalMatches: groupedByPlacement[placement].length }),
	);
	return placementDistribution;
};

const loadRows = async (mysql: ServerlessMysql): Promise<readonly InternalBgsRow[]> => {
	// We actually use all the fields
	const query = `
		SELECT *
		FROM bgs_run_stats
		WHERE creationDate > DATE_SUB(NOW(), INTERVAL 30 DAY);
	`;
	logger.log('running query', query);
	const rows: readonly InternalBgsRow[] = await mysql.query(query);
	logger.log('rows', rows?.length, rows[0]);
	return rows
		.filter(row => row.heroCardId.startsWith('TB_BaconShop_') || row.heroCardId.startsWith('BG'))
		.filter(
			row =>
				row.heroCardId !== CardIds.ArannaStarseeker_ArannaUnleashedTokenBattlegrounds &&
				row.heroCardId !== CardIds.QueenAzshara_NagaQueenAzsharaToken,
		)
		.map(row => ({
			...row,
			heroCardId: normalizeHeroCardId(row.heroCardId),
		}));
};

const filterRowsForTimePeriod = (
	rows: readonly InternalBgsRow[],
	timePeriod: 'all-time' | 'past-three' | 'past-seven' | 'last-patch',
	lastPatch: PatchInfo,
): readonly InternalBgsRow[] => {
	switch (timePeriod) {
		case 'last-patch':
			return rows.filter(
				row =>
					row.buildNumber >= lastPatch.number ||
					new Date(row.creationDate) > new Date(new Date(lastPatch.date).getTime() + 24 * 60 * 60 * 1000),
			);
		case 'past-three':
			return rows.filter(row => new Date(row.creationDate) > new Date(new Date().getTime() - 3 * 60 * 60 * 1000));
		case 'past-seven':
			return rows.filter(row => new Date(row.creationDate) > new Date(new Date().getTime() - 7 * 60 * 60 * 1000));
		case 'all-time':
		default:
			return rows;
	}
};

const getLastBattlegroundsPatch = async (): Promise<PatchInfo> => {
	const patchInfo = await http(`https://static.zerotoheroes.com/hearthstone/data/patches.json`);
	const structuredPatch = JSON.parse(patchInfo);
	const patchNumber = structuredPatch.currentBattlegroundsMetaPatch;
	return structuredPatch.patches.find(patch => patch.number === patchNumber);
};

const buildMmrPercentiles = (rows: readonly InternalBgsRow[]): readonly MmrPercentile[] => {
	const sortedMmrs = rows.map(row => row.rating).sort((a, b) => a - b);
	const median = sortedMmrs[Math.floor(sortedMmrs.length / 2)];
	const top25 = sortedMmrs[Math.floor((sortedMmrs.length / 4) * 3)];
	const top10 = sortedMmrs[Math.floor((sortedMmrs.length / 10) * 9)];
	// const top1 = sortedMmrs[Math.floor((sortedMmrs.length / 100) * 99)];
	// logger.debug('percentiles', median, top25, top10, top1);
	return [
		{
			percentile: 100,
			mmr: 0,
		},
		{
			percentile: 50,
			mmr: median,
		},
		{
			percentile: 25,
			mmr: top25,
		},
		{
			percentile: 10,
			mmr: top10,
		},
		// {
		// 	percentile: 1,
		// 	mmr: top1,
		// },
	];
};

interface InternalBgsRow {
	readonly id: number;
	readonly creationDate: Date;
	readonly buildNumber: number;
	readonly rating: number;
	readonly heroCardId: string;
	readonly rank: number;
	readonly reviewId: string;
	readonly tribes: string;
	readonly darkmoonPrizes: boolean;
	readonly combatWinrate: string;
	readonly warbandStats: string;
}

interface PatchInfo {
	readonly number: number;
	readonly version: string;
	readonly name: string;
	readonly date: string;
}
