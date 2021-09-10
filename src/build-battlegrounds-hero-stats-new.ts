/* eslint-disable @typescript-eslint/no-use-before-define */
import { AllCardsService, Race } from '@firestone-hs/reference-data';
import { ServerlessMysql } from 'serverless-mysql';
import { gzipSync } from 'zlib';
import { BgsGlobalHeroStat2, BgsGlobalStats2, MmrPercentile } from './bgs-global-stats';
import { getConnection as getConnectionStats } from './db/rds';
import { S3 } from './db/s3';
import { formatDate, groupByFunction, http } from './utils/util-functions';

const s3 = new S3();
const allCards = new AllCardsService();

// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.
// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event): Promise<any> => {
	await handleNewStats();
};

export const handleNewStats = async () => {
	await allCards.initializeCardsDb();
	const lastPatch = await getLastBattlegroundsPatch();
	const mysql = await getConnectionStats();

	const rows: readonly InternalBgsRow[] = await loadRows(mysql, lastPatch);
	const mmrPercentiles: readonly MmrPercentile[] = buildMmrPercentiles(rows);
	// const stats: BgsGlobalStats2 = {
	// 	lastUpdateDate: formatDate(new Date()),
	// 	mmrPercentiles: mmrPercentiles,
	// 	heroStats: buildHeroes(rows, lastPatch, mmrPercentiles),
	// };
	// const stringResults = JSON.stringify(stats);
	// const gzippedResults = gzipSync(stringResults);
	// await s3.writeFile(
	// 	gzippedResults,
	// 	'static.zerotoheroes.com',
	// 	'api/bgs-global-stats.gz.json',
	// 	'application/json',
	// 	'gzip',
	// );

	// We also build a lighter version without the tribes, that will be loaded on
	// the app's startup
	// The more complex version will be queried on demand for specific filters
	// const statsAllTribes: BgsGlobalStats2 = {
	// 	lastUpdateDate: formatDate(new Date()),
	// 	mmrPercentiles: mmrPercentiles,
	// 	heroStats: buildHeroes(rows, lastPatch, mmrPercentiles, null),
	// };
	// const stringResultsLight = JSON.stringify(statsAllTribes);
	// const gzippedResultsAllTribes = gzipSync(stringResultsLight);
	// await s3.writeFile(
	// 	gzippedResultsAllTribes,
	// 	'static.zerotoheroes.com',
	// 	'api/bgs/bgs-global-stats-all-tribes.gz.json',
	// 	'application/json',
	// 	'gzip',
	// );

	// A basic approach could be to generate all files for all tribe combinations. That way,
	// the app will only query static files with all the info for the specific tribe combination
	const allTribes = extractAllTribes(rows);
	console.log('all tribes', allTribes);

	const tribePermutations = [null, ...combine(allTribes, 5)];
	console.log('tribe permutations, should be 56, because 8 tribes', tribePermutations.length);
	console.log('tribe permutations', tribePermutations);
	for (const tribes of tribePermutations) {
		console.log('handling tribes', tribes);
		const tribesStr = !!tribes?.length ? tribes.join(',') : null;
		const statsForTribes: BgsGlobalStats2 = {
			lastUpdateDate: formatDate(new Date()),
			mmrPercentiles: mmrPercentiles,
			heroStats: buildHeroes(rows, lastPatch, mmrPercentiles, tribesStr),
		};
		const stringResults = JSON.stringify(statsForTribes);
		const gzippedResults = gzipSync(stringResults);
		await s3.writeFile(
			gzippedResults,
			'static.zerotoheroes.com',
			`api/bgs/bgs-global-stats-${!!tribes?.length ? tribes.join('-') : 'all-tribes'}.gz.json`,
			'application/json',
			'gzip',
		);
	}

	await mysql.end();

	return { statusCode: 200, body: null };
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
	lastPatch: PatchInfo,
	mmrPercentiles: readonly MmrPercentile[],
	tribesStr: string,
): readonly BgsGlobalHeroStat2[] => {
	return mmrPercentiles
		.map(
			mmrPercentile =>
				[mmrPercentile, rows.filter(row => row.rating >= mmrPercentile.mmr)] as [
					MmrPercentile,
					readonly InternalBgsRow[],
				],
		)
		.map(([mmr, rows]) => {
			// console.log('building heroes for mme', mmr.percentile);
			return buildHeroesForMmr(rows, lastPatch, tribesStr).map(stat => ({
				...stat,
				mmrPercentile: mmr.percentile,
			}));
		})
		.map(info => {
			// console.log('reducing');
			return info;
		})
		.reduce((a, b) => [...a, ...b], []);
};

const buildHeroesForMmr = (
	rows: readonly InternalBgsRow[],
	lastPatch: PatchInfo,
	tribesStr: string,
): readonly BgsGlobalHeroStat2[] => {
	const rowsWithTribes = !!tribesStr
		? rows.filter(row => !!row.tribes).filter(row => row.tribes === tribesStr)
		: rows;
	// console.debug('rowsWithTribes', rowsWithTribes.length, tribesStr, rowsWithTribes[0].tribes, rows[0].tribes);

	const allTimeHeroes = buildHeroStats(rowsWithTribes, 'all-time', tribesStr);
	const lastPatchHeroes = buildHeroStats(
		rowsWithTribes.filter(
			row => row.buildNumber >= lastPatch.number && row.creationDate > new Date(lastPatch.date),
		),
		'last-patch',
		tribesStr,
	);
	const threeDaysHeroes = buildHeroStats(
		rowsWithTribes.filter(row => row.creationDate >= new Date(new Date().getTime() - 3 * 24 * 60 * 60 * 1000)),
		'past-three',
		tribesStr,
	);
	const sevenDaysHeroes = buildHeroStats(
		rowsWithTribes.filter(row => row.creationDate >= new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000)),
		'past-seven',
		tribesStr,
	);
	return [...allTimeHeroes, ...lastPatchHeroes, ...threeDaysHeroes, ...sevenDaysHeroes];
};

const buildHeroStats = (
	rows: readonly InternalBgsRow[],
	period: string,
	tribesStr: string,
): readonly BgsGlobalHeroStat2[] => {
	const grouped: { [groupingKey: string]: readonly InternalBgsRow[] } = !!tribesStr
		? groupByFunction((row: InternalBgsRow) => `${row.heroCardId}-${row.tribes}-${row.darkmoonPrizes}`)(rows)
		: groupByFunction((row: InternalBgsRow) => `${row.heroCardId}-${row.darkmoonPrizes}`)(rows);

	return Object.values(grouped).map(groupedRows => {
		const ref = groupedRows[0];

		const placementDistribution = buildPlacementDistribution(groupedRows);
		const combatWinrate = buildCombatWinrate(groupedRows);
		const warbandStats = buildWarbandStats(groupedRows);

		return {
			date: period,
			cardId: ref.heroCardId,
			totalMatches: groupedRows.length,
			// tribes:
			// 	!!ref.tribes?.length && !!tribesStr
			// 		? (ref.tribes.split(',').map(tribe => +tribe as Race) as readonly Race[])
			// 		: null,
			placementDistribution: placementDistribution,
			combatWinrate: combatWinrate,
			warbandStats: warbandStats,
		} as BgsGlobalHeroStat2;
	});
};

const buildWarbandStats = (
	rows: readonly InternalBgsRow[],
): readonly { turn: number; dataPoints: number; totalStats: number }[] => {
	const data: { [turn: string]: { dataPoints: number; totalStats: number } } = {};
	for (const row of rows) {
		if (!row.warbandStats?.length) {
			continue;
		}

		const parsed: readonly { turn: number; totalStats: number }[] = JSON.parse(row.warbandStats);
		if (!parsed?.length) {
			continue;
		}

		for (const turnInfo of parsed) {
			if (turnInfo.turn === 0) {
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
	const data: { [turn: string]: { dataPoints: number; totalWinrate: number } } = {};
	for (const row of rows) {
		// console.log('building combatWinrate', row);
		if (!row.combatWinrate?.length) {
			continue;
		}

		const parsed: readonly { turn: number; winrate: number }[] = JSON.parse(row.combatWinrate);
		// console.log('parsed', parsed);
		if (!parsed?.length) {
			continue;
		}

		for (const turnInfo of parsed) {
			if (turnInfo.turn === 0) {
				continue;
			}
			const existingInfo = data['' + turnInfo.turn] ?? { dataPoints: 0, totalWinrate: 0 };
			existingInfo.dataPoints = existingInfo.dataPoints + 1;
			existingInfo.totalWinrate = existingInfo.totalWinrate + Math.round(turnInfo.winrate);
			data['' + turnInfo.turn] = existingInfo;
		}
		// console.log('existingInfo', existingInfo);
	}

	const result: { turn: number; dataPoints: number; totalWinrate: number }[] = Object.keys(data).map(turn => ({
		turn: +turn,
		dataPoints: data[turn].dataPoints,
		totalWinrate: data[turn].totalWinrate,
	}));
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

const loadRows = async (mysql: ServerlessMysql, patch: PatchInfo): Promise<readonly InternalBgsRow[]> => {
	console.log('loading rows', patch);
	const query = `
		SELECT * FROM bgs_run_stats
		WHERE creationDate > DATE_SUB(NOW(), INTERVAL 30 DAY)
	`;
	console.log('running query', query);
	const rows: readonly InternalBgsRow[] = await mysql.query(query);
	console.log('rows', rows?.length, rows[0]);
	return rows.filter(row => row.heroCardId.startsWith('TB_BaconShop_') || row.heroCardId.startsWith('BG'));
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
	const top1 = sortedMmrs[Math.floor((sortedMmrs.length / 100) * 99)];
	console.debug('percentiles', median, top25, top10, top1);
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
		{
			percentile: 1,
			mmr: top1,
		},
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
