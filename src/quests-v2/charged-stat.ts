export type ChargedStat<T> = T & {
	readonly mmrPercentile: 100 | 50 | 25 | 10 | 1;
	readonly timePeriod: 'all-time' | 'past-three' | 'past-seven' | 'last-patch';
};
