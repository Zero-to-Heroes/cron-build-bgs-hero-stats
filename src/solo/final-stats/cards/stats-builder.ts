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
	const totalOther = data.map((d) => d.totalOther).reduce((a, b) => a + b, 0);
	const totalPlacementOther = data.map((d) => d.totalOther * d.averagePlacementOther).reduce((a, b) => a + b, 0);
	const averagePlacement = totalPlacement / totalPlayed;
	const averagePlacementOther = totalPlacementOther / totalOther;
	const averagePlacementAtMmr: BgsCardStat['averagePlacementAtMmr'] = buildAveragePlacementAtMmr(data);
	const averagePlacementAtMmrOther: BgsCardStat['averagePlacementAtMmrOther'] = buildAveragePlacementAtMmrOther(data);
	const turnStats: readonly BgsCardTurnStat[] = buildTurnStats(data);
	const heroStats: readonly BgsCardHeroStat[] = buildHeroStats(data);

	const result: BgsCardStat = {
		cardId: ref.cardId,
		totalPlayed: totalPlayed,
		averagePlacement: averagePlacement,
		averagePlacementOther: averagePlacementOther,
		averagePlacementAtMmr: averagePlacementAtMmr,
		averagePlacementAtMmrOther: averagePlacementAtMmrOther,
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
		const averagePlacementAtMmr = buildAveragePlacementAtMmr(data);
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
		const totalPlayedOther = relevantData.map((d) => d.totalPlayedAtTurnOther).reduce((a, b) => a + b, 0);
		const totalPlacement = relevantData
			.map((d) => d.totalPlayedAtTurn * d.averagePlacement)
			.reduce((a, b) => a + b, 0);
		const totalPlacementOther = relevantData
			.map((d) => d.totalPlayedAtTurnOther * d.averagePlacementOther)
			.reduce((a, b) => a + b, 0);
		const averagePlacement = totalPlacement / totalPlayed;
		const averagePlacementOther = totalPlacementOther / totalPlayedOther;
		const averagePlacementAtMmr = [];
		const turnResult: BgsCardTurnStat = {
			turn: parseInt(turn),
			totalPlayedAtTurn: totalPlayed,
			averagePlacement: averagePlacement,
			totalPlayedAtTurnOther: totalPlayedOther,
			averagePlacementOther: averagePlacementOther,
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

const buildAveragePlacementAtMmrOther = (
	data: readonly WithMmrAndTimePeriod<InternalBgsCardStat>[],
): BgsCardStat['averagePlacementAtMmrOther'] => {
	const groupedByMmr = groupByFunction((data: WithMmrAndTimePeriod<InternalBgsCardStat>) => data.mmrPercentile)(data);
	const result: BgsCardStat['averagePlacementAtMmrOther'] = Object.keys(groupedByMmr).map((mmr) => {
		const relevantData = groupedByMmr[mmr];
		const totalPlayed = relevantData.map((d) => d.totalOther).reduce((a, b) => a + b, 0);
		const totalPlacement = relevantData
			.map((d) => d.totalOther * d.averagePlacementOther)
			.reduce((a, b) => a + b, 0);
		const averagePlacement = totalPlacement / totalPlayed;
		const mmrResult: { mmr: number; placement: number } = {
			mmr: parseInt(mmr),
			placement: averagePlacement,
		};
		return mmrResult;
	});
	return result;
};
