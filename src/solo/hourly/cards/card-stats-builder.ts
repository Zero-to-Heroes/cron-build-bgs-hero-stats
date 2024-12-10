import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService, CardIds } from '@firestone-hs/reference-data';
import {
	InternalBgsCardHeroStat,
	InternalBgsCardStat,
	InternalBgsCardTurnStat,
	InternalBgsRow,
} from '../../../internal-model';

export const buildCardStatsForMmr = (
	rows: readonly InternalBgsRow[],
	allCards: AllCardsService,
): readonly InternalBgsCardStat[] => {
	console.debug('building card stats for', rows.length, 'rows');
	const denormalized = rows.flatMap((row) => {
		const cards = row.playedCardsExpanded;
		return [
			...cards.map((card) => ({
				...row,
				playedCardsExpanded: [
					allCards.getCard(card.cardId).isCoin
						? {
								...card,
								cardId: CardIds.TheCoinCore,
						  }
						: card,
				],
			})),
		];
	});
	console.debug('denormalized into', denormalized.length, 'rows');
	const groupedByCardPlayed = groupByFunction((r: InternalBgsRow) => r.playedCardsExpanded[0].cardId)(denormalized);
	return Object.keys(groupedByCardPlayed)
		.sort()
		.map((cardId) => {
			const relevantRows = groupedByCardPlayed[cardId];
			return buildStatsForSingleCard(relevantRows, denormalized);
		});
};

// All rows here belong to a single card
const buildStatsForSingleCard = (
	rows: readonly InternalBgsRow[],
	allRows: readonly InternalBgsRow[],
): InternalBgsCardStat => {
	const ref = rows[0];

	// console.debug('building stats for', ref.playedCardsExpanded[0].cardId);
	const relevantReviewIds = rows.map((r) => r.reviewId);
	const otherRows = allRows.filter((r) => !relevantReviewIds.includes(r.reviewId));
	// console.debug('mapped other rows', ref.playedCardsExpanded[0].cardId, rows.length, otherRows.length);
	const otherGroupedByReviewId = groupByFunction((r: InternalBgsRow) => r.reviewId)(otherRows);
	// console.debug('grouped other rows');
	// Keep only one row per reviewId
	const finalOtherRows = Object.values(otherGroupedByReviewId).map((r) => r[0]);
	// console.debug('final other rows');

	const averagePlacement = average(rows.map((r) => r.playerRank));
	const averagePlacementOther = average(finalOtherRows.map((r) => r.playerRank));
	// console.debug('built averages', averagePlacement, averagePlacementOther);
	const turnStats = buildTurnStats(rows, finalOtherRows);
	// console.debug('built turn stats');
	const heroStats = buildHeroStats(rows, finalOtherRows);
	// console.debug('built hero stats');

	const result: InternalBgsCardStat = {
		cardId: ref.playedCardsExpanded[0].cardId,
		totalPlayed: rows.length,
		averagePlacement: averagePlacement,
		totalOther: finalOtherRows.length,
		averagePlacementOther: averagePlacementOther,
		turnStats: turnStats,
		heroStats: heroStats,
	};
	return result;
};

const buildHeroStats = (
	rows: readonly InternalBgsRow[],
	otherRows: readonly InternalBgsRow[],
): readonly InternalBgsCardHeroStat[] => {
	const groupedByHero = groupByFunction((r: InternalBgsRow) => r.heroCardId)(rows);
	return Object.keys(groupedByHero)
		.sort()
		.map((heroCardId) => {
			const relevantRows = groupedByHero[heroCardId];
			const relevantOtherRows = otherRows.filter((r) => r.heroCardId === heroCardId);
			const result: InternalBgsCardHeroStat = {
				heroCardId: heroCardId,
				totalPlayedWithHero: relevantRows.length,
				averagePlacement: average(relevantRows.map((r) => r.playerRank)),
				turnStats: buildTurnStats(relevantRows, relevantOtherRows),
			};
			return result;
		});
};

const buildTurnStats = (
	rows: readonly InternalBgsRow[],
	otherRows: readonly InternalBgsRow[],
): readonly InternalBgsCardTurnStat[] => {
	// TODO: fix the other rows stuff

	// const relevantReviewIds = rows.map((r) => r.reviewId);
	// const otherRows = allRows.filter((r) => !relevantReviewIds.includes(r.reviewId));
	// console.debug('building stats for', ref.playedCardsExpanded[0].cardId, rows.length, otherRows.length);
	// const otherGroupedByReviewId = groupByFunction((r: InternalBgsRow) => r.reviewId)(otherRows);
	// // Keep only one row per reviewId
	// const finalOtherRows = Object.values(otherGroupedByReviewId).map((r) => r[0]);

	const groupedByTurn = groupByFunction((r: InternalBgsRow) => r.playedCardsExpanded[0].turn)(rows);
	const groupedByTurnOther = groupByFunction((r: InternalBgsRow) => r.playedCardsExpanded[0].turn)(otherRows);
	return Object.keys(groupedByTurn)
		.sort()
		.map((turn) => {
			const relevantRows = groupedByTurn[turn];
			const result: InternalBgsCardTurnStat = {
				turn: parseInt(turn),
				totalPlayedAtTurn: relevantRows.length,
				averagePlacement: average(relevantRows.map((r) => r.playerRank)),
				totalPlayedAtTurnOther: groupedByTurnOther[turn]?.length || 0,
				averagePlacementOther: average(groupedByTurnOther[turn]?.map((r) => r.playerRank) || []),
			};
			return result;
		});
};

const average = (data: readonly number[]): number => {
	return data.reduce((a, b) => a + b, 0) / data.length;
};
