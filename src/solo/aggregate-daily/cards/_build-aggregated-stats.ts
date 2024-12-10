import { S3, sleep } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { Context } from 'aws-lambda';
import AWS from 'aws-sdk';
import { InternalBgsCardStat, InternalBgsCardStats } from '../../../internal-model';
import { MmrPercentileFilter } from '../../../models';
import { loadHourlyDataFromS3ForDay } from '../../aggregate-hourly/s3-loader';
import { persistData } from './s3-saver';
import { buildCardStats } from './stats-builder';

const allCards = new AllCardsService();
export const s3 = new S3();
const lambda = new AWS.Lambda();

export const mmrPercentiles: readonly MmrPercentileFilter[] = [100, 50, 25, 10, 1];

export default async (event, context: Context): Promise<any> => {
	if (event.catchUp) {
		await dispatchCatchUpEvents(context, +event.catchUp);
		return;
	}

	await allCards.initializeCardsDb();

	// By default, process yesterday
	const dayToProcess =
		event.targetDate ?? new Date(new Date().getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
	for (const mmrPercentile of mmrPercentiles) {
		console.log('aggregating daily cards data', dayToProcess, mmrPercentile);
		const hourlyData: readonly InternalBgsCardStats[] = await loadHourlyDataFromS3ForDay(
			'card',
			dayToProcess,
			mmrPercentile,
		);
		const lastUpdate = hourlyData
			.map((d) => ({
				date: new Date(d.lastUpdateDate),
				dateStr: d.lastUpdateDate,
				time: new Date(d.lastUpdateDate).getTime(),
			}))
			.sort((a, b) => b.time - a.time)[0].date;
		console.log('merging stats for day', dayToProcess, mmrPercentile);
		const mergedStats: readonly InternalBgsCardStat[] = buildCardStats(hourlyData, allCards);
		await persistData(mergedStats, dayToProcess, lastUpdate, mmrPercentile);
	}
};

const dispatchCatchUpEvents = async (context: Context, numberOfDays: number) => {
	// Build a list of days for the last 30 days, in the format YYYY-MM-dd
	const now = new Date();
	const days = [];
	for (let i = 0; i < numberOfDays; i++) {
		const day = new Date(now.setDate(now.getDate() - 1));
		const year = day.getFullYear();
		const month = day.getMonth() + 1;
		const dayOfMonth = day.getDate();
		days.push(`${year}-${month}-${dayOfMonth}`);
	}

	for (const targetDate of days) {
		// console.log('dispatching catch-up for date', targetDate);
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
