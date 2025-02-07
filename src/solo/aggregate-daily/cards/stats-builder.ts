import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { InternalBgsCardStat, InternalBgsCardStats, InternalBgsCardTurnStat } from '../../../internal-model';
import { WithMmrAndTimePeriod } from '../../../models';

// These should all be for a single MMR
export const buildCardStats = (
	hourlyData: readonly InternalBgsCardStats[],
	allCards: AllCardsService,
): readonly InternalBgsCardStat[] => {
	const allCardStats: readonly WithMmrAndTimePeriod<InternalBgsCardStat>[] = hourlyData.flatMap(
		(data) => data.cardStats,
	);
	const groupedByCard = groupByFunction((data: WithMmrAndTimePeriod<InternalBgsCardStat>) => data.cardId)(
		allCardStats,
	);
	return Object.keys(groupedByCard).map((cardId) => buildSingleCardStat(groupedByCard[cardId], allCards));
};

const buildSingleCardStat = (
	data: readonly WithMmrAndTimePeriod<InternalBgsCardStat>[],
	allCards: AllCardsService,
): InternalBgsCardStat => {
	const ref = data[0];

	const totalPlayed = data
		.filter((d) => d.averagePlacement != null && d.totalPlayed != null)
		.map((d) => d.totalPlayed)
		.reduce((a, b) => a + b, 0);
	const totalPlacement = data
		.filter((d) => d.averagePlacement != null && d.totalPlayed != null)
		.map((d) => d.totalPlayed * d.averagePlacement)
		.reduce((a, b) => a + b, 0);
	const averagePlacement = totalPlacement / totalPlayed;

	const totalOther = data
		.filter((d) => d.averagePlacementOther != null && d.totalOther != null)
		.map((d) => d.totalOther)
		.reduce((a, b) => a + b, 0);
	const totalPlacementOther = data
		.filter((d) => d.averagePlacementOther != null && d.totalOther != null)
		.map((d) => d.totalOther * d.averagePlacementOther)
		.reduce((a, b) => a + b, 0);
	const averagePlacementOther = totalPlacementOther / totalOther;

	const turnStats: readonly InternalBgsCardTurnStat[] = buildTurnStats(data);
	// const heroStats: readonly InternalBgsCardHeroStat[] = buildHeroStats(data);

	const result: InternalBgsCardStat = {
		cardId: ref.cardId,
		totalPlayed: totalPlayed,
		averagePlacement: averagePlacement,
		totalOther: totalOther,
		averagePlacementOther: averagePlacementOther,
		turnStats: turnStats,
		// heroStats: heroStats,
	};
	return result;
};

// const buildHeroStats = (
// 	data: readonly WithMmrAndTimePeriod<InternalBgsCardStat>[],
// ): readonly InternalBgsCardHeroStat[] => {
// 	const allHeroStats = data.flatMap((d) => d.heroStats);
// 	const groupedByHero = groupByFunction((data: InternalBgsCardHeroStat) => data.heroCardId)(allHeroStats);
// 	return Object.keys(groupedByHero).map((heroCardId) => {
// 		const relevantData = groupedByHero[heroCardId];
// 		const totalPlayed = relevantData.map((d) => d.totalPlayedWithHero).reduce((a, b) => a + b, 0);
// 		const totalPlacement = relevantData
// 			.map((d) => d.totalPlayedWithHero * d.averagePlacement)
// 			.reduce((a, b) => a + b, 0);
// 		const averagePlacement = totalPlacement / totalPlayed;
// 		const turnStats = buildTurnStats(relevantData);
// 		const heroResult: InternalBgsCardHeroStat = {
// 			heroCardId: heroCardId,
// 			totalPlayedWithHero: totalPlayed,
// 			averagePlacement: averagePlacement,
// 			turnStats: turnStats,
// 		};
// 		return heroResult;
// 	});
// };

const buildTurnStats = (
	data: readonly { turnStats: readonly InternalBgsCardTurnStat[] }[],
): readonly InternalBgsCardTurnStat[] => {
	const allTurnStats = data.flatMap((d) => d.turnStats);
	const groupedByTurn = groupByFunction((data: InternalBgsCardTurnStat) => data.turn)(allTurnStats);
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

		const totalPlayerAtTurnOther = relevantData
			.filter((d) => d.averagePlacementOther != null && d.totalOther != null)
			.map((d) => d.totalOther)
			.reduce((a, b) => a + b, 0);
		const totalPlacementOther = relevantData
			.filter((d) => d.averagePlacementOther != null && d.totalOther != null)
			.map((d) => d.totalOther * d.averagePlacementOther)
			.reduce((a, b) => a + b, 0);
		const averagePlacementOther = totalPlacementOther / totalPlayerAtTurnOther;
		const turnResult: InternalBgsCardTurnStat = {
			turn: parseInt(turn),
			totalPlayed: totalPlayed,
			averagePlacement: averagePlacement,
			totalOther: totalPlayerAtTurnOther,
			averagePlacementOther: averagePlacementOther,
		};
		return turnResult;
	});
};
