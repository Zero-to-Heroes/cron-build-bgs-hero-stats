import { S3, getLastBattlegroundsPatch, logBeforeTimeout, sleep } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { Context } from 'aws-lambda';
import AWS from 'aws-sdk';
import { InternalBgsCardStats } from '../../../internal-model';
import { BgsCardStat } from '../../../model-cards';
import { MmrPercentileFilter, TimePeriod } from '../../../models';
import { loadHourlyDataWithDaysFromS3 } from '../../aggregate-hourly/s3-loader';
import { persistData } from './s3-saver';
import { buildCardStats } from './stats-builder';

const allCards = new AllCardsService();
export const s3 = new S3();
const lambda = new AWS.Lambda();

const allTimePeriod: readonly TimePeriod[] = ['all-time', 'past-three', 'past-seven', 'last-patch'];
export const mmrPercentiles: readonly MmrPercentileFilter[] = [100, 50, 25, 10, 1];

export default async (event, context: Context): Promise<any> => {
	await allCards.initializeCardsDb();

	if (event.timePeriod == null) {
		await dispatchEvents(context);
		return;
	}

	const cleanup = logBeforeTimeout(context);
	const timePeriod: TimePeriod = event.timePeriod;
	const mmrPercentile: MmrPercentileFilter | null = event.mmrPercentile;

	console.log('aggregating cards data', timePeriod, mmrPercentile);
	// Build the list of files based on the timeframe, and load all of these
	const patchInfo = await getLastBattlegroundsPatch();

	// Legacy
	if (mmrPercentile == null) {
		const allHourlyData: readonly InternalBgsCardStats[] = (
			await Promise.all(
				mmrPercentiles.map((mmrPercentile) =>
					loadHourlyDataWithDaysFromS3('card', timePeriod, mmrPercentile, patchInfo),
				),
			)
		).flat();
		const lastUpdate = allHourlyData
			.map((d) => ({
				date: new Date(d.lastUpdateDate),
				dateStr: d.lastUpdateDate,
				time: new Date(d.lastUpdateDate).getTime(),
			}))
			.sort((a, b) => b.time - a.time)[0].date;
		const mergedStats: readonly BgsCardStat[] = buildCardStats(allHourlyData, allCards);
		const totalGames = allHourlyData.map((s) => s.dataPoints).reduce((a, b) => a + b, 0);
		await persistData(mergedStats, mmrPercentile, timePeriod, totalGames, lastUpdate);
		cleanup();
	}
	// Split by MMR in each file
	else {
		const hourlyDataForMmr = await loadHourlyDataWithDaysFromS3('card', timePeriod, mmrPercentile, patchInfo);
		console.debug(
			'games played',
			hourlyDataForMmr.map((s) => s.dataPoints),
		);
		if (mmrPercentile === 100) {
			console.debug(
				'Bubble Gunner daily over time',
				hourlyDataForMmr.flatMap(
					(h) =>
						h.cardStats.find((s) => s.cardId === 'BG31_149')?.turnStats?.find((t) => t.turn === 1)
							?.totalPlayed,
				),
				mmrPercentile,
			);
		}
		const lastUpdate = hourlyDataForMmr
			.map((d) => ({
				date: new Date(d.lastUpdateDate),
				dateStr: d.lastUpdateDate,
				time: new Date(d.lastUpdateDate).getTime(),
			}))
			.sort((a, b) => b.time - a.time)[0].date;
		const mergedStatsForMmr: readonly BgsCardStat[] = buildCardStats(hourlyDataForMmr, allCards);
		const totalGames = hourlyDataForMmr.map((s) => s.dataPoints).reduce((a, b) => a + b, 0);
		await persistData(mergedStatsForMmr, mmrPercentile, timePeriod, totalGames, lastUpdate);
		cleanup();
	}
};

const dispatchEvents = async (context: Context) => {
	for (const timePeriod of allTimePeriod) {
		for (const mmrPercentile of [null, ...mmrPercentiles]) {
			console.log('dispatching event', timePeriod, mmrPercentile);
			const newEvent = {
				timePeriod: timePeriod,
				mmrPercentile: mmrPercentile,
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
