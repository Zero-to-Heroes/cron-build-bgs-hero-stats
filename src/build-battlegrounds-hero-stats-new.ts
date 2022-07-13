/* eslint-disable @typescript-eslint/no-use-before-define */
import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService, CardIds, Race } from '@firestone-hs/reference-data';
import { ServerlessMysql } from 'serverless-mysql';
import { gzipSync } from 'zlib';
import { BgsGlobalHeroStat2, BgsGlobalStats2, MmrPercentile } from './bgs-global-stats';
import { getConnection as getConnectionStats } from './db/rds';
import { S3 } from './db/s3';
import { formatDate, http, normalizeHeroCardId } from './utils/util-functions';

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

	// A basic approach could be to generate all files for all tribe combinations. That way,
	// the app will only query static files with all the info for the specific tribe combination
	const allTribes = extractAllTribes(rows);
	console.log('all tribes', allTribes);

	const tribePermutations = [null, ...combine(allTribes, 5)];
	// const tribePermutations = [null];
	console.log('tribe permutations, should be 127 (126 + 1), because 9 tribes', tribePermutations.length);
	// console.log('tribe permutations', tribePermutations);
	for (const tribes of tribePermutations) {
		// console.log('handling tribes', index++, tribes);
		const tribesStr = !!tribes?.length ? tribes.join(',') : null;
		const statsForTribes: BgsGlobalStats2 = {
			lastUpdateDate: formatDate(new Date()),
			mmrPercentiles: mmrPercentiles,
			heroStats: buildHeroes(rows, lastPatch, mmrPercentiles, tribesStr),
			allTribes: allTribes,
		};
		// console.log('\tstats for tribes', tribes, );
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
				[
					mmrPercentile,
					// So that we also include rows where data collection failed
					rows.filter(row => mmrPercentile.percentile === 100 || row.rating >= mmrPercentile.mmr),
				] as [MmrPercentile, readonly InternalBgsRow[]],
		)
		.map(([mmr, rows]) => {
			// console.log('building heroes for mmr', mmr.percentile, rows.length);
			return buildHeroesForMmr(rows, lastPatch, tribesStr, mmr).map(stat => ({
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
	mmr: MmrPercentile,
): readonly BgsGlobalHeroStat2[] => {
	const rowsWithTribes = !!tribesStr
		? rows.filter(row => !!row.tribes).filter(row => row.tribes === tribesStr)
		: rows;
	console.log(
		'\tNumber of total rows matching tribes',
		tribesStr,
		mmr.percentile,
		rowsWithTribes.length,
		rows.length,
	);
	const allTimeHeroes = buildHeroStats(rowsWithTribes, 'all-time', tribesStr);

	const rowsForLastPatch = rowsWithTribes.filter(
		row =>
			row.buildNumber >= lastPatch.number ||
			row.creationDate > new Date(new Date(lastPatch.date).getTime() + 24 * 60 * 60 * 1000),
	);
	console.log(
		'\tNumber of last patch rows matching tribes',
		tribesStr,
		mmr.percentile,
		rowsForLastPatch.length,
		lastPatch.number,
	);
	const lastPatchHeroes = buildHeroStats(rowsForLastPatch, 'last-patch', tribesStr);

	const rowsForLastThree = rowsWithTribes.filter(
		row => row.creationDate >= new Date(new Date().getTime() - 3 * 24 * 60 * 60 * 1000),
	);
	console.log('\tNumber of last three rows matching tribes', tribesStr, mmr.percentile, rowsForLastThree.length);
	const threeDaysHeroes = buildHeroStats(rowsForLastThree, 'past-three', tribesStr);

	const rowsForLastSeven = rowsWithTribes.filter(
		row => row.creationDate >= new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000),
	);
	console.log('\tNumber of last seven rows matching tribes', tribesStr, mmr.percentile, rowsForLastSeven.length);
	const sevenDaysHeroes = buildHeroStats(rowsForLastSeven, 'past-seven', tribesStr);

	// console.log('\tbuilt heroes for mmr', tribesStr);
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
		// console.log('building combatWinrate', row);
		if (!row.combatWinrate?.length) {
			continue;
		}

		let parsed: readonly { turn: number; winrate: number }[] = null;
		try {
			parsed = JSON.parse(row.combatWinrate);
			// console.log('parsed', parsed);
			if (!parsed?.length) {
				continue;
			}
		} catch (e) {
			console.error('Could not parse combat winrate', row.id, e);
			continue;
		}

		if (debug) {
			// console.log('handling combat winrate', parsed);
		}

		for (const turnInfo of parsed) {
			if (turnInfo.turn === 0 || turnInfo.winrate == null) {
				continue;
			}
			if (debug) {
				// console.log('\t turnInfo', turnInfo);
			}
			const existingInfo = data['' + turnInfo.turn] ?? { dataPoints: 0, totalWinrate: 0 };
			if (debug) {
				// console.log('\t existingInfo', existingInfo);
			}
			existingInfo.dataPoints = existingInfo.dataPoints + 1;
			existingInfo.totalWinrate = existingInfo.totalWinrate + Math.round(turnInfo.winrate);
			if (debug) {
				// console.log('\t existingInfo after', existingInfo);
			}
			data['' + turnInfo.turn] = existingInfo;
			if (debug) {
				// console.log('\t data', data);
			}
		}
		// console.log('existingInfo', existingInfo);
	}

	if (debug) {
		// console.log('\t data', data);
	}
	const result: { turn: number; dataPoints: number; totalWinrate: number }[] = Object.keys(data).map(turn => ({
		turn: +turn,
		dataPoints: data[turn].dataPoints,
		totalWinrate: data[turn].totalWinrate,
	}));
	if (debug) {
		// console.log('\t result', result);
	}
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
		ORDER BY id DESC
		LIMIT 1000000
	`;
	console.log('running query', query);
	const rows: readonly InternalBgsRow[] = await mysql.query(query);
	console.log('rows', rows?.length, rows[0]);
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
	// console.debug('percentiles', median, top25, top10, top1);
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
