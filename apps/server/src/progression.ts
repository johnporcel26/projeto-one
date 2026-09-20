import type { PlayerResources, Stats } from "@onepiece/shared";

/** Single source of truth for progression. TODO: BALANCE before production. */
export const progressionConfig = {
  maxLevel: 100,
  xp: { base: 100, linear: 50, quadratic: 25 },
  baseStats: { strength: 10, defense: 5, hp: 100, mana: 50, critBps: 500, evasionBps: 300 },
  growthPerLevel: { strength: 2, defense: 1.5, hp: 12, mana: 6, critBps: 20, evasionBps: 15 },
  caps: { critBps: 4000, evasionBps: 3500 },
  combat: { critMultiplier: 1.5 },
} as const;

export interface ProgressionState { level: number; totalXp: number; xpIntoCurrentLevel: number; xpRequiredForNextLevel: number | null; stats: Pick<Stats, "strength" | "defense" | "maxHp" | "maxMana" | "critChanceBps" | "evasionChanceBps">; }

const validLevel = (level: number): number => Math.max(1, Math.min(progressionConfig.maxLevel, Math.floor(level)));
const validXp = (totalXp: number): number => Math.max(0, Math.floor(Number.isFinite(totalXp) ? totalXp : 0));

export function xpRequiredForNextLevel(level: number): number | null {
  const current = validLevel(level);
  if (current >= progressionConfig.maxLevel) return null;
  const n = current - 1;
  return progressionConfig.xp.base + progressionConfig.xp.linear * n + progressionConfig.xp.quadratic * n * n;
}

export function totalXpRequiredForLevel(level: number): number {
  let total = 0;
  for (let current = 1; current < validLevel(level); current += 1) total += xpRequiredForNextLevel(current) ?? 0;
  return total;
}

export function calculateLevelFromTotalXp(totalXp: number): number {
  const xp = validXp(totalXp);
  let level = 1;
  // Bounded by maxLevel: safe for arbitrary client-independent XP values.
  while (level < progressionConfig.maxLevel && xp >= totalXpRequiredForLevel(level + 1)) level += 1;
  return level;
}

export function calculateXpIntoLevel(totalXp: number): number {
  const level = calculateLevelFromTotalXp(totalXp);
  return level >= progressionConfig.maxLevel ? 0 : validXp(totalXp) - totalXpRequiredForLevel(level);
}

export function calculateStatsForLevel(level: number): ProgressionState["stats"] {
  const levelsGained = validLevel(level) - 1;
  const base = progressionConfig.baseStats; const growth = progressionConfig.growthPerLevel;
  return {
    strength: Math.floor(base.strength + growth.strength * levelsGained),
    defense: Math.floor(base.defense + growth.defense * levelsGained),
    maxHp: Math.floor(base.hp + growth.hp * levelsGained),
    maxMana: Math.floor(base.mana + growth.mana * levelsGained),
    critChanceBps: Math.min(progressionConfig.caps.critBps, Math.floor(base.critBps + growth.critBps * levelsGained)),
    evasionChanceBps: Math.min(progressionConfig.caps.evasionBps, Math.floor(base.evasionBps + growth.evasionBps * levelsGained)),
  };
}

export function calculateProgression(totalXp: number): ProgressionState {
  const normalizedXp = validXp(totalXp); const level = calculateLevelFromTotalXp(normalizedXp);
  return { level, totalXp: normalizedXp, xpIntoCurrentLevel: calculateXpIntoLevel(normalizedXp), xpRequiredForNextLevel: xpRequiredForNextLevel(level), stats: calculateStatsForLevel(level) };
}

export function increaseResourcesForLevelUp(resources: PlayerResources, oldStats: ProgressionState["stats"], newStats: ProgressionState["stats"]): PlayerResources {
  return { currentHp: Math.min(newStats.maxHp, resources.currentHp + newStats.maxHp - oldStats.maxHp), currentMana: Math.min(newStats.maxMana, resources.currentMana + newStats.maxMana - oldStats.maxMana) };
}
