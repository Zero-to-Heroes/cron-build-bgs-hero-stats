import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { average } from '../../../common/util-functions';
import { InternalBgsGlobalTrinketStat, InternalBgsTrinketStats } from '../../../internal-model';
import { BgsTrinketStat } from '../../../model-trinkets';
import { WithMmrAndTimePeriod } from '../../../models';
import { mmrPercentiles } from './_build-aggregated-stats';

export const buildTrinketStats = (
	hourlyData: readonly InternalBgsTrinketStats[],
	allCards: AllCardsService,
): readonly BgsTrinketStat[] => {
	const allTrinketStats: readonly WithMmrAndTimePeriod<InternalBgsGlobalTrinketStat>[] = hourlyData.flatMap(
		(data) => data.trinketStats,
	);
	const groupedByTrinket = groupByFunction(
		(data: WithMmrAndTimePeriod<InternalBgsGlobalTrinketStat>) => data.trinketCardId,
	)(allTrinketStats);
	return Object.keys(groupedByTrinket).map((trinketCardId) =>
		buildSingleTrinketStat(groupedByTrinket[trinketCardId], allCards),
	);
};

const buildSingleTrinketStat = (
	data: readonly WithMmrAndTimePeriod<InternalBgsGlobalTrinketStat>[],
	allCards: AllCardsService,
): BgsTrinketStat => {
	const ref = data[0];
	const placementByMmr: readonly {
		mmr: number;
		dataPoints: number;
		placement: number;
	}[] = mmrPercentiles.map((percentile) => {
		const allData = data.filter((d) => d.mmrPercentile === percentile);
		const averagePlacement = average(allData.map((d) => d.averagePlacement));
		return {
			mmr: percentile,
			dataPoints: allData.map((d) => d.dataPoints).reduce((a, b) => a + b, 0),
			placement: averagePlacement,
		};
	});
	const pickRateAtMmr: readonly {
		mmr: number;
		dataPoints: number;
		pickRate: number;
	}[] = mmrPercentiles.map((percentile) => {
		const allData = data.filter((d) => d.mmrPercentile === percentile);
		const pickedTotal = allData.map((d) => d.dataPoints).reduce((a, b) => a + b, 0);
		const offeredTotal = allData.map((d) => d.totalOffered).reduce((a, b) => a + b, 0);
		const pickRate = pickedTotal / offeredTotal;
		return {
			mmr: percentile,
			dataPoints: pickedTotal,
			pickRate: pickRate,
		};
	});

	const result: BgsTrinketStat = {
		trinketCardId: ref.trinketCardId,
		dataPoints: pickRateAtMmr.find((d) => d.mmr === 100).dataPoints,
		pickRate: pickRateAtMmr.find((d) => d.mmr === 100).pickRate,
		averagePlacement: placementByMmr.find((d) => d.mmr === 100).placement,
		averagePlacementAtMmr: placementByMmr,
		pickRateAtMmr: pickRateAtMmr,
	};
	return result;
};
