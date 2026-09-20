import { itemDefinitions, type ItemId } from "@onepiece/shared";
import type { PlayerDomain } from "./domain.js";

export type ItemUseResult = { ok: boolean; restoredHp: number; restoredMana: number; reason?: string };
/** The only server-side path that may consume a usable item. */
export class ConsumableService {
  private readonly readyAt = new Map<string, number>();
  use(player: PlayerDomain, itemId: ItemId, now: number): ItemUseResult {
    const definition = itemDefinitions[itemId], consumable = definition?.consumable;
    if (!definition?.usable || !consumable) return { ok: false, restoredHp: 0, restoredMana: 0, reason: "ITEM_NOT_USABLE" };
    if (player.isDead) return { ok: false, restoredHp: 0, restoredMana: 0, reason: "PLAYER_DEAD" };
    if (player.inventory.quantity(itemId) < 1) return { ok: false, restoredHp: 0, restoredMana: 0, reason: "NO_ITEM" };
    if (now < (this.readyAt.get(consumable.cooldownGroup) ?? 0)) return { ok: false, restoredHp: 0, restoredMana: 0, reason: "COOLDOWN" };
    let hp = 0, mana = 0;
    for (const effect of consumable.effects) { if (effect.type === "RESTORE_HP_PERCENT") hp += Math.ceil(player.stats.maxHp * effect.amount / 100); if (effect.type === "RESTORE_HP") hp += effect.amount; if (effect.type === "RESTORE_MANA_PERCENT") mana += Math.ceil(player.stats.maxMana * effect.amount / 100); if (effect.type === "RESTORE_MANA") mana += effect.amount; }
    const restoredHp = Math.min(hp, player.stats.maxHp - player.resources.currentHp), restoredMana = Math.min(mana, player.stats.maxMana - player.resources.currentMana);
    if (restoredHp <= 0 && restoredMana <= 0) return { ok: false, restoredHp: 0, restoredMana: 0, reason: "RESOURCE_FULL" };
    player.resources.currentHp += restoredHp; player.resources.currentMana += restoredMana; player.inventory.remove(itemId, 1); this.readyAt.set(consumable.cooldownGroup, now + consumable.cooldownMs);
    return { ok: true, restoredHp, restoredMana };
  }
}
