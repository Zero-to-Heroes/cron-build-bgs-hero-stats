import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import {
	InternalBgsCardHeroStat,
	InternalBgsCardStat,
	InternalBgsCardStats,
	InternalBgsCardTurnStat,
} from '../../../internal-model';
import { BgsCardStat, BgsCardTurnStat } from '../../../model-cards';
import { WithMmrAndTimePeriod } from '../../../models';

// Single time period, multiple MMR
export const buildCardStats = (
	hourlyData: readonly InternalBgsCardStats[],
	allCards: AllCardsService,
): readonly BgsCardStat[] => {
	const allCardStats: readonly WithMmrAndTimePeriod<InternalBgsCardStat>[] = hourlyData.flatMap(
		(data) => data.cardStats,
	);
	const groupedByCard = groupByFunction((data: WithMmrAndTimePeriod<InternalBgsCardStat>) => data.cardId)(
		allCardStats,
	);
	return Object.keys(groupedByCard).map((cardId) => buildSingleCardStat(groupedByCard[cardId], allCards));
};

// Single time period, multiple MMR
const buildSingleCardStat = (
	data: readonly WithMmrAndTimePeriod<InternalBgsCardStat>[],
	allCards: AllCardsService,
): BgsCardStat => {
	const ref = data[0];

	const totalPlayed = data
		.filter((d) => d.averagePlacement != null && d.totalPlayed != null)
		.map((d) => d.totalPlayed)
		.reduce((a, b) => a + b, 0);
	const totalPlacement = data
		.filter((d) => d.averagePlacement != null && d.totalPlayed != null)
		.map((d) => d.totalPlayed * d.averagePlacement)
		.reduce((a, b) => a + b, 0);

	const totalOther = data
		.filter((d) => d.averagePlacementOther != null && d.totalOther != null)
		.map((d) => d.totalOther)
		.reduce((a, b) => a + b, 0);
	const totalPlacementOther = data
		.filter((d) => d.averagePlacementOther != null && d.totalOther != null)
		.map((d) => d.totalOther * d.averagePlacementOther)
		.reduce((a, b) => a + b, 0);
	const averagePlacement = totalPlacement / totalPlayed;
	const averagePlacementOther = totalPlacementOther / totalOther;

	// const averagePlacementAtMmr: BgsCardStat['averagePlacementAtMmr'] = buildAveragePlacementAtMmr(data);
	// const averagePlacementAtMmrOther: BgsCardStat['averagePlacementAtMmrOther'] = buildAveragePlacementAtMmrOther(data);
	const turnStats: readonly BgsCardTurnStat[] = buildTurnStats(data);
	// const heroStats: readonly BgsCardHeroStat[] = buildHeroStats(data);

	const result: BgsCardStat = {
		cardId: ref.cardId,
		totalPlayed: totalPlayed,
		averagePlacement: averagePlacement,
		averagePlacementOther: averagePlacementOther,
		// averagePlacementAtMmr: averagePlacementAtMmr,
		// averagePlacementAtMmrOther: averagePlacementAtMmrOther,
		turnStats: turnStats,
		// heroStats: heroStats,
	};
	return result;
};

// const buildHeroStats = (data: readonly WithMmrAndTimePeriod<InternalBgsCardStat>[]): readonly BgsCardHeroStat[] => {
// 	const allHeroStats: readonly WithMmrAndTimePeriod<InternalBgsCardHeroStat>[] = data.flatMap((d) =>
// 		d.heroStats.map((s) => ({
// 			...s,
// 			mmrPercentile: d.mmrPercentile,
// 			timePeriod: d.timePeriod,
// 		})),
// 	);
// 	const groupedByHero = groupByFunction((data: WithMmrAndTimePeriod<InternalBgsCardHeroStat>) => data.heroCardId)(
// 		allHeroStats,
// 	);
// 	return Object.keys(groupedByHero).map((heroCardId) => {
// 		const relevantData = groupedByHero[heroCardId];
// 		const totalPlayed = relevantData.map((d) => d.totalPlayedWithHero ?? 0).reduce((a, b) => a + b, 0);
// 		const totalPlacement = relevantData
// 			.filter((d) => d.averagePlacement != null && d.totalPlayedWithHero != null)
// 			.map((d) => d.totalPlayedWithHero * d.averagePlacement)
// 			.reduce((a, b) => a + b, 0);
// 		const averagePlacement = totalPlacement / totalPlayed;
// 		// const averagePlacementAtMmr: BgsCardStat['averagePlacementAtMmr'] = buildAveragePlacementAtMmr(data);
// 		// const averagePlacementAtMmrOther: BgsCardStat['averagePlacementAtMmrOther'] =
// 		// buildAveragePlacementAtMmrOther(data);
// 		const turnStats = buildTurnStats(relevantData);
// 		const heroResult: BgsCardHeroStat = {
// 			heroCardId: heroCardId,
// 			totalPlayedWithHero: totalPlayed,
// 			averagePlacement: averagePlacement,
// 			// averagePlacementAtMmr: averagePlacementAtMmr,
// 			// averagePlacementAtMmrOther: averagePlacementAtMmrOther,
// 			turnStats: turnStats,
// 		};
// 		return heroResult;
// 	});
// };

const buildTurnStats = (
	data: readonly WithMmrAndTimePeriod<InternalBgsCardStat | InternalBgsCardHeroStat>[],
): readonly BgsCardTurnStat[] => {
	const allTurnStats: readonly WithMmrAndTimePeriod<InternalBgsCardTurnStat>[] = data.flatMap((d) =>
		d.turnStats.map((s) => ({
			...s,
			mmrPercentile: d.mmrPercentile,
			timePeriod: d.timePeriod,
		})),
	);
	const groupedByTurn = groupByFunction((data: WithMmrAndTimePeriod<InternalBgsCardTurnStat>) => data.turn)(
		allTurnStats,
	);
	return Object.keys(groupedByTurn).map((turn) => {
		const relevantData = groupedByTurn[turn];

		const totalPlayed = relevantData
			.filter((d) => d.averagePlacement != null && d.totalPlayed != null)
			.map((d) => d.totalPlayed)
			.reduce((a, b) => a + b, 0);
		const totalPlacement = relevantData
			.filter((d) => d.averagePlacement != null && d.totalPlayed != null)
			.map((d) => d.totalPlayed * d.averagePlacement)
			.reduce((a, b) => a + b, 0);
		const averagePlacement = totalPlacement / totalPlayed;

		const totalPlayedOther = relevantData
			.filter((d) => d.averagePlacementOther != null && d.totalOther != null)
			.map((d) => d.totalOther)
			.reduce((a, b) => a + b, 0);
		const totalPlacementOther = relevantData
			.filter((d) => d.averagePlacementOther != null && d.totalOther != null)
			.map((d) => d.totalOther * d.averagePlacementOther)
			.reduce((a, b) => a + b, 0);
		const averagePlacementOther = totalPlacementOther / totalPlayedOther;

		// const averagePlacementAtMmr: BgsCardStat['averagePlacementAtMmr'] = buildAveragePlacementAtMmr(relevantData);
		// const averagePlacementAtMmrOther: BgsCardStat['averagePlacementAtMmrOther'] =
		// 	buildAveragePlacementAtMmrOther(relevantData);
		const turnResult: BgsCardTurnStat = {
			turn: parseInt(turn),
			totalPlayed: totalPlayed,
			averagePlacement: averagePlacement,
			totalOther: totalPlayedOther,
			averagePlacementOther: averagePlacementOther,
			// averagePlacementAtMmr: averagePlacementAtMmr,
			// averagePlacementAtMmrOther: averagePlacementAtMmrOther,
		};
		return turnResult;
	});
};

// const buildAveragePlacementAtMmr = (
// 	data: readonly WithMmrAndTimePeriod<InternalBgsCardStat | InternalBgsCardTurnStat>[],
// ): BgsCardStat['averagePlacementAtMmr'] => {
// 	const groupedByMmr = groupByFunction(
// 		(data: WithMmrAndTimePeriod<InternalBgsCardStat | InternalBgsCardTurnStat>) => data.mmrPercentile,
// 	)(data);
// 	const result: BgsCardStat['averagePlacementAtMmr'] = Object.keys(groupedByMmr).map((mmr) => {
// 		const relevantData = groupedByMmr[mmr];
// 		const totalPlayed = relevantData.map((d) => d.totalPlayed).reduce((a, b) => a + b, 0);
// 		const totalPlacement = relevantData.map((d) => d.totalPlayed * d.averagePlacement).reduce((a, b) => a + b, 0);
// 		const averagePlacement = totalPlacement / totalPlayed;
// 		const mmrResult: PlacementAtMmr = {
// 			mmr: parseInt(mmr),
// 			totalPlayed: totalPlayed,
// 			placement: averagePlacement,
// 		};
// 		return mmrResult;
// 	});
// 	return result;
// };

// const buildAveragePlacementAtMmrOther = (
// 	data: readonly WithMmrAndTimePeriod<InternalBgsCardStat | InternalBgsCardTurnStat>[],
// ): BgsCardStat['averagePlacementAtMmrOther'] => {
// 	const groupedByMmr = groupByFunction(
// 		(data: WithMmrAndTimePeriod<InternalBgsCardStat | InternalBgsCardTurnStat>) => data.mmrPercentile,
// 	)(data);
// 	const result: BgsCardStat['averagePlacementAtMmrOther'] = Object.keys(groupedByMmr).map((mmr) => {
// 		const relevantData = groupedByMmr[mmr];
// 		const totalPlayed = relevantData.map((d) => d.totalOther).reduce((a, b) => a + b, 0);
// 		const totalPlacement = relevantData
// 			.map((d) => d.totalOther * d.averagePlacementOther)
// 			.reduce((a, b) => a + b, 0);
// 		const averagePlacement = totalPlacement / totalPlayed;
// 		const mmrResult: PlacementAtMmr = {
// 			mmr: parseInt(mmr),
// 			totalPlayed: totalPlayed,
// 			placement: averagePlacement,
// 		};
// 		return mmrResult;
// 	});
// 	return result;
// };
