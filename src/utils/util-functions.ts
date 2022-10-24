import { logger } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService, CardIds, ReferenceCard } from '@firestone-hs/reference-data';

export const toCreationDate = (today: Date): string => {
	return `${today
		.toISOString()
		.slice(0, 19)
		.replace('T', ' ')}.${today.getMilliseconds()}`;
};

export const formatDate = (today: Date): string => {
	return `${today
		.toISOString()
		.slice(0, 19)
		.replace('T', ' ')}.000000`;
};

export const getCardFromCardId = (cardId: number | string, cards: AllCardsService): ReferenceCard => {
	const isDbfId = !isNaN(+cardId);
	const card = isDbfId ? cards.getCardFromDbfId(+cardId) : cards.getCard(cardId as string);
	return card;
};

export const normalizeHeroCardId = (heroCardId: string, allCards: AllCardsService): string => {
	if (!heroCardId) {
		return heroCardId;
	}

	const heroCard = allCards.getCard(heroCardId);
	if (!!heroCard?.battlegroundsHeroParentDbfId) {
		const parentCard = allCards.getCardFromDbfId(heroCard.battlegroundsHeroParentDbfId);
		if (!!parentCard) {
			return parentCard.id;
		}
	}

	// Fallback to regex
	const bgHeroSkinMatch = heroCardId.match(/(.*)_SKIN_.*/);
	// logger.debug('normalizing', heroCardId, bgHeroSkinMatch);
	if (bgHeroSkinMatch) {
		return bgHeroSkinMatch[1];
	}

	switch (heroCardId) {
		case CardIds.ArannaStarseeker_ArannaUnleashedTokenBattlegrounds:
			return CardIds.ArannaStarseekerBattlegrounds;
		case CardIds.QueenAzshara_NagaQueenAzsharaToken:
			return CardIds.QueenAzshara_BG22_HERO_007;
		default:
			return heroCardId;
	}
};

export const combine = <T>(input: readonly T[], chooseN: number): T[][] => {
	const finalResult: T[][] = [];

	const intermediateResult = [];
	intermediateResult.length = chooseN;
	const combineInternal = <T>(input: readonly T[], chooseN: number, start = 0): void => {
		if (chooseN === 0) {
			finalResult.push([...intermediateResult].sort());
			return;
		}
		for (let i = start; i <= input.length - chooseN; i++) {
			intermediateResult[intermediateResult.length - chooseN] = input[i];
			if (
				intermediateResult.filter(e => !!e).length !== [...new Set(intermediateResult.filter(e => !!e))].length
			) {
				logger.warn('duplicates', intermediateResult, i, start, chooseN);
				throw new Error();
			}
			combineInternal(input, chooseN - 1, i + 1);
		}
	};
	combineInternal(input, chooseN, 0);

	return finalResult;
};

export const getMax = (array: readonly number[]): number => {
	let len = array.length;
	let max = -Infinity;

	while (len--) {
		if (array[len] == null) {
			continue;
		}
		max = array[len] > max ? array[len] : max;
	}
	return max;
};
