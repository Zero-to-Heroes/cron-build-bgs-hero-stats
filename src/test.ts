const combine = <T>(input: readonly T[], chooseN: number): T[][] => {
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
				console.warn('duplicates', intermediateResult, i, start, chooseN);
				throw new Error();
			}
			combineInternal(input, chooseN - 1, i + 1);
		}
	};
	combineInternal(input, chooseN, 0);

	return finalResult;
};

const work = () => {
	const combinations = combine([14, 15, 17, 20, 43, 18, 23, 24], 5);
	console.log(combinations);
};

work();
