import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import {
	InternalBgsCardHeroStat,
	InternalBgsCardStat,
	InternalBgsCardStats,
	InternalBgsCardTurnStat,
} from '../../../internal-model';
import { BgsCardHeroStat, BgsCardStat, BgsCardTurnStat } from '../../../model-cards';
import { WithMmrAndTimePeriod } from '../../../models';

// These should all be for a single MMR
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

const buildSingleCardStat = (
	data: readonly WithMmrAndTimePeriod<InternalBgsCardStat>[],
	allCards: AllCardsService,
): BgsCardStat => {
	const ref = data[0];
	const totalPlayed = data.map((d) => d.totalPlayed).reduce((a, b) => a + b, 0);
	const totalPlacement = data.map((d) => d.totalPlayed * d.averagePlacement).reduce((a, b) => a + b, 0);
	const averagePlacement = totalPlacement / totalPlayed;
	const averagePlacementAtMmr: BgsCardStat['averagePlacementAtMmr'] = buildAveragePlacementAtMmr(data);
	const turnStats: readonly BgsCardTurnStat[] = buildTurnStats(data);
	const heroStats: readonly BgsCardHeroStat[] = buildHeroStats(data);

	const result: BgsCardStat = {
		cardId: ref.cardId,
		totalPlayed: totalPlayed,
		averagePlacement: averagePlacement,
		averagePlacementAtMmr: averagePlacementAtMmr,
		turnStats: turnStats,
		heroStats: heroStats,
	};
	return result;
};

const buildHeroStats = (data: readonly WithMmrAndTimePeriod<InternalBgsCardStat>[]): readonly BgsCardHeroStat[] => {
	const allHeroStats = data.flatMap((d) => d.heroStats);
	const groupedByHero = groupByFunction((data: InternalBgsCardHeroStat) => data.heroCardId)(allHeroStats);
	return Object.keys(groupedByHero).map((heroCardId) => {
		const relevantData = groupedByHero[heroCardId];
		const totalPlayed = relevantData.map((d) => d.totalPlayedWithHero).reduce((a, b) => a + b, 0);
		const totalPlacement = relevantData
			.map((d) => d.totalPlayedWithHero * d.averagePlacement)
			.reduce((a, b) => a + b, 0);
		const averagePlacement = totalPlacement / totalPlayed;
		const averagePlacementAtMmr = [];
		const turnStats = buildTurnStats(relevantData);
		const heroResult: BgsCardHeroStat = {
			heroCardId: heroCardId,
			totalPlayedWithHero: totalPlayed,
			averagePlacement: averagePlacement,
			averagePlacementAtMmr: averagePlacementAtMmr,
			turnStats: turnStats,
		};
		return heroResult;
	});
};

const buildTurnStats = (
	data: readonly { turnStats: readonly InternalBgsCardTurnStat[] }[],
): readonly BgsCardTurnStat[] => {
	const allTurnStats = data.flatMap((d) => d.turnStats);
	const groupedByTurn = groupByFunction((data: InternalBgsCardTurnStat) => data.turn)(allTurnStats);
	return Object.keys(groupedByTurn).map((turn) => {
		const relevantData = groupedByTurn[turn];
		const totalPlayed = relevantData.map((d) => d.totalPlayedAtTurn).reduce((a, b) => a + b, 0);
		const totalPlacement = relevantData
			.map((d) => d.totalPlayedAtTurn * d.averagePlacement)
			.reduce((a, b) => a + b, 0);
		const averagePlacement = totalPlacement / totalPlayed;
		const averagePlacementAtMmr = [];
		const turnResult: BgsCardTurnStat = {
			turn: parseInt(turn),
			totalPlayedAtTurn: totalPlayed,
			averagePlacement: averagePlacement,
			averagePlacementAtMmr: averagePlacementAtMmr,
		};
		return turnResult;
	});
};

const buildAveragePlacementAtMmr = (
	data: readonly WithMmrAndTimePeriod<InternalBgsCardStat>[],
): BgsCardStat['averagePlacementAtMmr'] => {
	const groupedByMmr = groupByFunction((data: WithMmrAndTimePeriod<InternalBgsCardStat>) => data.mmrPercentile)(data);
	const result: BgsCardStat['averagePlacementAtMmr'] = Object.keys(groupedByMmr).map((mmr) => {
		const relevantData = groupedByMmr[mmr];
		const totalPlayed = relevantData.map((d) => d.totalPlayed).reduce((a, b) => a + b, 0);
		const totalPlacement = relevantData.map((d) => d.totalPlayed * d.averagePlacement).reduce((a, b) => a + b, 0);
		const averagePlacement = totalPlacement / totalPlayed;
		const mmrResult: { mmr: number; placement: number } = {
			mmr: parseInt(mmr),
			placement: averagePlacement,
		};
		return mmrResult;
	});
	return result;
};
