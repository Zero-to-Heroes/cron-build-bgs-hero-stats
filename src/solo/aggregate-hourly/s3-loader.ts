/* eslint-disable no-case-declarations */
import { PatchInfo } from '@firestone-hs/aws-lambda-utils';
import { InternalBgsCardStats, InternalBgsTrinketStats } from '../../internal-model';
import { BgsQuestStats } from '../../model-quests';
import { BgsHeroStatsV2, MmrPercentileFilter, TimePeriod } from '../../models';
import {
	HOURLY_KEY_CARD,
	HOURLY_KEY_HERO,
	HOURLY_KEY_QUEST,
	HOURLY_KEY_TRINKET,
	STATS_BUCKET,
} from '../hourly/_build-battlegrounds-hero-stats';
import { DAILY_KEY_CARD, DAILY_KEY_HERO, DAILY_KEY_QUEST, DAILY_KEY_TRINKET } from './config';
import { s3 } from './heroes/_build-aggregated-stats';
import { buildFileNames, buildFileNamesForDay, computeHoursBackFromNow } from './hourly-utils';

export type DataType = 'hero' | 'quest' | 'trinket' | 'card';
export type DataResult<T extends DataType> = T extends 'hero'
	? BgsHeroStatsV2
	: T extends 'trinket'
	? InternalBgsTrinketStats
	: T extends 'card'
	? InternalBgsCardStats
	: T extends 'quest'
	? BgsQuestStats
	: null;

export const loadHourlyDataFromS3 = async <T extends DataType>(
	type: T,
	timePeriod: TimePeriod,
	mmrPercentile: MmrPercentileFilter,
	patchInfo: PatchInfo,
): Promise<readonly DataResult<T>[]> => {
	const hoursBack: number = computeHoursBackFromNow(timePeriod, patchInfo);
	console.debug('loading hourly data', hoursBack);
	const fileNames: readonly string[] = buildFileNames(hoursBack);
	console.debug('fileNames', fileNames.length, hoursBack, timePeriod, mmrPercentile);
	const fileResults = await Promise.all(
		fileNames.map((fileName) => loadHourlyDeckStatFromS3(type, mmrPercentile, fileName)),
	);
	console.log('fileResults', fileResults.length, fileResults.filter((result) => !!result).length);
	return fileResults.filter((result) => !!result);
};

export const loadHourlyDataWithDaysFromS3 = async <T extends DataType>(
	type: T,
	timePeriod: TimePeriod,
	mmrPercentile: MmrPercentileFilter,
	patchInfo: PatchInfo,
): Promise<readonly DataResult<T>[]> => {
	const currentDayHourlyKeys: readonly string[] = getHourlyKeysForCurrentDay(type, mmrPercentile);
	console.debug('currentDayHourlyKeys', currentDayHourlyKeys);
	const previousDaysDailyKeys = getDailyKeysForPreviousDays(type, mmrPercentile, timePeriod, patchInfo);
	console.debug('previousDaysDailyKeys', previousDaysDailyKeys);
	const firstDayHourlyKeys = getHourlyKeysForFirstDay(type, mmrPercentile, timePeriod, patchInfo);
	console.debug('firstDayHourlyKeys', firstDayHourlyKeys);

	const fileKeys: readonly string[] = [...currentDayHourlyKeys, ...previousDaysDailyKeys, ...firstDayHourlyKeys];
	const fileResultsStr = await Promise.all(
		fileKeys.map((fileKey) => s3.readGzipContent(STATS_BUCKET, fileKey, 1, false)),
	);
	const fileResults: readonly DataResult<T>[] = fileResultsStr.map((str) => JSON.parse(str));
	console.log('fileResults', fileResults.length, fileResults.filter((result) => !!result).length);
	return fileResults.filter((result) => !!result);
};

const getDailyKeysForPreviousDays = <T extends DataType>(
	type: T,
	mmrPercentile: MmrPercentileFilter,
	timePeriod: TimePeriod,
	patchInfo: PatchInfo,
): readonly string[] => {
	const firstDate = computeStartDate(timePeriod, patchInfo);
	const keys: string[] = [];
	const mainKey =
		type === 'hero'
			? DAILY_KEY_HERO
			: type === 'trinket'
			? DAILY_KEY_TRINKET
			: type === 'quest'
			? DAILY_KEY_QUEST
			: type === 'card'
			? DAILY_KEY_CARD
			: null;

	while (firstDate < new Date()) {
		firstDate.setDate(firstDate.getDate() + 1);
		const dateStr = firstDate.toISOString();
		const fileKey = mainKey.replace('%mmrPercentile%', `${mmrPercentile}`).replace('%startDate%', dateStr);
		keys.push(fileKey);
	}
	return keys;
};

const getHourlyKeysForFirstDay = <T extends DataType>(
	type: T,
	mmrPercentile: MmrPercentileFilter,
	timePeriod: TimePeriod,
	patchInfo: PatchInfo,
): readonly string[] => {
	if (timePeriod !== 'last-patch') {
		return [];
	}

	const patchDate = new Date(patchInfo.date);
	const keys: string[] = [];
	const mainKey =
		type === 'hero'
			? HOURLY_KEY_HERO
			: type === 'trinket'
			? HOURLY_KEY_TRINKET
			: type === 'quest'
			? HOURLY_KEY_QUEST
			: type === 'card'
			? HOURLY_KEY_CARD
			: null;
	// The keys should start at the hour following the patch release, up until 23:00 of that day
	// E.g. if the patch was released at 2020-05-01 13:00, we want to load the data from
	// 2020-05-01 14:00 to 2020-05-01 23:00
	const startHour = patchDate.getHours() + 1;
	for (let i = startHour; i < 24; i++) {
		const date = new Date(patchDate.getTime());
		date.setHours(i);
		date.setMinutes(0);
		date.setSeconds(0);
		date.setMilliseconds(0);
		// The date in the format YYYY-MM-ddTHH:mm:ss.sssZ
		const dateStr = date.toISOString();
		const fileKey = mainKey.replace('%mmrPercentile%', `${mmrPercentile}`).replace('%startDate%', dateStr);
		keys.push(fileKey);
	}
	return keys;
};

const getHourlyKeysForCurrentDay = <T extends DataType>(
	type: T,
	mmrPercentile: MmrPercentileFilter,
): readonly string[] => {
	// Start with the current hour (at 00:00.000), and go back in time
	// until we get to 00:00 00:00.000 of the current day
	const mainKey =
		type === 'hero'
			? HOURLY_KEY_HERO
			: type === 'trinket'
			? HOURLY_KEY_TRINKET
			: type === 'quest'
			? HOURLY_KEY_QUEST
			: type === 'card'
			? HOURLY_KEY_CARD
			: null;
	const now = new Date();
	const keys: string[] = [];
	for (let i = 0; i < now.getHours() + 1; i++) {
		const date = new Date(now.getTime() - i * 60 * 60 * 1000);
		date.setMinutes(0);
		date.setSeconds(0);
		date.setMilliseconds(0);
		// The date in the format YYYY-MM-ddTHH:mm:ss.sssZ
		const dateStr = date.toISOString();
		const fileKey = mainKey.replace('%mmrPercentile%', `${mmrPercentile}`).replace('%startDate%', dateStr);
		keys.push(fileKey);
	}
	return keys;
};

const computeStartDate = (timePeriod: TimePeriod, patchInfo: PatchInfo): Date => {
	const now = new Date();
	now.setHours(0);
	now.setMinutes(0);
	now.setSeconds(0);
	now.setMilliseconds(0);

	switch (timePeriod) {
		case 'past-three':
			// Start 3 days in the past
			const threeDaysAgo = new Date(now.getTime());
			threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
			return threeDaysAgo;
		case 'past-seven':
			// Start 7 days in the past
			const sevenDaysAgo = new Date(now.getTime());
			sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
			return sevenDaysAgo;
		case 'all-time':
			// Start 20 days in the past
			const twentyDaysAgo = new Date(now.getTime());
			twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);
			return twentyDaysAgo;
		case 'last-patch':
			// This one is a bit different, as we want to start at the day following the patch release
			const patchReleaseDate = new Date(patchInfo.date);
			const dayAfterPatchRelease = new Date(patchReleaseDate);
			dayAfterPatchRelease.setDate(dayAfterPatchRelease.getDate() + 1);
			dayAfterPatchRelease.setHours(0);
			dayAfterPatchRelease.setMinutes(0);
			dayAfterPatchRelease.setSeconds(0);
			dayAfterPatchRelease.setMilliseconds(0);
			return dayAfterPatchRelease;
	}
};

export const loadHourlyDataFromS3ForDay = async <T extends DataType>(
	type: T,
	dayStartTime: string,
	mmrPercentile: MmrPercentileFilter,
): Promise<readonly DataResult<T>[]> => {
	const fileNames: readonly string[] = buildFileNamesForDay(dayStartTime);
	console.debug('fileNames', fileNames);
	const fileResults = await Promise.all(
		fileNames.map((fileName) => loadHourlyDeckStatFromS3(type, mmrPercentile, fileName)),
	);
	console.log('fileResults', fileResults.length, fileResults.filter((result) => !!result).length);
	return fileResults.filter((result) => !!result);
};

const loadHourlyDeckStatFromS3 = async <T extends DataType>(
	type: T,
	mmrPercentile: MmrPercentileFilter,
	fileName: string,
): Promise<DataResult<T>> => {
	const mainKey =
		type === 'hero'
			? HOURLY_KEY_HERO
			: type === 'trinket'
			? HOURLY_KEY_TRINKET
			: type === 'quest'
			? HOURLY_KEY_QUEST
			: type === 'card'
			? HOURLY_KEY_CARD
			: null;
	const fileKey = mainKey.replace('%mmrPercentile%', `${mmrPercentile}`).replace('%startDate%', fileName);
	const data = await s3.readGzipContent(STATS_BUCKET, fileKey, 1, false);
	const result: DataResult<T> = JSON.parse(data);
	return result;
};
