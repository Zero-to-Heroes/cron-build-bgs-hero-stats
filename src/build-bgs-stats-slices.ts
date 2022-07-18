/* eslint-disable @typescript-eslint/no-use-before-define */
import { getConnection, http, logBeforeTimeout, logger, S3 } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService, CardIds, Race } from '@firestone-hs/reference-data';
import { ObjectList } from 'aws-sdk/clients/s3';
import SqlString from 'sqlstring';
import { constants, gzipSync } from 'zlib';
import { InternalBgsGlobalStats, InternalBgsRow, RankGroup, Slice } from './internal-model';
import { buildStatsForTribes } from './slices/merger';
import { buildAllRankGroups, buildMmrPercentiles } from './slices/rank-groups';
import { buildNewSlice } from './slices/slice-builder';
import { combine, normalizeHeroCardId } from './utils/util-functions';

export const allCards = new AllCardsService();
const s3 = new S3();

const S3_BUCKET_NAME = 'static.zerotoheroes.com';
const S3_FOLDER = `api/bgs/heroes`;
const S3_FOLDER_SLICE = `${S3_FOLDER}/slices`;

// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.
// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event, context): Promise<any> => {
	const cleanup = logBeforeTimeout(context);
	await allCards.initializeCardsDb();

	const existingSlices: readonly Slice[] = await loadExistingSlices();
	logger.log('existingSlices', existingSlices.length, existingSlices[0]);
	const lastDataTimestamp: number = !existingSlices?.length
		? null
		: Math.max(...existingSlices.map(data => data.lastUpdateDate.getTime()));
	logger.log('lastDataTimestamp', lastDataTimestamp);
	const lastDataDate: Date = lastDataTimestamp ? new Date(lastDataTimestamp) : null;
	logger.log('lastDataDate', lastDataDate);

	const rows: readonly InternalBgsRow[] = await loadRows(lastDataDate);
	const validRows = rows
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
	logger.log('rows', validRows.length);

	const allTribes: readonly Race[] = extractAllTribes(rows);
	const allRankGroups: readonly RankGroup[] = buildAllRankGroups(existingSlices, rows);
	const newSlice = buildNewSlice(validRows, allRankGroups, allTribes);
	logger.log('newSlice', newSlice);
	await saveSingleSlice(newSlice);

	const allSlices = [...existingSlices, newSlice];
	await buildFinalStats(allSlices, allTribes);

	cleanup();
	return { statusCode: 200, body: null };
};

const buildFinalStats = async (allSlices: readonly Slice[], allTribes: readonly Race[]) => {
	const lastPatch = await getLastBattlegroundsPatch();
	const allTimePeriods: ('all-time' | 'past-three' | 'past-seven' | 'last-patch')[] = [
		'all-time',
		'past-three',
		'past-seven',
		'last-patch',
	];

	for (const timePeriod of allTimePeriods) {
		logger.log('building stats for time period', timePeriod);
		const tribePermutations = [null, ...combine(allTribes, 5)];
		for (const tribes of tribePermutations) {
			// logger.log('\thandling tribes', tribes);
			const relevantSlices = allSlices.filter(slice => isValidDate(slice.lastUpdateDate, timePeriod, lastPatch));
			const mmrPercentiles = buildMmrPercentiles(relevantSlices);
			const stats: InternalBgsGlobalStats = buildStatsForTribes(
				relevantSlices,
				tribes,
				mmrPercentiles,
				timePeriod,
			);
			// const mergedData: FinalBgsDataForTimePeriod = buildFinalStats(
			// 	relevantSlices,
			// 	mmrPercentiles,
			// 	allTribes,
			// 	timePeriod,
			// );
			await saveFinalFile(stats, tribes, timePeriod);
		}
	}
};

const isValidDate = (
	theDate: Date,
	timePeriod: 'all-time' | 'past-three' | 'past-seven' | 'last-patch',
	lastPatch: PatchInfo,
): boolean => {
	switch (timePeriod) {
		case 'all-time':
			return true;
		case 'past-seven':
			return new Date().getTime() - theDate.getTime() <= 7 * 24 * 60 * 60 * 1000;
		case 'past-three':
			return new Date().getTime() - theDate.getTime() <= 3 * 24 * 60 * 60 * 1000;
		case 'last-patch':
			const lastPatchDate = new Date(lastPatch.date);
			return lastPatchDate.getTime() < theDate.getTime();
	}
};

const saveFinalFile = async (
	stats: InternalBgsGlobalStats,
	tribes: readonly Race[],
	timePeriod: string,
): Promise<void> => {
	const stringResults = JSON.stringify(stats);
	const gzippedResults = gzipSync(stringResults);
	const tribesText = !!tribes?.length ? tribes.join('-') : 'all-tribes';
	await s3.writeFile(
		gzippedResults,
		S3_BUCKET_NAME,
		`${S3_FOLDER}/bgs-global-stats-${tribesText}-${timePeriod}.gz.json`,
		'application/json',
		'gzip',
	);
};

const saveSingleSlice = async (slice: Slice): Promise<void> => {
	const dataStr = JSON.stringify(slice, null, 4);
	const gzipped = gzipSync(dataStr, {
		level: constants.Z_BEST_COMPRESSION,
	});
	logger.log('gzipped buckets');
	await s3.writeFile(
		gzipped,
		S3_BUCKET_NAME,
		`${S3_FOLDER_SLICE}/hero-stats-${new Date().toISOString()}.gz.json`,
		'application/json',
		'gzip',
	);
	logger.log('slice saved', `${S3_FOLDER_SLICE}/hero-stats-${new Date().toISOString()}.gz.json`);
};

const loadRows = async (lastDataDate: Date): Promise<readonly InternalBgsRow[]> => {
	const mysql = await getConnection();
	const query = `
		SELECT creationDate, buildNumber, rating, heroCardId, rank, tribes, combatWinrate, warbandStats
		FROM bgs_run_stats
		WHERE creationDate >= ${!!lastDataDate ? SqlString.escape(lastDataDate) : 'DATE_SUB(NOW(), INTERVAL 4 HOUR)'};
	`;
	logger.log('\n', new Date().toLocaleString(), 'running query', query);
	const result: readonly InternalBgsRow[] = await mysql.query(query);
	logger.log(new Date().toLocaleString(), 'result', result?.length);
	await mysql.end();
	logger.log(new Date().toLocaleString(), 'connection closed');
	return result;
};

const loadExistingSlices = async (): Promise<readonly Slice[]> => {
	const files: ObjectList = await s3.loadAllFileKeys(S3_BUCKET_NAME, S3_FOLDER_SLICE);
	logger.log('fileKeys', files.length, files[0]);
	const allContent = await Promise.all(
		files.filter(file => !file.Key.endsWith('/')).map(file => s3.readGzipContent(S3_BUCKET_NAME, file.Key, 1)),
	);
	// Delete old data. The main goal is to keep the number of keys below 1000
	// so that we don't have to handle pagination in the replies
	// Keeping a history of 40 days also allows us to move to hourly updates if
	// we want to get fresh data after patches
	const keysToDelete = files
		.filter(file => Date.now() - file.LastModified.getTime() > 40 * 24 * 60 * 60 * 1000)
		.map(file => file.Key);
	await s3.deleteFiles(S3_BUCKET_NAME, keysToDelete);
	return allContent
		.map(content => JSON.parse(content))
		.map(
			data =>
				({
					...data,
					lastUpdateDate: new Date(data.lastUpdateDate),
				} as Slice),
		);
};

const getLastBattlegroundsPatch = async (): Promise<PatchInfo> => {
	const patchInfo = await http(`https://static.zerotoheroes.com/hearthstone/data/patches.json`);
	const structuredPatch = JSON.parse(patchInfo);
	const patchNumber = structuredPatch.currentBattlegroundsMetaPatch;
	return structuredPatch.patches.find(patch => patch.number === patchNumber);
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

export interface PatchInfo {
	readonly number: number;
	readonly version: string;
	readonly name: string;
	readonly date: string;
}
