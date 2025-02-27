/* eslint-disable @typescript-eslint/no-use-before-define */
import { S3, logBeforeTimeout, sleep } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { Context } from 'aws-lambda';
import AWS from 'aws-sdk';
import { InternalBgsRow } from '../../internal-model';
import { buildCardStats } from './cards/card-stats';
import { buildHeroStats } from './hero-stats';
import { readRowsFromS3, saveRowsOnS3 } from './rows';
import { buildTrinketStats } from './trinkets/trinket-stats';

export const s3 = new S3();
const allCards = new AllCardsService();
const lambda = new AWS.Lambda();

const allMmrPercentiles: (100 | 50 | 25 | 10 | 1)[] = [100, 50, 25, 10, 1];

export const STATS_BUCKET = 'static.zerotoheroes.com';
export const STATS_KEY_PREFIX = `api/bgs`;
export const WORKING_ROWS_FILE = `${STATS_KEY_PREFIX}/working/working-rows-%time%.json`;
export const HOURLY_KEY_HERO = `${STATS_KEY_PREFIX}/hero-stats/%anomaly%mmr-%mmrPercentile%/hourly/%startDate%.gz.json`;
export const HOURLY_KEY_QUEST = `${STATS_KEY_PREFIX}/quest-stats/mmr-%mmrPercentile%/hourly/%startDate%.gz.json`;
export const HOURLY_KEY_TRINKET = `${STATS_KEY_PREFIX}/trinket-stats/mmr-%mmrPercentile%/hourly/%startDate%.gz.json`;
export const HOURLY_KEY_CARD = `${STATS_KEY_PREFIX}/card-stats/mmr-%mmrPercentile%/hourly/%startDate%.gz.json`;

// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.
// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event, context: Context): Promise<any> => {
	await handleNewStats(event, context);
};

export const handleNewStats = async (event, context: Context) => {
	const cleanup = logBeforeTimeout(context);
	// logger.log('event', event);
	await allCards.initializeCardsDb();

	if (event.catchUp) {
		await dispatchCatchUpEvents(context, +event.catchUp);
		cleanup();
		return;
	}

	if (!event.statsV2 && !event.questsV2 && !event.trinkets && !event.cards) {
		await dispatchMainEvents(context, event);
		cleanup();
		return;
	}

	// if (event.questsV2) {
	// 	const lastHourRows: readonly InternalBgsRow[] = await readRowsFromS3(event.startDate);
	// 	// logger.log('building quest stats', event.timePeriod, event.startDate, lastHourRows?.length);
	// 	await buildQuestStats(event.startDate, event.mmr, lastHourRows, allCards, s3);
	// } else
	if (event.statsV2) {
		const lastHourRows: readonly InternalBgsRow[] = await readRowsFromS3(event.startDate);
		const uniqueAnomalies = [
			null,
			...lastHourRows
				.flatMap((r) => r.bgsAnomalies?.split(','))
				.filter((a) => a)
				.filter((value, index, self) => self.indexOf(value) === index),
		];
		for (const anomaly of uniqueAnomalies) {
			console.log('building hero stats', event.startDate, event.mmr, lastHourRows?.length, anomaly);
			await buildHeroStats(event.startDate, event.mmr, anomaly, lastHourRows, allCards);
		}
	} else if (event.trinkets) {
		const lastHourRows: readonly InternalBgsRow[] = await readRowsFromS3(event.startDate);
		console.log('building trinket stats', event.startDate, event.mmr, lastHourRows?.length);
		await buildTrinketStats(
			event.startDate,
			event.mmr,
			lastHourRows,
			allCards,
			STATS_BUCKET,
			HOURLY_KEY_TRINKET,
			s3,
		);
	} else if (event.cards) {
		const lastHourRows: readonly InternalBgsRow[] = await readRowsFromS3(event.startDate);
		console.log('building card stats', event.startDate, event.mmr, lastHourRows?.length);
		await buildCardStats(event.startDate, event.mmr, lastHourRows, allCards, STATS_BUCKET, HOURLY_KEY_CARD, s3);
	}

	cleanup();
};

const dispatchMainEvents = async (context: Context, event) => {
	const startDate = buildProcessStartDate(event);
	// End one hour later
	const endDate = new Date(startDate);
	endDate.setHours(endDate.getHours() + 1);

	await saveRowsOnS3(startDate, endDate, allCards);

	await dispatchStatsV2Lambda(context, startDate);
	await dispatchTrinketsLambda(context, startDate);
	await dispatchCardsLambda(context, startDate);
	// await dispatchQuestsV2Lambda(context, startDate);
};

const buildProcessStartDate = (event): Date => {
	if (event?.targetDate) {
		const targetDate = new Date(event.targetDate);
		return targetDate;
	}

	// Start from the start of the current hour
	const processStartDate = new Date();
	processStartDate.setMinutes(0);
	processStartDate.setSeconds(0);
	processStartDate.setMilliseconds(0);
	processStartDate.setHours(processStartDate.getHours() - 1);
	return processStartDate;
};

const dispatchCardsLambda = async (context: Context, startDate: Date) => {
	for (const mmr of allMmrPercentiles) {
		const newEvent = {
			cards: true,
			mmr: mmr,
			startDate: startDate,
		};
		const params = {
			FunctionName: context.functionName,
			InvocationType: 'Event',
			LogType: 'Tail',
			Payload: JSON.stringify(newEvent),
		};
		console.log('\tinvoking lambda', params);
		const result = await lambda
			.invoke({
				FunctionName: context.functionName,
				InvocationType: 'Event',
				LogType: 'Tail',
				Payload: JSON.stringify(newEvent),
			})
			.promise();
		// logger.log('\tinvocation result', result);
	}
};

const dispatchTrinketsLambda = async (context: Context, startDate: Date) => {
	for (const mmr of allMmrPercentiles) {
		const newEvent = {
			trinkets: true,
			mmr: mmr,
			startDate: startDate,
		};
		const params = {
			FunctionName: context.functionName,
			InvocationType: 'Event',
			LogType: 'Tail',
			Payload: JSON.stringify(newEvent),
		};
		console.log('\tinvoking lambda', params);
		const result = await lambda
			.invoke({
				FunctionName: context.functionName,
				InvocationType: 'Event',
				LogType: 'Tail',
				Payload: JSON.stringify(newEvent),
			})
			.promise();
		// logger.log('\tinvocation result', result);
	}
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
		console.log('\tinvoking lambda', params);
		const result = await lambda
			.invoke({
				FunctionName: context.functionName,
				InvocationType: 'Event',
				LogType: 'Tail',
				Payload: JSON.stringify(newEvent),
			})
			.promise();
		// logger.log('\tinvocation result', result);
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
		console.log('\tinvoking lambda', params);
		const result = await lambda
			.invoke({
				FunctionName: context.functionName,
				InvocationType: 'Event',
				LogType: 'Tail',
				Payload: JSON.stringify(newEvent),
			})
			.promise();
		// logger.log('\tinvocation result', result);
	}
};

const dispatchCatchUpEvents = async (context: Context, daysInThePast: number) => {
	// Build a list of hours for the last `daysInThePast` days, in the format YYYY-MM-ddTHH:mm:ss.sssZ
	const now = new Date();
	const hours = [];
	for (let i = 0; i < 24 * daysInThePast; i++) {
		const baseDate = new Date(now);
		baseDate.setMinutes(0);
		baseDate.setSeconds(0);
		baseDate.setMilliseconds(0);
		const hour = new Date(baseDate.getTime() - i * 60 * 60 * 1000);
		hours.push(hour.toISOString());
	}

	for (const targetDate of hours) {
		console.log('dispatching catch-up for date', targetDate);
		const newEvent = {
			targetDate: targetDate,
		};
		const params = {
			FunctionName: context.functionName,
			InvocationType: 'Event',
			LogType: 'Tail',
			Payload: JSON.stringify(newEvent),
		};
		// console.log('\tinvoking lambda', params);
		const result = await lambda
			.invoke({
				FunctionName: context.functionName,
				InvocationType: 'Event',
				LogType: 'Tail',
				Payload: JSON.stringify(newEvent),
			})
			.promise();
		// console.log('\tinvocation result', result);
		await sleep(50);
	}
};
