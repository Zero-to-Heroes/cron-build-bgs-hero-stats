import { PatchInfo } from '@firestone-hs/aws-lambda-utils';
import { HOURLY_KEY, STATS_BUCKET } from '../hourly/_build-battlegrounds-hero-stats';
import { BgsHeroStatsV2, MmrPercentileFilter, TimePeriod } from '../models';
import { s3 } from './_build-aggregated-stats';
import { buildFileNames, computeHoursBackFromNow } from './hourly-utils';

export const loadHourlyDataFromS3 = async (
	timePeriod: TimePeriod,
	mmrPercentile: MmrPercentileFilter,
	patchInfo: PatchInfo,
): Promise<readonly BgsHeroStatsV2[]> => {
	const hoursBack: number = computeHoursBackFromNow(timePeriod, patchInfo);
	const fileNames: readonly string[] = buildFileNames(hoursBack);
	// console.debug('fileNames', timePeriod, mmrPercentile, fileNames);
	const fileResults = await Promise.all(
		fileNames.map((fileName) => loadHourlyDeckStatFromS3(mmrPercentile, fileName)),
	);
	return fileResults.filter((result) => !!result);
};

const loadHourlyDeckStatFromS3 = async (
	mmrPercentile: MmrPercentileFilter,
	fileName: string,
): Promise<BgsHeroStatsV2> => {
	const fileKey = HOURLY_KEY.replace('%mmrPercentile%', `${mmrPercentile}`).replace('%startDate%', fileName);
	const data = await s3.readGzipContent(STATS_BUCKET, fileKey, 1, false);
	const result: BgsHeroStatsV2 = JSON.parse(data);
	return result;
};
