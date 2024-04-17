import { InternalBgsRow } from '../../internal-model';

export const buildWarbandStats = (
	rows: readonly InternalBgsRow[],
): readonly { turn: number; dataPoints: number; totalStats: number }[] => {
	const data: { [turn: string]: { dataPoints: number; totalStats: number } } = {};
	// Before that, there was an issue with disconnects, where the first turn after the
	// reconnect would be turn 0, leading to an inflation of early turn stats
	const validRows = rows.filter((row) => row.id > 5348374);
	for (const row of validRows) {
		if (!row.warbandStats?.length) {
			continue;
		}

		let parsed: readonly { turn: number; totalStats: number }[] = [];
		try {
			parsed = JSON.parse(row.warbandStats);
		} catch (e) {
			console.warn('Could not parse warband stats', row.id, row.warbandStats, e);
		}
		if (!parsed?.length) {
			continue;
		}

		for (const turnInfo of parsed) {
			if (turnInfo.turn === 0 || turnInfo.totalStats == null || isNaN(turnInfo.totalStats)) {
				continue;
			}
			// To avoid polluting the stats with big Tarecgosa outliers
			if (turnInfo.totalStats > 20000) {
				continue;
			}
			const existingInfo = data['' + turnInfo.turn] ?? { dataPoints: 0, totalStats: 0 };
			existingInfo.dataPoints = existingInfo.dataPoints + 1;
			existingInfo.totalStats = existingInfo.totalStats + Math.round(turnInfo.totalStats);
			data['' + turnInfo.turn] = existingInfo;
		}
	}

	const result: { turn: number; dataPoints: number; totalStats: number }[] = Object.keys(data).map((turn) => ({
		turn: +turn,
		dataPoints: data[turn].dataPoints,
		totalStats: data[turn].totalStats,
	}));
	return result;
};

export const buildCombatWinrate = (
	rows: readonly InternalBgsRow[],
): readonly { turn: number; dataPoints: number; totalWinrate: number }[] => {
	const ref = rows[0];
	const debug = ref.heroCardId === 'BG21_HERO_000';

	const data: { [turn: string]: { dataPoints: number; totalWinrate: number } } = {};
	for (const row of rows) {
		// logger.debug('building combatWinrate', row);
		if (!row.combatWinrate?.length) {
			continue;
		}

		let parsed: readonly { turn: number; winrate: number }[] = null;
		try {
			parsed = JSON.parse(row.combatWinrate);
			// logger.debug('parsed', parsed);
			if (!parsed?.length) {
				continue;
			}
		} catch (e) {
			console.error('Could not parse combat winrate', row.id, e);
			continue;
		}

		// if (debug) {
		// 	logger.log('handling combat winrate', parsed);
		// }

		for (const turnInfo of parsed) {
			if (turnInfo.turn === 0 || turnInfo.winrate == null) {
				continue;
			}
			// if (debug) {
			// 	logger.log('\t turnInfo', turnInfo);
			// }
			const existingInfo = data['' + turnInfo.turn] ?? { dataPoints: 0, totalWinrate: 0 };
			// if (debug) {
			// 	logger.log('\t existingInfo', existingInfo);
			// }
			existingInfo.dataPoints = existingInfo.dataPoints + 1;
			existingInfo.totalWinrate = existingInfo.totalWinrate + Math.round(turnInfo.winrate);
			// if (debug) {
			// 	logger.log('\t existingInfo after', existingInfo);
			// }
			data['' + turnInfo.turn] = existingInfo;
			// if (debug) {
			// 	logger.log('\t data', data);
			// }
		}
	}

	// if (debug) {
	// 	logger.log('\t data', data);
	// }
	const result: { turn: number; dataPoints: number; totalWinrate: number }[] = Object.keys(data).map((turn) => ({
		turn: +turn,
		dataPoints: data[turn].dataPoints,
		totalWinrate: data[turn].totalWinrate,
	}));
	// if (debug) {
	// 	logger.log('\t result', result);
	// }
	return result;
};
