/* eslint-disable @typescript-eslint/no-use-before-define */
import { http, logBeforeTimeout, logger, S3 } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { Context } from 'aws-lambda';
import AWS from 'aws-sdk';
import { Readable } from 'stream';
import { PatchInfo } from './common';
import { InternalBgsRow } from './internal-model';
import { handleQuestsV2 } from './quests-v2/quests-v2';
import { saveRowsOnS3 } from './rows';
import { handleStatsV2 } from './stats-v2/stats-v2';

export const s3 = new S3();
const allCards = new AllCardsService();
const lambda = new AWS.Lambda();

const allTimePeriods: ('all-time' | 'past-three' | 'past-seven' | 'last-patch')[] = [
	'all-time',
	'past-three',
	'past-seven',
	'last-patch',
];
const allMmrPercentiles: (100 | 50 | 25 | 10 | 1)[] = [100, 50, 25, 10, 1];

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

	if (event.questsV2) {
		const rows: readonly InternalBgsRow[] = await readRowsFromS3();
		logger.log('building quest stats', event.timePeriod, rows?.length);
		await handleQuestsV2(event.timePeriod, event.mmr, rows, lastPatch);
	} else if (event.statsV2) {
		const rows: readonly InternalBgsRow[] = await readRowsFromS3();
		logger.log('building hero stats', event.timePeriod, rows?.length);
		await handleStatsV2(event.timePeriod, event.mmr, rows, lastPatch, allCards);
	} else {
		await saveRowsOnS3(allCards);
		await dispatchStatsV2Lambda(context);
		await dispatchQuestsV2Lambda(context);
	}

	cleanup();
	return { statusCode: 200, body: null };
};

const dispatchQuestsV2Lambda = async (context: Context) => {
	for (const timePeriod of allTimePeriods) {
		for (const mmr of allMmrPercentiles) {
			const newEvent = {
				questsV2: true,
				timePeriod: timePeriod,
				mmr: mmr,
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
	}
};

const dispatchStatsV2Lambda = async (context: Context) => {
	for (const timePeriod of allTimePeriods) {
		for (const mmr of allMmrPercentiles) {
			const newEvent = {
				statsV2: true,
				timePeriod: timePeriod,
				mmr: mmr,
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
	}
};

const readRowsFromS3 = async (): Promise<readonly InternalBgsRow[]> => {
	return new Promise<readonly InternalBgsRow[]>((resolve, reject) => {
		console.debug('reading rows from s3');
		let parseErrors = 0;
		let totalParsed = 0;
		const stream: Readable = s3.readStream('static.zerotoheroes.com', `api/bgs/working-rows.json`);
		const result: InternalBgsRow[] = [];
		let previousString = '';
		stream
			.on('data', (chunk) => {
				const str = Buffer.from(chunk).toString('utf-8');
				const newStr = previousString + str;
				const split = newStr.split('\n');
				const rows: readonly InternalBgsRow[] = split.slice(0, split.length - 1).map((row) => {
					try {
						const result: InternalBgsRow = JSON.parse(row);
						totalParsed++;
						return result;
					} catch (e) {
						// logger.warn('could not parse row', row);
						parseErrors++;
					}
				});
				previousString = split[split.length - 1];
				logger.log('parsing errors', parseErrors, 'and successes', totalParsed);
				result.push(...rows);
			})
			.on('end', () => {
				const finalResult = result.filter((row) => !!row);
				logger.log('stream end', result.length, finalResult.length);
				logger.log('parsing errors', parseErrors, 'and successes', totalParsed);
				resolve(finalResult);
			});
	});
};

export const buildWarbandStats = (
	rows: readonly InternalBgsRow[],
): readonly { turn: number; dataPoints: number; totalStats: number }[] => {
	const data: { [turn: string]: { dataPoints: number; totalStats: number } } = {};
	// Before that, there was an issue with disconnects, where the first turn after the
	// reconnect would be turn 0, leading to an inflation of early turn stats
	const validRows = rows.filter((row) => row.id > 5348374);
	for (const row of validRows) {
		if (!row.warbandStats?.length) {
			continue;
		}

		let parsed: readonly { turn: number; totalStats: number }[] = [];
		try {
			parsed = JSON.parse(row.warbandStats);
		} catch (e) {
			logger.warn('Could not parse warband stats', row.id, row.warbandStats, e);
		}
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

	const result: { turn: number; dataPoints: number; totalStats: number }[] = Object.keys(data).map((turn) => ({
		turn: +turn,
		dataPoints: data[turn].dataPoints,
		totalStats: data[turn].totalStats,
	}));
	return result;
};

export const buildCombatWinrate = (
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
	const result: { turn: number; dataPoints: number; totalWinrate: number }[] = Object.keys(data).map((turn) => ({
		turn: +turn,
		dataPoints: data[turn].dataPoints,
		totalWinrate: data[turn].totalWinrate,
	}));
	// if (debug) {
	// 	logger.log('\t result', result);
	// }
	return result;
};

const getLastBattlegroundsPatch = async (): Promise<PatchInfo> => {
	const patchInfo = await http(`https://static.zerotoheroes.com/hearthstone/data/patches.json`);
	const structuredPatch = JSON.parse(patchInfo);
	const patchNumber = structuredPatch.currentBattlegroundsMetaPatch;
	return structuredPatch.patches.find((patch) => patch.number === patchNumber);
};
