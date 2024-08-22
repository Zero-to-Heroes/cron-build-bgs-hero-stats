import { gzipSync } from 'zlib';
import { BgsTrinketStat, BgsTrinketStats } from '../../../model-trinkets';
import { TimePeriod } from '../../../models';
import { STATS_BUCKET } from '../../hourly/_build-battlegrounds-hero-stats';
import { STAT_KEY_TRINKET } from '../config';
import { s3 } from './_build-aggregated-stats';

export const persistData = async (mergedStats: readonly BgsTrinketStat[], timePeriod: TimePeriod, lastUpdate: Date) => {
	const stat: BgsTrinketStats = {
		trinketStats: mergedStats,
		lastUpdateDate: lastUpdate,
		dataPoints: mergedStats.map((s) => s.dataPoints).reduce((a, b) => a + b, 0),
		timePeriod: timePeriod,
	};
	// console.log('persisting data', stat.dataPoints, stat.heroStats?.length);
	await s3.writeFile(
		gzipSync(JSON.stringify(stat)),
		STATS_BUCKET,
		STAT_KEY_TRINKET.replace('%timePeriod%', timePeriod),
		'application/json',
		'gzip',
	);
};
