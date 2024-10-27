import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
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
	console.debug('building minion stats for', rows.length, 'rows');
	const denormalized = rows.flatMap((row) => {
		const cards = row.playedCardsExpanded;
		return [...cards.map((card) => ({ ...row, playedCardsExpanded: [card] }))];
	});
	const groupedByCardPlayed = groupByFunction((r: InternalBgsRow) => r.playedCardsExpanded[0].cardId)(denormalized);
	return Object.keys(groupedByCardPlayed)
		.sort()
		.map((cardId) => {
			const relevantRows = groupedByCardPlayed[cardId];
			return buildStatsForSingleCard(relevantRows);
		});
};

// All rows here belong to a single card
const buildStatsForSingleCard = (rows: readonly InternalBgsRow[]): InternalBgsCardStat => {
	const ref = rows[0];
	const averagePlacement = average(rows.map((r) => r.playerRank));

	const result: InternalBgsCardStat = {
		cardId: ref.playedCardsExpanded[0].cardId,
		totalPlayed: rows.length,
		averagePlacement: averagePlacement,
		turnStats: buildTurnStats(rows),
		heroStats: buildHeroStats(rows),
	};
	return result;
};

const buildHeroStats = (rows: readonly InternalBgsRow[]): readonly InternalBgsCardHeroStat[] => {
	const groupedByHero = groupByFunction((r: InternalBgsRow) => r.heroCardId)(rows);
	return Object.keys(groupedByHero)
		.sort()
		.map((heroCardId) => {
			const relevantRows = groupedByHero[heroCardId];
			const result: InternalBgsCardHeroStat = {
				heroCardId: heroCardId,
				totalPlayedWithHero: relevantRows.length,
				averagePlacement: average(relevantRows.map((r) => r.playerRank)),
				turnStats: buildTurnStats(relevantRows),
			};
			return result;
		});
};

const buildTurnStats = (rows: readonly InternalBgsRow[]): readonly InternalBgsCardTurnStat[] => {
	const groupedByTurn = groupByFunction((r: InternalBgsRow) => r.playedCardsExpanded[0].turn)(rows);
	return Object.keys(groupedByTurn)
		.sort()
		.map((turn) => {
			const relevantRows = groupedByTurn[turn];
			const result: InternalBgsCardTurnStat = {
				turn: parseInt(turn),
				totalPlayedAtTurn: relevantRows.length,
				averagePlacement: average(relevantRows.map((r) => r.playerRank)),
			};
			return result;
		});
};

const average = (data: readonly number[]): number => {
	return data.reduce((a, b) => a + b, 0) / data.length;
};
