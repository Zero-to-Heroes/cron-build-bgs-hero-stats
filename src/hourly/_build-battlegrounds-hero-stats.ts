/* eslint-disable @typescript-eslint/no-use-before-define */
import { S3, logBeforeTimeout, logger } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { Context } from 'aws-lambda';
import AWS from 'aws-sdk';
import { InternalBgsRow } from '../internal-model';
import { buildHeroStats } from './hero-stats';
import { readRowsFromS3, saveRowsOnS3 } from './rows';

export const s3 = new S3();
const allCards = new AllCardsService();
const lambda = new AWS.Lambda();

const allMmrPercentiles: (100 | 50 | 25 | 10 | 1)[] = [100, 50, 25, 10, 1];

export const STATS_BUCKET = 'static.zerotoheroes.com';
export const STATS_KEY_PREFIX = `api/bgs`;
export const WORKING_ROWS_FILE = `${STATS_KEY_PREFIX}/working/working-rows-%time%.json`;
export const HOURLY_KEY = `${STATS_KEY_PREFIX}/hero-stats/mmr-%mmrPercentile%/hourly/%startDate%.gz.json`;

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

	if (event.questsV2) {
		// const lastHourRows: readonly InternalBgsRow[] = await readRowsFromS3(event.startDate);
		// logger.log('building quest stats', event.timePeriod, event.startDate, lastHourRows?.length);
		// await handleQuestsV2(event.startDate, event.mmr, lastHourRows, lastPatch);
	} else if (event.statsV2) {
		const lastHourRows: readonly InternalBgsRow[] = await readRowsFromS3(event.startDate);
		logger.log('building hero stats', event.startDate, lastHourRows?.length);
		await buildHeroStats(event.startDate, event.mmr, lastHourRows, allCards);
	} else {
		const startDate = new Date();
		startDate.setMinutes(0);
		startDate.setSeconds(0);
		startDate.setMilliseconds(0);
		startDate.setHours(startDate.getHours() - 1);
		console.log('processStartDate', startDate);
		// End one hour later
		const endDate = new Date(startDate);
		endDate.setHours(endDate.getHours() + 1);

		await saveRowsOnS3(startDate, endDate, allCards);
		await dispatchStatsV2Lambda(context, startDate);
		// await dispatchQuestsV2Lambda(context, startDate);
	}

	cleanup();
	return { statusCode: 200, body: null };
};

const dispatchQuestsV2Lambda = async (context: Context, startDate: Date) => {
	for (const mmr of allMmrPercentiles) {
		const newEvent = {
			questsV2: true,
			mmr: mmr,
			startDate: startDate,
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

const dispatchStatsV2Lambda = async (context: Context, startDate: Date) => {
	for (const mmr of allMmrPercentiles) {
		const newEvent = {
			statsV2: true,
			mmr: mmr,
			startDate: startDate,
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
