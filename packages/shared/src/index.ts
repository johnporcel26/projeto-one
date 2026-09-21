export type Direction = "down" | "up" | "left" | "right";
export type PlayerState = "IDLE" | "WALK" | "ATTACK" | "DEAD";
export type EnemyState = "IDLE" | "CHASE" | "ATTACK" | "DEAD" | "RESPAWN";
export type NpcState = "IDLE" | "DRINK" | "SWAY" | "INTERACT" | "HEAL";
export type AutoHuntState = "OFF" | "SEARCHING" | "MOVING_TO_TARGET" | "ATTACKING" | "LOOTING";
/** Content IDs are data-driven. Existing IDs remain stable for saved inventories. */
export type ItemId = string;
export type FruitId = string;
/** Integer basis points: 10_000 is 100%, 100 is 1%. Never use floats for loot. */
export type ChanceBps = number;
export interface LootEntry { itemId: ItemId; chanceBps: ChanceBps; minQuantity: number; maxQuantity: number; }
export type ItemEffect = { type: "RESTORE_HP_PERCENT" | "RESTORE_HP" | "RESTORE_MANA_PERCENT" | "RESTORE_MANA"; amount: number };
export interface ItemDefinition { id: ItemId; displayName: string; category: "material" | "consumable" | "equipment" | "quest" | "misc" | "fruit"; icon: string; stackable: boolean; sellValue: number; tradeable: boolean; marketable?: boolean; sellable?: boolean; shopBuyable?: boolean; buyValue?: number; usable?: boolean; consumable?: { effects: readonly ItemEffect[]; cooldownMs: number; cooldownGroup: "POTION" }; }
export const itemDefinitions: Record<string, ItemDefinition> = {
  item_gravel: { id: "item_gravel", displayName: "Cascalho", category: "material", icon: "item_gravel", stackable: true, sellValue: 4, tradeable: true },
  item_soap: { id: "item_soap", displayName: "Sabonete", category: "material", icon: "item_soap", stackable: true, sellValue: 4, tradeable: true },
  item_red_scarf: { id: "item_red_scarf", displayName: "Lenço Vermelho", category: "equipment", icon: "item_red_scarf", stackable: true, sellValue: 18, tradeable: true },
  item_gold_ring: { id: "item_gold_ring", displayName: "Anel de Ouro", category: "equipment", icon: "item_gold_ring", stackable: true, sellValue: 30, tradeable: true },
  item_potion_small: { id: "item_potion_small", displayName: "Poção Menor", category: "consumable", icon: "item_potion_small", stackable: true, sellValue: 25, tradeable: true, buyValue: 50, usable: true, consumable: { effects: [{ type: "RESTORE_HP_PERCENT", amount: 25 }], cooldownMs: 3000, cooldownGroup: "POTION" } }, // TODO: BALANCE
  item_potion_large: { id: "item_potion_large", displayName: "Poção Maior", category: "consumable", icon: "item_potion_large", stackable: true, sellValue: 55, tradeable: true, buyValue: 110, usable: true, consumable: { effects: [{ type: "RESTORE_HP_PERCENT", amount: 50 }], cooldownMs: 3000, cooldownGroup: "POTION" } }, // TODO: BALANCE
  fruit_sube_sube: { id: "fruit_sube_sube", displayName: "Sube Sube no Mi", category: "fruit", icon: "fruit_sube", stackable: false, sellValue: 0, tradeable: true },
  fruit_mogu_mogu: { id: "fruit_mogu_mogu", displayName: "Mogu Mogu no Mi", category: "fruit", icon: "fruit_mogu", stackable: false, sellValue: 0, tradeable: true },
  fruit_hito_hito: { id: "fruit_hito_hito", displayName: "Hito Hito no Mi", category: "fruit", icon: "fruit_hito", stackable: false, sellValue: 0, tradeable: true },
  fruit_guro_guro: { id: "fruit_guro_guro", displayName: "Guro Guro no Mi", category: "fruit", icon: "fruit_guro", stackable: false, sellValue: 0, tradeable: true },
};
export interface SkillDefinition { id: string; displayName: string; description: string; cooldownMs: number; manaCost: number; targetType: "enemy" | "self" | "none"; status: "AVAILABLE" | "LOCKED" | "PLACEHOLDER"; }
const placeholder = (id: string): SkillDefinition => ({ id, displayName: "Habilidade bloqueada", description: "Em desenvolvimento.", cooldownMs: 0, manaCost: 0, targetType: "none", status: "PLACEHOLDER" });
export const skillDefinitions: Record<string, SkillDefinition> = {
  sube_bubbles: { id: "sube_bubbles", displayName: "Bolhas", description: "3 impactos: 10 fixo + 3% do ataque do alvo.", cooldownMs: 10_000, manaCost: 0, targetType: "enemy", status: "AVAILABLE" },
  sube_defense: { id: "sube_defense", displayName: "Bolha Defensiva", description: "Armadura igual a 10% da vida máxima por 5 segundos.", cooldownMs: 45_000, manaCost: 0, targetType: "self", status: "AVAILABLE" },
  sube_evasion: { id: "sube_evasion", displayName: "Evasão", description: "+25% de esquiva por 4 segundos.", cooldownMs: 120_000, manaCost: 0, targetType: "self", status: "AVAILABLE" },
  sube_placeholder: placeholder("sube_placeholder"),
  guro_blast: { id: "guro_blast", displayName: "Explosão Guro", description: "Explosão de impacto em alvo próximo.", cooldownMs: 8_000, manaCost: 0, targetType: "enemy", status: "AVAILABLE" },
  guro_spin: { id: "guro_spin", displayName: "Rodopio", description: "Gira por 4 segundos e causa 14 de dano por segundo.", cooldownMs: 16_000, manaCost: 0, targetType: "self", status: "AVAILABLE" },
  guro_crush: { id: "guro_crush", displayName: "Impacto Gravitacional", description: "Golpe pesado de impacto.", cooldownMs: 25_000, manaCost: 0, targetType: "enemy", status: "AVAILABLE" },
  guro_placeholder: placeholder("guro_placeholder"),
  mogu_dig: placeholder("mogu_dig"), mogu_dash: placeholder("mogu_dash"), mogu_strike: placeholder("mogu_strike"), mogu_placeholder: placeholder("mogu_placeholder"),
  hito_form: placeholder("hito_form"), hito_guard: placeholder("hito_guard"), hito_strike: placeholder("hito_strike"), hito_placeholder: placeholder("hito_placeholder"),
};
export interface HuntDefinition { id: "hunt_alvida_forest" | "hunt_buffalo_beach"; displayName: string; description: string; mapId: "forest_alvida" | "beach_buffalo"; mainEnemyId: "enemy_alvida" | "enemy_buffalo"; recommendedLevelMin: number; recommendedLevelMax: number; difficulty: number; /** Deprecated display-only fields; rewards are authoritative in enemyDefinitions. */ xpBase?: number; goldBase?: number; lootTable: readonly LootEntry[]; specialDrops: readonly { fruitId: FruitId; chanceBps: ChanceBps }[]; }
export const alvidaLootTable: readonly LootEntry[] = [{ itemId: "item_gravel", chanceBps: 5000, minQuantity: 1, maxQuantity: 1 }, { itemId: "item_soap", chanceBps: 2400, minQuantity: 1, maxQuantity: 1 }, { itemId: "item_potion_small", chanceBps: 1500, minQuantity: 1, maxQuantity: 1 }, { itemId: "item_red_scarf", chanceBps: 700, minQuantity: 1, maxQuantity: 1 }, { itemId: "item_gold_ring", chanceBps: 300, minQuantity: 1, maxQuantity: 1 }, { itemId: "item_potion_large", chanceBps: 100, minQuantity: 1, maxQuantity: 1 }];
export const alvidaFruitDrop = { fruitId: "fruit_sube_sube" as const, chanceBps: 100 };
export const buffaloLootTable: readonly LootEntry[] = [{ itemId: "item_gravel", chanceBps: 6500, minQuantity: 1, maxQuantity: 1 }, { itemId: "item_potion_small", chanceBps: 3500, minQuantity: 1, maxQuantity: 1 }];
export const buffaloFruitDrop = { fruitId: "fruit_guro_guro" as const, chanceBps: 100 };
export const hunts: readonly HuntDefinition[] = [{ id: "hunt_alvida_forest", displayName: "Floresta da Alvida", description: "Uma floresta próxima à costa ocupada pela tripulação de Alvida.", mapId: "forest_alvida", mainEnemyId: "enemy_alvida", recommendedLevelMin: 1, recommendedLevelMax: 10, difficulty: 1, lootTable: alvidaLootTable, specialDrops: [alvidaFruitDrop] }, { id: "hunt_buffalo_beach", displayName: "Praia do Buffalo", description: "Uma praia perigosa onde Buffalo protege a costa.", mapId: "beach_buffalo", mainEnemyId: "enemy_buffalo", recommendedLevelMin: 5, recommendedLevelMax: 15, difficulty: 2, lootTable: buffaloLootTable, specialDrops: [buffaloFruitDrop] }];
/** Calculated only by the authoritative progression service on the server. */
export interface Stats { strength: number; defense: number; maxHp: number; maxMana: number; critChanceBps: number; evasionChanceBps: number; moveSpeed: number; attackRange: number; attackCooldown: number; }
/** Mutable combat resources. They are deliberately separate from derived attributes. */
export interface PlayerResources { currentHp: number; currentMana: number; }
export interface InventoryStack { itemId: ItemId; quantity: number; }
export interface FruitDefinition { id: FruitId; name: string; rarity: "common" | "rare" | "epic"; icon: string; description: string; skillIds: readonly [string, string, string, string]; spriteVariant?: string; }
export const fruitDefinitions: Record<string, FruitDefinition> = {
  fruit_sube_sube: { id: "fruit_sube_sube", name: "Sube Sube no Mi", rarity: "rare", icon: "fruit_sube", description: "Pele escorregadia e bolhas protetoras.", skillIds: ["sube_bubbles", "sube_defense", "sube_evasion", "sube_placeholder"] },
  fruit_mogu_mogu: { id: "fruit_mogu_mogu", name: "Mogu Mogu no Mi", rarity: "rare", icon: "fruit_mogu", description: "Poder de escavação.", skillIds: ["mogu_dig", "mogu_dash", "mogu_strike", "mogu_placeholder"] },
  fruit_hito_hito: { id: "fruit_hito_hito", name: "Hito Hito no Mi", rarity: "epic", icon: "fruit_hito", description: "Transformação humana.", skillIds: ["hito_form", "hito_guard", "hito_strike", "hito_placeholder"] },
  fruit_guro_guro: { id: "fruit_guro_guro", name: "Guro Guro no Mi", rarity: "epic", icon: "fruit_guro", description: "Poder giratório de impacto.", skillIds: ["guro_blast", "guro_spin", "guro_crush", "guro_placeholder"] },
};
export interface ShopDefinition { id: "shop_pirate_ship"; itemIds: readonly ItemId[]; }
export const shopDefinitions: readonly ShopDefinition[] = [{ id: "shop_pirate_ship", itemIds: ["item_potion_small", "item_potion_large"] }];
export interface AutoHuntSettings { autoUseConsumables: boolean; hpPotionEnabled: boolean; hpThresholdPercent: number; manaPotionEnabled: boolean; manaThresholdPercent: number; potionPreference: "SMALL_FIRST" | "LARGE_FIRST" | "SMART"; utilityMode: "AUTO" | "SLOT_1" | "SLOT_2"; }
export const defaultAutoHuntSettings: AutoHuntSettings = { autoUseConsumables: false, hpPotionEnabled: true, hpThresholdPercent: 40, manaPotionEnabled: false, manaThresholdPercent: 30, potionPreference: "SMART", utilityMode: "AUTO" };
export interface WalletSnapshot { berries: number; rubies: number; reservedBerries: number; reservedRubies: number; }
export interface PlayerSnapshot { id: string; name: string; level: number; totalXp: number; xpIntoCurrentLevel: number; xpRequiredForNextLevel: number | null; wallet: WalletSnapshot; x: number; y: number; direction: Direction; state: PlayerState; stats: Stats; resources: PlayerResources; activeFruitId: FruitId | null; ownedFruitIds: FruitId[]; inventory: InventoryStack[]; /** Optional personal vault. Both inventory and storage are intentionally unlimited. */ storage: InventoryStack[]; utilitySlots: [ItemId | null, ItemId | null]; autoHunt: AutoHuntState; autoHuntSettings: AutoHuntSettings; /** Server timestamps; the HUD derives the visible skill cooldown from these. */ skillCooldownEndsAt: Partial<Record<string, number>>; /** Server-authoritative effect expiry timestamps for player visuals. */ statusEffectEndsAt: Partial<Record<"sube_defense" | "sube_evasion" | "guro_spin", number>>; }
/** Session-only discovery. Persistence is intentionally deferred until player persistence exists. */
export interface CatalogDiscoverySnapshot { items: ItemId[]; fruits: FruitId[]; enemies: string[]; hunts: string[]; }
export type HuntSessionStatus = "IDLE" | "ACTIVE" | "ENDED";
export interface HuntAnalyzerSnapshot { sessionId: string; huntId: HuntDefinition["id"] | null; status: HuntSessionStatus; startedAt: number | null; endedAt: number | null; durationMs: number; totalKills: number; killsByEnemy: Partial<Record<EnemySnapshot["type"], number>>; xpGained: number; berriesGained: number; lootByItemId: Partial<Record<ItemId, number>>; estimatedLootValue: number; fruitDrops: Partial<Record<FruitId, number>>; damageDealt: number; damageTaken: number; largestHit: number; criticalHits: number; dodges: number; deaths: number; consumablesUsed: Partial<Record<ItemId, number>>; skillStats: Record<string, { uses: number; hits: number; damage: number }>; }
export interface EnemySnapshot { id: string; type: "enemy_alvida" | "enemy_buffalo"; x: number; y: number; hp: number; maxHp: number; state: EnemyState; direction: Direction; }
export interface CombatFeedbackSnapshot { id: string; target: "player" | "enemy"; targetId?: string; x: number; y: number; text: string; kind: "damage" | "critical" | "dodge" | "status"; createdAt: number; }
export interface NpcSnapshot { id: "npc_old_drunk_healer"; displayName: string; role: "healer"; x: number; y: number; state: NpcState; interactionRange: number; }
export type Currency = "BERRIES" | "RUBIES";
export interface AuctionListingSnapshot { id: string; sellerId: string; itemId: ItemId; quantity: number; berriesPrice: number | null; rubiesPrice: number | null; allowOffers: boolean; status: "ACTIVE" | "SOLD" | "CANCELLED" | "EXPIRED"; createdAt: number; expiresAt: number; }
export interface AuctionOfferSnapshot { id: string; listingId: string; buyerId: string; currency: Currency; amount: number; status: "ACTIVE" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "EXPIRED"; createdAt: number; }
export interface AuctionSnapshot { listings: AuctionListingSnapshot[]; myListings: AuctionListingSnapshot[]; receivedOffers: AuctionOfferSnapshot[]; myOffers: AuctionOfferSnapshot[]; feeBps: number; expiresInMs: number; }
export interface PublicCatalogDrop { itemId: string; chanceBps: number; minQuantity: number; maxQuantity: number; }
export interface PublicCatalogItem { id: string; displayName: string; description: string; category: string; rarity: string; iconPath: string; stackable: boolean; tradeable: boolean; marketable: boolean; sellable: boolean; shopBuyable: boolean; buyValue: number; sellValue: number; effects: ItemEffect[]; cooldownMs?: number; drops: { enemyId: string; enemyName: string; chanceBps: number; minQuantity: number; maxQuantity: number }[]; }
export interface PublicCatalogFruit { id: string; displayName: string; description: string; rarity: string; iconPath: string; tradeable: boolean; marketable: boolean; sellableForBerries: boolean; sellableForRubies: boolean; acceptsOffers: boolean; stats: Partial<Record<"strength" | "defense" | "maxHp" | "maxMana" | "critChanceBps" | "evasionChanceBps", number>>; skillIds: [string, string, string, string]; skillStatuses: ["AVAILABLE" | "LOCKED" | "PLACEHOLDER", "AVAILABLE" | "LOCKED" | "PLACEHOLDER", "AVAILABLE" | "LOCKED" | "PLACEHOLDER", "AVAILABLE" | "LOCKED" | "PLACEHOLDER"]; drops: { enemyId: string; enemyName: string; chanceBps: number; minQuantity: number; maxQuantity: number }[]; }
export interface PublicCatalogEnemy { id: string; displayName: string; huntId: string; maxHp: number; xpReward: number; berriesReward: number; drops: PublicCatalogDrop[]; }
export interface PublicCatalogHunt { id: string; displayName: string; description: string; mainEnemyId: string; recommendedLevelMin: number; recommendedLevelMax: number; difficulty: number; }
export interface PublicCatalog { items: PublicCatalogItem[]; fruits: PublicCatalogFruit[]; enemies: PublicCatalogEnemy[]; hunts: PublicCatalogHunt[]; }
export interface GameSnapshot { area: "forest_alvida" | "beach_buffalo" | "pirate_ship"; player: PlayerSnapshot; enemies: EnemySnapshot[]; npcs: NpcSnapshot[]; huntAnalyzer: HuntAnalyzerSnapshot; combatFeedback: CombatFeedbackSnapshot[]; auction: AuctionSnapshot; /** Validated server catalog lets the client resolve Admin-created IDs without code changes. */ contentCatalog: { items: ItemDefinition[]; fruits: FruitDefinition[]; public: PublicCatalog; discovery: CatalogDiscoverySnapshot }; }
export type ClientIntent =
 | { type: "move"; x: number; y: number }
 | { type: "attack" }
 | { type: "useSkill"; skillId: string }
 | { type: "useItem"; itemId: ItemId }
 | { type: "setUtilitySlot"; slot: 0 | 1; itemId: ItemId }
 | { type: "clearUtilitySlot"; slot: 0 | 1 }
 | { type: "updateAutoHuntSettings"; settings: Partial<AutoHuntSettings> }
 | { type: "toggleAutoHunt" }
 | { type: "equipFruit"; fruitId: FruitId }
 | { type: "unequipFruit" }
 | { type: "enterHunt"; huntId: HuntDefinition["id"] }
 | { type: "leaveHunt" }
 | { type: "sellItems"; itemIds: ItemId[] }
 | { type: "buyItem"; itemId: ItemId }
 | { type: "depositItem"; itemId: ItemId; quantity: number }
 | { type: "withdrawItem"; itemId: ItemId; quantity: number }
 | { type: "createAuctionListing"; itemId: ItemId; quantity: number; berriesPrice?: number; rubiesPrice?: number; allowOffers: boolean }
 | { type: "buyAuctionListing"; listingId: string; currency: Currency }
 | { type: "cancelAuctionListing"; listingId: string }
 | { type: "createAuctionOffer"; listingId: string; currency: Currency; amount: number }
 | { type: "acceptAuctionOffer"; listingId: string; offerId: string }
 | { type: "rejectAuctionOffer"; listingId: string; offerId: string }
 | { type: "interactWithNpc"; npcId: string }
 | { type: "resetHuntAnalyzer" }
 | { type: "requestRespawn" };
export type ServerEvent = { type: "snapshot"; payload: GameSnapshot } | { type: "log"; message: string };
