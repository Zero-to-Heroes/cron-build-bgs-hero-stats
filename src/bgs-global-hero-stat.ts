export class BgsGlobalHeroStat {
	id: string;
	popularity: number;
	averagePosition: number;
	top4: number;
	top1: number;
	tier: BgsHeroTier;
}

export type BgsHeroTier = 'S' | 'A' | 'B' | 'C' | 'D';
