import {
  alvidaFruitDrop,
  alvidaLootTable,
  buffaloFruitDrop,
  buffaloLootTable,
  defaultAutoHuntSettings,
  fruitDefinitions,
  itemDefinitions,
  skillDefinitions,
  wapolFruitDrop,
  wapolLootTable,
  type AutoHuntSettings,
  type AutoHuntState,
  type Direction,
  type EnemySnapshot,
  type FruitDefinition,
  type FruitId,
  type InventoryStack,
  type ItemId,
  type NpcSnapshot,
  type NpcState,
  type PlayerResources,
  type PlayerSnapshot,
  type Stats,
} from "@onepiece/shared";
import {
  calculateProgression,
  increaseResourcesForLevelUp,
  progressionConfig,
} from "./progression.js";
import type { Wallet } from "./economy.js";
import type { ContentData } from "./content-repository.js";
import { rebuildPublicCatalog } from "./public-catalog.js";

export const fruits: Record<string, FruitDefinition> = fruitDefinitions;
export const alvidaConfig = {
  aggroRange: 220,
  attackRange: 68,
  moveSpeed: 96,
  attackCooldown: 1800,
  leashRange: 480,
} as const;
export const buffaloConfig = {
  aggroRange: 250,
  attackRange: 78,
  moveSpeed: 72,
  attackCooldown: 2300,
  leashRange: 500,
} as const;
export const wapolConfig = { ...buffaloConfig } as const;
export const oldDrunkHealerConfig = {
  id: "npc_old_drunk_healer",
  displayName: "Velho Bêbado",
  role: "healer",
  interactionRange: 170,
  cooldownMs: 1000,
  idleMinMs: 6000,
  idleMaxMs: 15000,
  drinkMs: 1100,
  swayMs: 1300,
  interactMs: 650,
  healMs: 950,
  animationFps: { IDLE: 4, DRINK: 6, SWAY: 3, INTERACT: 5, HEAL: 6 },
  dialogue: [
    "Arrr... toma um gole e descansa.",
    "Você tá com uma cara pior que a minha.",
    "Fica parado aí, garoto.",
    "Isso resolve... eu acho.",
  ],
  audioHooks: ["npc_drink", "npc_talk", "npc_heal"],
} as const;
type EnemyDefinition = {
  maxHp: number;
  defense: number;
  attackPower: number;
  xpReward: number;
  berriesReward: number;
  lootTable: readonly {
    itemId: ItemId | FruitId;
    chanceBps: number;
    minQuantity: number;
    maxQuantity: number;
  }[];
};
export const enemyDefinitions: Record<EnemySnapshot["type"], EnemyDefinition> =
  {
    enemy_alvida: {
      maxHp: 65,
      defense: 5,
      attackPower: 11,
      xpReward: 25,
      berriesReward: 8,
      lootTable: [
        ...alvidaLootTable,
        {
          itemId: alvidaFruitDrop.fruitId,
          chanceBps: alvidaFruitDrop.chanceBps,
          minQuantity: 1,
          maxQuantity: 1,
        },
      ],
    },
    enemy_buffalo: {
      maxHp: 150,
      defense: 8,
      attackPower: 18,
      xpReward: 42,
      berriesReward: 16,
      lootTable: [
        ...buffaloLootTable,
        {
          itemId: buffaloFruitDrop.fruitId,
          chanceBps: buffaloFruitDrop.chanceBps,
          minQuantity: 1,
          maxQuantity: 1,
        },
      ],
    },
    enemy_wapol: {
      maxHp: 300,
      defense: 16,
      attackPower: 36,
      xpReward: 84,
      berriesReward: 32,
      lootTable: [
        ...wapolLootTable,
        {
          itemId: wapolFruitDrop.fruitId,
          chanceBps: wapolFruitDrop.chanceBps,
          minQuantity: 1,
          maxQuantity: 1,
        },
      ],
    },
  };
/** The repository becomes the only content source after validation at server boot. */
export function applyContentRuntime(content: ContentData): void {
  for (const key of Object.keys(itemDefinitions)) delete itemDefinitions[key];
  for (const entry of content.items)
    itemDefinitions[entry.id] = {
      id: entry.id,
      displayName: entry.displayName,
      category: entry.category,
      icon: entry.iconPath,
      stackable: entry.stackable,
      sellValue: entry.sellValue,
      tradeable: entry.tradeable,
      marketable: entry.marketable,
      sellable: entry.sellable,
      shopBuyable: entry.shopBuyable,
      buyValue: entry.shopBuyable ? entry.buyValue : undefined,
      usable: entry.category === "consumable",
      consumable:
        entry.category === "consumable"
          ? {
              effects: entry.effects,
              cooldownMs: entry.cooldownMs ?? 3000,
              cooldownGroup: "POTION",
            }
          : undefined,
    };
  for (const key of Object.keys(fruitDefinitions)) delete fruitDefinitions[key];
  for (const entry of content.fruits) {
    fruitDefinitions[entry.id] = {
      id: entry.id,
      name: entry.displayName,
      rarity: entry.rarity.toLowerCase() as FruitDefinition["rarity"],
      icon: entry.iconPath,
      description: entry.description,
      skillIds: entry.skillIds,
    };
    itemDefinitions[entry.id] = {
      id: entry.id,
      displayName: entry.displayName,
      category: "fruit",
      icon: entry.iconPath,
      stackable: false,
      sellValue: 0,
      tradeable: entry.tradeable,
      marketable: entry.marketable,
      sellable: entry.sellableForBerries,
    };
  }
  for (const enemy of content.enemies)
    if (enemy.id in enemyDefinitions)
      enemyDefinitions[enemy.id as EnemySnapshot["type"]].lootTable =
        content.lootTables[enemy.id] ?? [];
  rebuildPublicCatalog(
    content,
    Object.fromEntries(
      Object.entries(enemyDefinitions).map(([id, entry]) => [
        id,
        {
          maxHp: entry.maxHp,
          xpReward: entry.xpReward,
          berriesReward: entry.berriesReward,
        },
      ]),
    ),
  );
}
export type CombatResult = {
  damage: number;
  critical: boolean;
  dodged: boolean;
};
export function resolveCombat(
  attackPower: number,
  defense: number,
  critChanceBps = 0,
  evasionChanceBps = 0,
  random: () => number = Math.random,
): CombatResult {
  if (Math.floor(random() * 10000) < evasionChanceBps)
    return { damage: 0, critical: false, dodged: true };
  const critical = Math.floor(random() * 10000) < critChanceBps;
  return {
    damage: Math.max(
      1,
      Math.floor(
        attackPower * (critical ? progressionConfig.combat.critMultiplier : 1),
      ) - Math.floor(defense),
    ),
    critical,
    dodged: false,
  };
}
export const resolveDamage = (attack: number, defense: number): number =>
  resolveCombat(attack, defense, 0, 0, () => 0.9999).damage;
export const cardinalDirection = (deltaX: number, deltaY: number): Direction =>
  Math.abs(deltaX) >= Math.abs(deltaY)
    ? deltaX < 0
      ? "left"
      : "right"
    : deltaY < 0
      ? "up"
      : "down";
export const directionVector = (
  direction: Direction,
): readonly [number, number] =>
  direction === "left"
    ? [-1, 0]
    : direction === "right"
      ? [1, 0]
      : direction === "up"
        ? [0, -1]
        : [0, 1];
export const alternateDirection = (
  direction: Direction,
  deltaX: number,
  deltaY: number,
): Direction =>
  direction === "left" || direction === "right"
    ? deltaY < 0
      ? "up"
      : "down"
    : deltaX < 0
      ? "left"
      : "right";
export class Inventory {
  private readonly stacks = new Map<ItemId, number>();
  add(itemId: ItemId, quantity: number): void {
    if (quantity <= 0) throw new Error("Inventory quantity must be positive");
    this.stacks.set(itemId, (this.stacks.get(itemId) ?? 0) + quantity);
  }
  remove(itemId: ItemId, quantity?: number): number {
    const available = this.stacks.get(itemId) ?? 0;
    const removed =
      quantity === undefined
        ? available
        : Math.max(0, Math.min(available, quantity));
    if (removed === available) this.stacks.delete(itemId);
    else if (removed) this.stacks.set(itemId, available - removed);
    return removed;
  }
  quantity(itemId: ItemId): number {
    return this.stacks.get(itemId) ?? 0;
  }
  snapshot(): InventoryStack[] {
    return [...this.stacks].map(([itemId, quantity]) => ({ itemId, quantity }));
  }
}
export type PersistedPlayer = {
  id: string;
  name: string;
  totalXp: number;
  berries: number;
  rubies: number;
  /** Offer escrow is durable so a restart cannot make reserved currency spendable. */
  reservedBerries?: number;
  reservedRubies?: number;
  vip?: { purchasedAt: number; expiresAt: number | null };
  inventory: InventoryStack[];
  storage: InventoryStack[];
  lockedItemIds?: ItemId[];
  ownedFruitIds: FruitId[];
  activeFruitId: FruitId | null;
  utilitySlots: [ItemId | null, ItemId | null];
  autoHuntSettings: AutoHuntSettings;
  discovery: {
    items: ItemId[];
    fruits: FruitId[];
    enemies: string[];
    hunts: string[];
  };
};
export class PlayerDomain {
  stats: Stats;
  resources: PlayerResources;
  readonly inventory = new Inventory();
  /** Personal vault: unlimited and excluded from combat services. */ readonly storage =
    new Inventory();
  readonly ownedFruits = new Set<FruitId>();
  readonly wallet: Wallet = {
    berries: 0,
    rubies: 0,
    reservedBerries: 0,
    reservedRubies: 0,
  };
  activeFruitId: FruitId | null = null;
  x = 620;
  y = 600;
  direction: Direction = "down";
  state: PlayerSnapshot["state"] = "IDLE";
  totalXp = 0;
  level = 1;
  autoHunt: AutoHuntState = "OFF";
  autoHuntSettings: AutoHuntSettings = { ...defaultAutoHuntSettings };
  utilitySlots: [ItemId | null, ItemId | null] = [null, null];
  private lastAttack = 0;
  private attackEndsAt = 0;
  private subeDefenseUntil = 0;
  private subeEvasionUntil = 0;
  private guroHelicesUntil = 0;
  private guroHelicesNextHitAt = 0;
  private guroEvasionUntil = 0;
  private bakuArmorUntil = 0;
  private bakuTankUntil = 0;
  private readonly skillReadyAt = new Map<string, number>();
  readonly discoveredItems = new Set<ItemId>();
  readonly discoveredFruits = new Set<FruitId>();
  readonly discoveredEnemies = new Set<string>();
  readonly discoveredHunts = new Set<string>();
  readonly lockedItemIds = new Set<ItemId>();
  vipPurchasedAt: number | null = null;
  vipExpiresAt: number | null = null;
  name: string;
  constructor(
    readonly id = "player_ted",
    name = "Ted",
    saved?: PersistedPlayer,
  ) {
    this.name = saved?.name ?? name;
    const p = calculateProgression(saved?.totalXp ?? 0);
    this.totalXp = p.totalXp;
    this.level = p.level;
    this.stats = {
      ...p.stats,
      moveSpeed: 190,
      attackRange: 95,
      attackCooldown: 850,
    };
    this.resources = {
      currentHp: this.stats.maxHp,
      currentMana: this.stats.maxMana,
    };
    if (!saved) return;
    this.wallet.berries = Math.max(0, saved.berries);
    this.wallet.rubies = Math.max(0, saved.rubies);
    this.wallet.reservedBerries = Math.min(
      this.wallet.berries,
      Math.max(0, saved.reservedBerries ?? 0),
    );
    this.wallet.reservedRubies = Math.min(
      this.wallet.rubies,
      Math.max(0, saved.reservedRubies ?? 0),
    );
    this.vipPurchasedAt = saved.vip?.purchasedAt ?? null;
    this.vipExpiresAt = saved.vip?.expiresAt ?? null;
    for (const stack of saved.inventory)
      if (stack.quantity > 0) this.inventory.add(stack.itemId, stack.quantity);
    for (const stack of saved.storage)
      if (stack.quantity > 0) this.storage.add(stack.itemId, stack.quantity);
    for (const itemId of saved.lockedItemIds ?? [])
      this.lockedItemIds.add(itemId);
    for (const fruitId of saved.ownedFruitIds) this.ownedFruits.add(fruitId);
    this.activeFruitId =
      saved.activeFruitId && this.ownedFruits.has(saved.activeFruitId)
        ? saved.activeFruitId
        : null;
    this.utilitySlots = saved.utilitySlots;
    this.autoHuntSettings = {
      ...defaultAutoHuntSettings,
      ...saved.autoHuntSettings,
      skillPolicies: { ...saved.autoHuntSettings.skillPolicies },
    };
    for (const id of saved.discovery.items) this.discoveredItems.add(id);
    for (const id of saved.discovery.fruits) this.discoveredFruits.add(id);
    for (const id of saved.discovery.enemies) this.discoveredEnemies.add(id);
    for (const id of saved.discovery.hunts) this.discoveredHunts.add(id);
  }
  persistentState(): PersistedPlayer {
    return {
      id: this.id,
      name: this.name,
      totalXp: this.totalXp,
      berries: this.wallet.berries,
      rubies: this.wallet.rubies,
      reservedBerries: this.wallet.reservedBerries,
      reservedRubies: this.wallet.reservedRubies,
      ...(this.vipPurchasedAt !== null
        ? {
            vip: {
              purchasedAt: this.vipPurchasedAt,
              expiresAt: this.vipExpiresAt,
            },
          }
        : {}),
      inventory: this.inventory.snapshot(),
      storage: this.storage.snapshot(),
      lockedItemIds: [...this.lockedItemIds],
      ownedFruitIds: [...this.ownedFruits],
      activeFruitId: this.activeFruitId,
      utilitySlots: [...this.utilitySlots],
      autoHuntSettings: structuredClone(this.autoHuntSettings),
      discovery: {
        items: [...this.discoveredItems],
        fruits: [...this.discoveredFruits],
        enemies: [...this.discoveredEnemies],
        hunts: [...this.discoveredHunts],
      },
    };
  }
  get attackPower(): number {
    return this.stats.strength;
  }
  get isDead(): boolean {
    return this.state === "DEAD" || this.resources.currentHp <= 0;
  }
  defenseAt(now: number): number {
    if (this.isTank(now)) return Math.ceil(this.stats.defense * 2.5);
    if (now < this.subeDefenseUntil) return Math.ceil(this.stats.defense * 1.5);
    if (now < this.bakuArmorUntil) return Math.ceil(this.stats.defense * 1.4);
    return this.stats.defense;
  }
  evasionAt(now: number): number {
    const subeBonus =
      now < this.subeEvasionUntil
        ? Math.ceil((2000 * (this.subeEvasionUntil - now)) / 10_000)
        : 0;
    return Math.min(
      10000,
      this.stats.evasionChanceBps +
        subeBonus +
        (now < this.guroEvasionUntil ? 1500 : 0),
    );
  }
  isTank(now: number): boolean {
    return now < this.bakuTankUntil;
  }
  useSkill(skillId: string, now: number): boolean {
    const fruit = this.activeFruitId ? fruits[this.activeFruitId] : undefined;
    const definition = skillDefinitions[skillId];
    if (
      this.isDead ||
      !fruit ||
      !definition ||
      !fruit.skillIds.includes(skillId) ||
      definition.status !== "AVAILABLE" ||
      (this.isTank(now) && skillId !== "baku_cannon") ||
      now < (this.skillReadyAt.get(skillId) ?? 0)
    )
      return false;
    this.skillReadyAt.set(skillId, now + definition.cooldownMs);
    if (skillId === "sube_defense") this.subeDefenseUntil = now + 5000;
    if (skillId === "sube_evasion") {
      this.subeEvasionUntil = now + 10_000;
    }
    if (skillId === "guro_blast") {
      this.guroHelicesUntil = now + 5000;
      this.guroHelicesNextHitAt = now;
    }
    if (skillId === "guro_crush") this.guroEvasionUntil = now + 10_000;
    if (skillId === "baku_armor") this.bakuArmorUntil = now + 5000;
    if (skillId === "baku_cannon") this.bakuTankUntil = now + 30_000;
    return true;
  }
  consumeGuroHelicesTick(now: number): boolean {
    if (
      this.isDead ||
      now >= this.guroHelicesUntil ||
      now < this.guroHelicesNextHitAt
    )
      return false;
    this.guroHelicesNextHitAt += 1000;
    return true;
  }
  cancelPendingActions(): void {
    this.autoHunt = "OFF";
    this.guroHelicesUntil = 0;
    this.guroHelicesNextHitAt = 0;
    this.guroEvasionUntil = 0;
    this.subeDefenseUntil = 0;
    this.subeEvasionUntil = 0;
    this.bakuArmorUntil = 0;
    this.bakuTankUntil = 0;
  }
  get vipActive(): boolean {
    return (
      this.vipPurchasedAt !== null &&
      (this.vipExpiresAt === null || this.vipExpiresAt > Date.now())
    );
  }
  rewardXp(baseXp: number): number {
    return this.vipActive ? Math.floor(baseXp * 1.2) : baseXp;
  }
  rewardDropChance(baseBps: number): number {
    return this.vipActive
      ? Math.min(10_000, Math.floor(baseBps * 1.1))
      : baseBps;
  }
  activateVip(now = Date.now()): boolean {
    if (this.vipActive) return false;
    this.vipPurchasedAt = now;
    this.vipExpiresAt = null;
    return true;
  }
  equipFruit(fruitId: FruitId): void {
    if (!this.ownedFruits.has(fruitId)) throw new Error("Fruit is not owned");
    this.activeFruitId = fruitId;
  }
  unequipFruit(): void {
    this.activeFruitId = null;
  }
  setItemLocked(itemId: ItemId, locked: boolean): string | null {
    if (!this.inventory.quantity(itemId) && !this.storage.quantity(itemId))
      return "Item não disponível.";
    if (locked) this.lockedItemIds.add(itemId);
    else this.lockedItemIds.delete(itemId);
    return null;
  }
  isItemLocked(itemId: ItemId): boolean {
    return this.lockedItemIds.has(itemId);
  }
  transferToStorage(itemId: ItemId, quantity: number): string | null {
    if (!Number.isInteger(quantity) || quantity <= 0)
      return "Quantidade inválida.";
    if (itemId === this.activeFruitId) return "Esta Akuma no Mi está equipada.";
    if (this.inventory.quantity(itemId) < quantity)
      return "Item não disponível.";
    this.inventory.remove(itemId, quantity);
    this.storage.add(itemId, quantity);
    return null;
  }
  transferFromStorage(itemId: ItemId, quantity: number): string | null {
    if (!Number.isInteger(quantity) || quantity <= 0)
      return "Quantidade inválida.";
    if (this.storage.quantity(itemId) < quantity) return "Item não disponível.";
    this.storage.remove(itemId, quantity);
    this.inventory.add(itemId, quantity);
    return null;
  }
  discoverItem(itemId: ItemId): void {
    this.discoveredItems.add(itemId);
  }
  discoverEnemy(enemyId: string): void {
    this.discoveredEnemies.add(enemyId);
  }
  discoverHunt(huntId: string): void {
    this.discoveredHunts.add(huntId);
  }
  gainFruit(fruitId: FruitId | ItemId): void {
    if (fruitId.startsWith("fruit_")) {
      this.ownedFruits.add(fruitId as FruitId);
      this.discoveredFruits.add(fruitId as FruitId);
    }
  }
  move(
    direction: Direction,
    distance: number,
    blocked: (x: number, y: number) => boolean,
  ): boolean {
    if (this.isDead || this.state === "ATTACK" || this.isTank(Date.now())) return false;
    const [dx, dy] = directionVector(direction);
    const nextX = this.x + dx * distance;
    const nextY = this.y + dy * distance;
    this.direction = direction;
    this.state = "WALK";
    if (blocked(nextX, nextY)) return false;
    this.x = nextX;
    this.y = nextY;
    return true;
  }
  stop(): void {
    if (this.state === "WALK") this.state = "IDLE";
  }
  canAttack(now: number): boolean {
    return (
      this.resources.currentHp > 0 &&
      now - this.lastAttack >= this.stats.attackCooldown
    );
  }
  attacked(now: number): void {
    this.lastAttack = now;
    this.attackEndsAt = now + 850;
    this.state = "ATTACK";
  }
  gainXp(amount: number): {
    levelsGained: number;
    oldLevel: number;
    newLevel: number;
  } {
    if (!Number.isFinite(amount) || amount <= 0)
      return { levelsGained: 0, oldLevel: this.level, newLevel: this.level };
    const oldLevel = this.level;
    const oldStats = { ...this.stats };
    this.totalXp += Math.floor(amount);
    const p = calculateProgression(this.totalXp);
    this.level = p.level;
    this.stats = {
      ...p.stats,
      moveSpeed: oldStats.moveSpeed,
      attackRange: oldStats.attackRange,
      attackCooldown: oldStats.attackCooldown,
    };
    this.resources = increaseResourcesForLevelUp(
      this.resources,
      oldStats,
      this.stats,
    );
    return {
      levelsGained: this.level - oldLevel,
      oldLevel,
      newLevel: this.level,
    };
  }
  healFull(): void {
    this.resources.currentHp = this.stats.maxHp;
    this.resources.currentMana = this.stats.maxMana;
  }
  receiveDamage(amount: number): void {
    this.resources.currentHp = Math.max(
      0,
      this.resources.currentHp - Math.max(0, amount),
    );
  }
  tick(now: number): void {
    if (this.state === "ATTACK" && now >= this.attackEndsAt)
      this.state = "IDLE";
  }
  snapshot(): PlayerSnapshot {
    const now = Date.now();
    const p = calculateProgression(this.totalXp);
    return {
      id: this.id,
      name: this.name,
      level: p.level,
      totalXp: p.totalXp,
      xpIntoCurrentLevel: p.xpIntoCurrentLevel,
      xpRequiredForNextLevel: p.xpRequiredForNextLevel,
      wallet: { ...this.wallet },
      vip: {
        active: this.vipActive,
        purchasedAt: this.vipPurchasedAt,
        expiresAt: this.vipExpiresAt,
      },
      x: this.x,
      y: this.y,
      direction: this.direction,
      state: this.state,
      stats: { ...this.stats },
      resources: { ...this.resources },
      activeFruitId: this.activeFruitId,
      ownedFruitIds: [...this.ownedFruits],
      inventory: this.inventory.snapshot(),
      lockedItemIds: [...this.lockedItemIds],
      storage: this.storage.snapshot(),
      utilitySlots: [...this.utilitySlots],
      autoHunt: this.autoHunt,
      autoHuntSettings: { ...this.autoHuntSettings },
      skillCooldownEndsAt: Object.fromEntries(
        [...this.skillReadyAt].filter(([, endsAt]) => endsAt > now),
      ),
      statusEffectEndsAt: {
        ...(this.subeDefenseUntil > now
          ? { sube_defense: this.subeDefenseUntil }
          : {}),
        ...(this.subeEvasionUntil > now
          ? { sube_evasion: this.subeEvasionUntil }
          : {}),
        ...(this.guroHelicesUntil > now ? { guro_spin: this.guroHelicesUntil } : {}),
        ...(this.guroEvasionUntil > now ? { guro_evasion: this.guroEvasionUntil } : {}),
        ...(this.bakuArmorUntil > now ? { baku_armor: this.bakuArmorUntil } : {}),
        ...(this.bakuTankUntil > now ? { baku_tank: this.bakuTankUntil } : {}),
      },
    };
  }
}
export interface RandomSource {
  next(): number;
}
export const mathRandomSource: RandomSource = { next: () => Math.random() };
export const rollChanceBps = (
  chanceBps: number,
  random: RandomSource,
): boolean => Math.floor(random.next() * 10_000) < chanceBps;
export class EnemyDomain {
  readonly snapshot: EnemySnapshot;
  readonly spawnX: number;
  readonly spawnY: number;
  private dropped = false;
  private rewarded = false;
  private lastAttack = 0;
  private knockedUpUntil = 0;
  constructor(
    id: string,
    x: number,
    y: number,
    type: EnemySnapshot["type"] = "enemy_alvida",
  ) {
    const d = enemyDefinitions[type];
    this.spawnX = x;
    this.spawnY = y;
    this.snapshot = {
      id,
      type,
      x,
      y,
      hp: d.maxHp,
      maxHp: d.maxHp,
      state: "IDLE",
      direction: "down",
    };
  }
  get definition() {
    return enemyDefinitions[this.snapshot.type];
  }
  damage(amount: number): boolean {
    if (this.snapshot.state === "DEAD") return false;
    this.snapshot.hp = Math.max(0, this.snapshot.hp - amount);
    if (this.snapshot.hp === 0) this.snapshot.state = "DEAD";
    return true;
  }
  knockUp(now: number, durationMs = 1000): void {
    if (this.snapshot.state !== "DEAD") this.knockedUpUntil = Math.max(this.knockedUpUntil, now + durationMs);
  }
  claimReward(): boolean {
    if (this.snapshot.state !== "DEAD" || this.rewarded) return false;
    this.rewarded = true;
    return true;
  }
  loot(
    random: RandomSource = mathRandomSource,
    adjustChance: (chanceBps: number) => number = (chanceBps) => chanceBps,
  ): readonly { itemId: ItemId | FruitId; quantity: number }[] {
    if (this.snapshot.state !== "DEAD" || this.dropped) return [];
    this.dropped = true;
    const drops: { itemId: ItemId | FruitId; quantity: number }[] = [];
    for (const entry of this.definition.lootTable)
      if (rollChanceBps(adjustChance(entry.chanceBps), random))
        drops.push({
          itemId: entry.itemId,
          quantity:
            entry.minQuantity +
            Math.floor(
              random.next() * (entry.maxQuantity - entry.minQuantity + 1),
            ),
        });
    return drops;
  }
  tick(
    player: PlayerDomain,
    now: number,
    distance: number,
    blocked: (x: number, y: number) => boolean,
  ): boolean {
    if (this.snapshot.state === "DEAD") return false;
    if (now < this.knockedUpUntil) {
      this.snapshot.state = "IDLE";
      return false;
    }
    const c =
      this.snapshot.type === "enemy_wapol"
        ? wapolConfig
        : this.snapshot.type === "enemy_buffalo"
          ? buffaloConfig
          : alvidaConfig;
    const hx = this.spawnX - this.snapshot.x,
      hy = this.spawnY - this.snapshot.y,
      px = player.x - this.snapshot.x,
      py = player.y - this.snapshot.y;
    const homeDistance = Math.hypot(hx, hy),
      playerDistance = Math.hypot(px, py);
    if (
      player.resources.currentHp <= 0 ||
      homeDistance > c.leashRange ||
      playerDistance > c.aggroRange
    ) {
      if (homeDistance > 8)
        this.walk(cardinalDirection(hx, hy), hx, hy, distance, blocked);
      else this.snapshot.state = "IDLE";
      return false;
    }
    this.snapshot.direction = cardinalDirection(px, py);
    if (playerDistance <= c.attackRange) {
      this.snapshot.state = "ATTACK";
      if (now - this.lastAttack >= c.attackCooldown) {
        this.lastAttack = now;
        return true;
      }
      return false;
    }
    this.walk(this.snapshot.direction, px, py, distance, blocked);
    return false;
  }
  private walk(
    primary: Direction,
    dx0: number,
    dy0: number,
    distance: number,
    blocked: (x: number, y: number) => boolean,
  ): void {
    const tryMove = (direction: Direction): boolean => {
      const [dx, dy] = directionVector(direction),
        x = this.snapshot.x + dx * distance,
        y = this.snapshot.y + dy * distance;
      if (blocked(x, y)) return false;
      this.snapshot.x = x;
      this.snapshot.y = y;
      this.snapshot.direction = direction;
      this.snapshot.state = "CHASE";
      return true;
    };
    if (!tryMove(primary) && !tryMove(alternateDirection(primary, dx0, dy0)))
      this.snapshot.state = "IDLE";
  }
}
export type NpcInteractionResult =
  | "HEALED"
  | "FULL_HEALTH"
  | "TOO_FAR"
  | "COOLDOWN"
  | "PLAYER_DEAD"
  | "UNKNOWN_NPC";
export class NpcDomain {
  readonly snapshot: NpcSnapshot;
  private stateEndsAt = 0;
  private nextIdleBehaviorAt: number;
  private lastInteractionAt = -Infinity;
  constructor(position: { x: number; y: number }, now = Date.now()) {
    this.snapshot = {
      id: oldDrunkHealerConfig.id,
      displayName: oldDrunkHealerConfig.displayName,
      role: oldDrunkHealerConfig.role,
      x: position.x,
      y: position.y,
      state: "IDLE",
      interactionRange: oldDrunkHealerConfig.interactionRange,
    };
    this.nextIdleBehaviorAt = now + this.nextDelay();
  }
  interact(
    npcId: string,
    player: PlayerDomain,
    now: number,
  ): NpcInteractionResult {
    if (npcId !== this.snapshot.id) return "UNKNOWN_NPC";
    if (player.resources.currentHp <= 0) return "PLAYER_DEAD";
    if (
      Math.hypot(player.x - this.snapshot.x, player.y - this.snapshot.y) >
      this.snapshot.interactionRange
    )
      return "TOO_FAR";
    if (now - this.lastInteractionAt < oldDrunkHealerConfig.cooldownMs)
      return "COOLDOWN";
    this.lastInteractionAt = now;
    if (player.resources.currentHp >= player.stats.maxHp) {
      this.transition("INTERACT", now, oldDrunkHealerConfig.interactMs);
      return "FULL_HEALTH";
    }
    player.healFull();
    this.transition("HEAL", now, oldDrunkHealerConfig.healMs);
    return "HEALED";
  }
  tick(now: number, random = Math.random): void {
    if (this.snapshot.state !== "IDLE") {
      if (now >= this.stateEndsAt) {
        this.snapshot.state = "IDLE";
        this.nextIdleBehaviorAt = now + this.nextDelay(random);
      }
      return;
    }
    if (now < this.nextIdleBehaviorAt) return;
    const roll = random();
    if (roll < 0.2) this.transition("DRINK", now, oldDrunkHealerConfig.drinkMs);
    else if (roll < 0.3)
      this.transition("SWAY", now, oldDrunkHealerConfig.swayMs);
    else this.nextIdleBehaviorAt = now + this.nextDelay(random);
  }
  private transition(state: NpcState, now: number, duration: number): void {
    this.snapshot.state = state;
    this.stateEndsAt = now + duration;
  }
  private nextDelay(random = Math.random): number {
    return (
      oldDrunkHealerConfig.idleMinMs +
      random() *
        (oldDrunkHealerConfig.idleMaxMs - oldDrunkHealerConfig.idleMinMs)
    );
  }
}
