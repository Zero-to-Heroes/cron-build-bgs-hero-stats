/* eslint-disable no-case-declarations */
import { PatchInfo } from '@firestone-hs/aws-lambda-utils';
import { TimePeriod } from '../../models';

export const computeHoursBackFromNow = (timePeriod: TimePeriod, patchInfo: PatchInfo): number => {
	switch (timePeriod) {
		case 'past-three':
			return 3 * 24;
		case 'past-seven':
			return 7 * 24;
		case 'all-time':
			return 20 * 24;
		case 'last-patch':
			const patchReleaseDate = new Date(patchInfo.date);
			const hours = Math.floor((Date.now() - patchReleaseDate.getTime()) / (1000 * 60 * 60));
			// console.debug('hours since last patch', hours, patchReleaseDate, patchInfo);
			return hours;
	}
};

export const buildFileNames = (hoursBack: number): readonly string[] => {
	// Build a list of file names, in the form YYYY-MM-dd (e.g. 2020-05-01)
	// that start from the day before the current date and go back in time
	const fileNames: string[] = [];
	const now = new Date();
	for (let i = 0; i < hoursBack; i++) {
		const date = new Date(now.getTime() - i * 60 * 60 * 1000);
		date.setMinutes(0);
		date.setSeconds(0);
		date.setMilliseconds(0);
		// The date in the format YYYY-MM-ddTHH:mm:ss.sssZ
		const dateStr = date.toISOString();
		fileNames.push(`${dateStr}`);
	}
	return fileNames;
};
