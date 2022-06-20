import { AllCardsService, CardIds, ReferenceCard } from '@firestone-hs/reference-data';
import fetch, { RequestInfo } from 'node-fetch';

function partitionArray<T>(array: readonly T[], partitionSize: number): readonly T[][] {
	const workingCopy: T[] = [...array];
	const result: T[][] = [];
	while (workingCopy.length) {
		result.push(workingCopy.splice(0, partitionSize));
	}
	return result;
}

async function http(request: RequestInfo): Promise<any> {
	return new Promise(resolve => {
		fetch(request)
			.then(
				response => {
					return response.text();
				},
				error => {
					console.warn('could not retrieve review', error);
				},
			)
			.then(body => {
				resolve(body);
			});
	});
}

async function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export const groupByFunction = (keyExtractor: (obj: object | string) => string) => array =>
	array.reduce((objectsByKeyValue, obj) => {
		const value = keyExtractor(obj);
		objectsByKeyValue[value] = (objectsByKeyValue[value] || []).concat(obj);
		return objectsByKeyValue;
	}, {});

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

export { partitionArray, http, sleep };

export const normalizeHeroCardId = (heroCardId: string, allCards: AllCardsService = null): string => {
	if (!heroCardId) {
		return heroCardId;
	}

	if (allCards) {
		const heroCard = allCards.getCard(heroCardId);
		if (!!heroCard?.battlegroundsHeroParentDbfId) {
			const parentCard = allCards.getCardFromDbfId(heroCard.battlegroundsHeroParentDbfId);
			if (!!parentCard) {
				return parentCard.id;
			}
		}
	}
	// Fallback to regex
	const bgHeroSkinMatch = heroCardId.match(/(.*)_SKIN_.*/);
	// console.debug('normalizing', heroCardId, bgHeroSkinMatch);
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
