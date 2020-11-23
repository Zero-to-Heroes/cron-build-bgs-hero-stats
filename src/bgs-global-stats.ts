export class BgsGlobalStats {
	heroStats: readonly BgsGlobalHeroStat[];
}

export class BgsGlobalHeroStat {
	id: string;
	popularity: number;
	averagePosition: number;
	top4: number;
	top1: number;
	tier: BgsHeroTier;
	totalGames: number;
	tribesStat: readonly { tribe: string; percent: number }[];
	warbandStats: readonly { turn: number; totalStats: number }[];
	combatWinrate: readonly { turn: number; winrate: number }[];
}

export type BgsHeroTier = 'S' | 'A' | 'B' | 'C' | 'D';
