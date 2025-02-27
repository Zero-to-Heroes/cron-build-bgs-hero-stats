import { PatchInfo } from '@firestone-hs/aws-lambda-utils';
import { BgsQuestStats } from '../../model-quests';
import { BgsHeroStatsV2, MmrPercentileFilter, TimePeriod } from '../../models';
import { HOURLY_KEY_HERO, HOURLY_KEY_QUEST, STATS_BUCKET } from '../hourly/_build-battlegrounds-hero-stats';
import { s3 } from './heroes/_build-aggregated-stats';
import { buildFileNames, computeHoursBackFromNow } from './hourly-utils';

export type DataType = 'hero' | 'quest';
export type DataResult<T extends DataType> = T extends 'hero' ? BgsHeroStatsV2 : BgsQuestStats;

export const loadHourlyDataFromS3 = async <T extends DataType>(
	type: T,
	timePeriod: TimePeriod,
	mmrPercentile: MmrPercentileFilter,
	anomaly: string | null,
	patchInfo: PatchInfo,
): Promise<readonly DataResult<T>[]> => {
	const hoursBack: number = computeHoursBackFromNow(timePeriod, patchInfo);
	const fileNames: readonly string[] = buildFileNames(hoursBack);
	// console.debug('fileNames', timePeriod, mmrPercentile, fileNames);
	const fileResults = await Promise.all(
		fileNames.map((fileName) => loadHourlyDeckStatFromS3(type, anomaly, mmrPercentile, fileName)),
	);
	return fileResults.filter((result) => !!result);
};

const loadHourlyDeckStatFromS3 = async <T extends DataType>(
	type: T,
	anomaly: string | null,
	mmrPercentile: MmrPercentileFilter,
	fileName: string,
): Promise<DataResult<T>> => {
	const mainKey = type === 'hero' ? HOURLY_KEY_HERO : HOURLY_KEY_QUEST;
	const fileKey = mainKey
		.replace('%anomaly%', anomaly ? `anomalies/${anomaly}/` : '')
		.replace('%mmrPercentile%', `${mmrPercentile}`)
		.replace('%startDate%', fileName);
	const data = await s3.readGzipContent(STATS_BUCKET, fileKey, 1, false);
	const result: DataResult<T> = JSON.parse(data);
	return result;
};
