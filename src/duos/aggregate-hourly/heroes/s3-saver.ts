import { gzipSync } from 'zlib';
import { BgsGlobalHeroStat, BgsHeroStatsV2, MmrPercentile, MmrPercentileFilter, TimePeriod } from '../../../models';
import { STATS_BUCKET, STATS_KEY_PREFIX } from '../../hourly/_build-battlegrounds-hero-stats';
import { STAT_KEY_HERO, STAT_KEY_PERCENTILE } from '../config';
import { s3 } from './_build-aggregated-stats';

export const persistAnomaliesList = async (anomalies: readonly string[]) => {
	await s3.writeFile(
		gzipSync(JSON.stringify(anomalies)),
		STATS_BUCKET,
		`${STATS_KEY_PREFIX}/anomalies-list.gz.json`,
		'application/json',
		'gzip',
	);
};

export const persistData = async (
	mergedStats: readonly BgsGlobalHeroStat[],
	mmrPercentiles: readonly MmrPercentile[],
	anomaly: string | null,
	lastUpdate: Date,
	timePeriod: TimePeriod,
	mmrPercentile: MmrPercentileFilter,
) => {
	const stat: BgsHeroStatsV2 = {
		heroStats: mergedStats.map((stat) => ({
			...stat,
			mmrPercentile: mmrPercentile,
			timePeriod: timePeriod,
		})),
		lastUpdateDate: lastUpdate,
		dataPoints: mergedStats.map((s) => s.dataPoints).reduce((a, b) => a + b, 0),
		mmrPercentiles: mmrPercentiles,
	};
	// console.log('persisting data', stat.dataPoints, stat.heroStats?.length);
	await s3.writeFile(
		gzipSync(JSON.stringify(stat)),
		STATS_BUCKET,
		STAT_KEY_HERO.replace('%anomaly%', anomaly ? `anomalies/${anomaly}/` : '')
			.replace('%mmrPercentile%', `${mmrPercentile}`)
			.replace('%timePeriod%', timePeriod),
		'application/json',
		'gzip',
	);
	await s3.writeFile(
		gzipSync(JSON.stringify(mmrPercentiles)),
		STATS_BUCKET,
		STAT_KEY_PERCENTILE.replace('%anomaly%', anomaly ? `anomalies/${anomaly}/` : '').replace(
			'%timePeriod%',
			timePeriod,
		),
		'application/json',
		'gzip',
	);
};
