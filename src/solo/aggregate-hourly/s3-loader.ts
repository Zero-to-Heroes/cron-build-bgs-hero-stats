import { PatchInfo } from '@firestone-hs/aws-lambda-utils';
import { InternalBgsTrinketStats } from '../../internal-model';
import { BgsQuestStats } from '../../model-quests';
import { BgsHeroStatsV2, MmrPercentileFilter, TimePeriod } from '../../models';
import {
	HOURLY_KEY_HERO,
	HOURLY_KEY_QUEST,
	HOURLY_KEY_TRINKET,
	STATS_BUCKET,
} from '../hourly/_build-battlegrounds-hero-stats';
import { s3 } from './heroes/_build-aggregated-stats';
import { buildFileNames, computeHoursBackFromNow } from './hourly-utils';

export type DataType = 'hero' | 'quest' | 'trinket';
export type DataResult<T extends DataType> = T extends 'hero'
	? BgsHeroStatsV2
	: T extends 'trinket'
	? InternalBgsTrinketStats
	: BgsQuestStats;

export const loadHourlyDataFromS3 = async <T extends DataType>(
	type: T,
	timePeriod: TimePeriod,
	mmrPercentile: MmrPercentileFilter,
	patchInfo: PatchInfo,
): Promise<readonly DataResult<T>[]> => {
	const hoursBack: number = computeHoursBackFromNow(timePeriod, patchInfo);
	const fileNames: readonly string[] = buildFileNames(hoursBack);
	// console.debug('fileNames', timePeriod, mmrPercentile, fileNames);
	const fileResults = await Promise.all(
		fileNames.map((fileName) => loadHourlyDeckStatFromS3(type, mmrPercentile, fileName)),
	);
	return fileResults.filter((result) => !!result);
};

const loadHourlyDeckStatFromS3 = async <T extends DataType>(
	type: T,
	mmrPercentile: MmrPercentileFilter,
	fileName: string,
): Promise<DataResult<T>> => {
	const mainKey = type === 'hero' ? HOURLY_KEY_HERO : type === 'trinket' ? HOURLY_KEY_TRINKET : HOURLY_KEY_QUEST;
	const fileKey = mainKey.replace('%mmrPercentile%', `${mmrPercentile}`).replace('%startDate%', fileName);
	const data = await s3.readGzipContent(STATS_BUCKET, fileKey, 1, false);
	const result: DataResult<T> = JSON.parse(data);
	return result;
};
