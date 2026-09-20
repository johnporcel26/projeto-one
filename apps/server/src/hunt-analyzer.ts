import type { EnemySnapshot, FruitId, HuntAnalyzerSnapshot, HuntDefinition, ItemId } from "@onepiece/shared";

const empty = (): HuntAnalyzerSnapshot => ({ sessionId: "", huntId: null, status: "IDLE", startedAt: null, endedAt: null, durationMs: 0, totalKills: 0, killsByEnemy: {}, xpGained: 0, berriesGained: 0, lootByItemId: {}, estimatedLootValue: 0, fruitDrops: {}, damageDealt: 0, damageTaken: 0, largestHit: 0, criticalHits: 0, dodges: 0, deaths: 0, consumablesUsed: {}, skillStats: {} });
export const itemSellValues: Partial<Record<ItemId, number>> = { item_gravel: 4, item_potion_small: 25, item_potion_large: 55, item_soap: 4, item_red_scarf: 18, item_gold_ring: 30 };
const increment = <T extends string>(record: Partial<Record<T, number>>, key: T, amount = 1): void => { record[key] = (record[key] ?? 0) + amount; };

/** Observes authoritative game events; it never grants rewards or changes combat. */
export class HuntAnalyzer {
  private current = empty(); private last = empty(); private sequence = 0;
  start(huntId: HuntDefinition["id"], now = Date.now()): void { if (this.current.status === "ACTIVE") this.end(now); this.current = { ...empty(), sessionId: `hunt_${++this.sequence}_${now}`, huntId, status: "ACTIVE", startedAt: now }; }
  end(now = Date.now()): void { if (this.current.status !== "ACTIVE") return; this.current.endedAt = now; this.current.durationMs = Math.max(0, now - (this.current.startedAt ?? now)); this.current.status = "ENDED"; this.last = structuredClone(this.current); }
  reset(huntId: HuntDefinition["id"], now = Date.now()): void { this.end(now); this.start(huntId, now); }
  recordKill(enemyType: EnemySnapshot["type"]): void { if (!this.active()) return; this.current.totalKills += 1; increment(this.current.killsByEnemy, enemyType); }
  recordXp(amount: number): void { if (this.active() && amount > 0) this.current.xpGained += amount; }
  recordBerries(amount: number): void { if (this.active() && amount > 0) this.current.berriesGained += amount; }
  recordLoot(item: ItemId | FruitId): void { if (!this.active()) return; if (item.startsWith("fruit_")) { increment(this.current.fruitDrops, item as FruitId); return; } const id = item as ItemId; increment(this.current.lootByItemId, id); this.current.estimatedLootValue += itemSellValues[id] ?? 0; }
  recordDamageDealt(effectiveDamage: number, critical: boolean, skillId = "basic_attack"): void { if (!this.active() || effectiveDamage <= 0) return; this.current.damageDealt += effectiveDamage; this.current.largestHit = Math.max(this.current.largestHit, effectiveDamage); if (critical) this.current.criticalHits += 1; const stats = this.current.skillStats[skillId] ?? { uses: 0, hits: 0, damage: 0 }; stats.uses += 1; stats.hits += 1; stats.damage += effectiveDamage; this.current.skillStats[skillId] = stats; }
  recordDamageTaken(effectiveDamage: number): void { if (this.active() && effectiveDamage > 0) this.current.damageTaken += effectiveDamage; }
  recordDodge(): void { if (this.active()) this.current.dodges += 1; } recordDeath(): void { if (this.active()) this.current.deaths += 1; }
  snapshot(now = Date.now()): HuntAnalyzerSnapshot { const source = this.current.status === "ACTIVE" ? this.current : this.last.status === "ENDED" ? this.last : this.current; return { ...structuredClone(source), durationMs: source.status === "ACTIVE" ? Math.max(0, now - (source.startedAt ?? now)) : source.durationMs }; }
  private active(): boolean { return this.current.status === "ACTIVE"; }
}
export const perHour = (total: number, durationMs: number): number => durationMs <= 0 ? 0 : Math.floor(total * 3_600_000 / durationMs);
