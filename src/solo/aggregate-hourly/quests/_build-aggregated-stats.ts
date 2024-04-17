import { S3, getLastBattlegroundsPatch, logBeforeTimeout, sleep } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { Context } from 'aws-lambda';
import AWS from 'aws-sdk';
import { BgsGlobalQuestStat, BgsGlobalRewardStat, BgsQuestStats } from '../../../model-quests';
import { MmrPercentile, MmrPercentileFilter, TimePeriod } from '../../../models';
import { buildMmrPercentiles } from '../percentiles';
import { loadHourlyDataFromS3 } from '../s3-loader';
import { mergeQuestStats } from './quest-stats-merger';
import { mergeRewardStats } from './reward-stats-merger';
import { persistData } from './s3-saver';

const allCards = new AllCardsService();
export const s3 = new S3();
const lambda = new AWS.Lambda();

export default async (event, context: Context): Promise<any> => {
	await allCards.initializeCardsDb();

	if (!event.timePeriod) {
		await dispatchEvents(context);
		return;
	}

	const cleanup = logBeforeTimeout(context);
	const timePeriod: TimePeriod = event.timePeriod;
	const mmrPercentile: MmrPercentileFilter = event.mmrPercentile;

	// console.log('aggregating data', timePeriod, mmrPercentile);
	// Build the list of files based on the timeframe, and load all of these
	const patchInfo = await getLastBattlegroundsPatch();
	const hourlyData: readonly BgsQuestStats[] = await loadHourlyDataFromS3(
		'quest',
		timePeriod,
		mmrPercentile,
		patchInfo,
	);
	// console.log('hourlyData', hourlyData.length);
	const lastUpdate = hourlyData
		.map((d) => ({
			date: new Date(d.lastUpdateDate),
			dateStr: d.lastUpdateDate,
			time: new Date(d.lastUpdateDate).getTime(),
		}))
		.sort((a, b) => b.time - a.time)[0].date;
	// console.log('loaded hourly data', lastUpdate);

	// Here it's ok that the MMR corresponding to each MMR percentile is not the same across all the hourly data chunks
	// as the actual MMR evolves over time
	// The only issue is that the samples might be too small for the MMR percentiles to be really representative  in
	// each group
	// Empirically, it looks like there isn't much variation on a hour-by-hour basis, so it should be ok
	// A possible solution, if this becomes an issue, is to compute the MMR percentiles on the full last day of data
	// when building the hourly data
	const mergedQuestStats: readonly BgsGlobalQuestStat[] = mergeQuestStats(hourlyData, mmrPercentile, allCards);
	const mergedRewardStats: readonly BgsGlobalRewardStat[] = mergeRewardStats(hourlyData, mmrPercentile, allCards);
	const mmrPercentiles: readonly MmrPercentile[] = buildMmrPercentiles(hourlyData);
	await persistData(mergedQuestStats, mergedRewardStats, mmrPercentiles, lastUpdate, timePeriod, mmrPercentile);
	cleanup();
};

const dispatchEvents = async (context: Context) => {
	console.log('dispatching events');
	const allTimePeriod: readonly TimePeriod[] = ['all-time', 'past-three', 'past-seven', 'last-patch'];
	const mmrPercentiles: readonly MmrPercentileFilter[] = [100, 50, 25, 10, 1];
	for (const timePeriod of allTimePeriod) {
		for (const percentile of mmrPercentiles) {
			const newEvent = {
				timePeriod: timePeriod,
				mmrPercentile: percentile,
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
	}
};
