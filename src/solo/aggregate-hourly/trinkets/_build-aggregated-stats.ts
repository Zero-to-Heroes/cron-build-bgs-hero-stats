import { S3, getLastBattlegroundsPatch, logBeforeTimeout, sleep } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { Context } from 'aws-lambda';
import AWS from 'aws-sdk';
import { InternalBgsTrinketStats } from '../../../internal-model';
import { BgsTrinketStat } from '../../../model-trinkets';
import { MmrPercentileFilter, TimePeriod } from '../../../models';
import { loadHourlyDataFromS3 } from '../s3-loader';
import { persistData } from './s3-saver';
import { buildTrinketStats } from './stats-builder';

const allCards = new AllCardsService();
export const s3 = new S3();
const lambda = new AWS.Lambda();

const allTimePeriod: readonly TimePeriod[] = ['all-time', 'past-three', 'past-seven', 'last-patch'];
export const mmrPercentiles: readonly MmrPercentileFilter[] = [100, 50, 25, 10, 1];

export default async (event, context: Context): Promise<any> => {
	await allCards.initializeCardsDb();

	if (!event.timePeriod) {
		await dispatchEvents(context);
		return;
	}

	const cleanup = logBeforeTimeout(context);
	const timePeriod: TimePeriod = event.timePeriod;

	// console.log('aggregating data', timePeriod, mmrPercentile);
	// Build the list of files based on the timeframe, and load all of these
	const patchInfo = await getLastBattlegroundsPatch();
	const hourlyData: readonly InternalBgsTrinketStats[] = (
		await Promise.all(
			mmrPercentiles.map((mmrPercentile) =>
				loadHourlyDataFromS3('trinket', timePeriod, mmrPercentile, patchInfo),
			),
		)
	).flat();

	const lastUpdate = hourlyData
		.map((d) => ({
			date: new Date(d.lastUpdateDate),
			dateStr: d.lastUpdateDate,
			time: new Date(d.lastUpdateDate).getTime(),
		}))
		.sort((a, b) => b.time - a.time)[0].date;

	const mergedStats: readonly BgsTrinketStat[] = buildTrinketStats(hourlyData, allCards);

	await persistData(mergedStats, timePeriod, lastUpdate);
	cleanup();
};

const dispatchEvents = async (context: Context) => {
	console.log('dispatching events');
	for (const timePeriod of allTimePeriod) {
		const newEvent = {
			timePeriod: timePeriod,
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
