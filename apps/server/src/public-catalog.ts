import { hunts, type PublicCatalog } from "@onepiece/shared";
import type { ContentData } from "./content-repository.js";
type EnemyStats = { maxHp: number; xpReward: number; berriesReward: number };
let current: PublicCatalog = { items: [], fruits: [], enemies: [], hunts: [] };
/** Converts validated content into a player-safe read model; no Admin endpoint is involved. */
export function rebuildPublicCatalog(content: ContentData, stats: Record<string, EnemyStats>): void {
  const names = new Map(content.enemies.map((enemy) => [enemy.id, enemy.displayName]));
  const dropsFor = (id: string) => Object.entries(content.lootTables).flatMap(([enemyId, drops]) => drops.filter((drop) => drop.itemId === id).map((drop) => ({ enemyId, enemyName: names.get(enemyId) ?? enemyId, ...drop })));
  current = { items: content.items.map((item) => ({ ...item, drops: dropsFor(item.id) })), fruits: content.fruits.map((fruit) => ({ ...fruit, drops: dropsFor(fruit.id) })), enemies: content.enemies.map((enemy) => ({ id: enemy.id, displayName: enemy.displayName, huntId: enemy.huntId, maxHp: stats[enemy.id]?.maxHp ?? 0, xpReward: stats[enemy.id]?.xpReward ?? 0, berriesReward: stats[enemy.id]?.berriesReward ?? 0, drops: content.lootTables[enemy.id] ?? [] })), hunts: hunts.map((hunt) => ({ id: hunt.id, displayName: hunt.displayName, description: hunt.description, mainEnemyId: hunt.mainEnemyId, recommendedLevelMin: hunt.recommendedLevelMin, recommendedLevelMax: hunt.recommendedLevelMax, difficulty: hunt.difficulty })) };
}
export const publicCatalog = (): PublicCatalog => current;
