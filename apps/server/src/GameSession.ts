import {
  fruitDefinitions,
  hunts,
  itemDefinitions,
  skillDefinitions,
  type ClientIntent,
  type CombatFeedbackSnapshot,
  type Direction,
  type GameSnapshot,
  type ItemId,
} from "@onepiece/shared";
import { AutoHuntSkillPlanner } from "./auto-hunt.js";
import { ConsumableService } from "./consumables.js";
import {
  EnemyDomain,
  NpcDomain,
  PlayerDomain,
  type PersistedPlayer,
  alvidaConfig,
  buffaloConfig,
  wapolConfig,
  cardinalDirection,
  directionVector,
  resolveCombat,
} from "./domain.js";
import { HuntAnalyzer } from "./hunt-analyzer.js";
import {
  canMoveTo,
  findNavigationPath,
  getEnemySpawnPoints,
  getMaxAliveEnemies,
  getMapDefinition,
  getPlayerSpawn,
} from "./map-definitions.js";
import { AuctionService } from "./auction.js";
import { WalletService } from "./economy.js";
import { publicCatalog } from "./public-catalog.js";

const standaloneWallets = new WalletService();
const standaloneAuction = new AuctionService(
  standaloneWallets,
  () => undefined,
);

/** One isolated Alpha world instance per connection. It can later load/save a persistent player. */
export class GameSession {
  readonly player: PlayerDomain;
  readonly analyzer = new HuntAnalyzer();
  readonly npc: NpcDomain;
  readonly feedback: CombatFeedbackSnapshot[] = [];
  readonly planner = new AutoHuntSkillPlanner(false);
  readonly consumables = new ConsumableService();
  area: GameSnapshot["area"] = "pirate_ship";
  enemies: EnemyDomain[];
  private nextEnemyId = 4;
  private feedbackSequence = 0;
  private tankShotsFired = 0;
  private tankNextShotAt = 0;
  private autoPathTargetId?: string;
  private autoPath: Direction[] = [];
  private autoPathFailures = 0;
  private readonly unreachableAutoTargets = new Set<string>();
  private readonly logs: string[] = [];
  private deathHandled = false;
  private respawnAt: number | null = null;
  private readonly enemyLifecycle = new Map<
    string,
    {
      type: EnemyDomain["snapshot"]["type"];
      removeAt: number;
      respawnAt: number;
    }
  >();
  constructor(
    readonly id: string,
    private readonly wallets: WalletService = standaloneWallets,
    private readonly auction: AuctionService = standaloneAuction,
    saved?: PersistedPlayer,
  ) {
    this.player = new PlayerDomain(
      saved?.id ?? id,
      saved?.name ?? "Ted",
      saved,
    );
    const spawn = getPlayerSpawn(this.area);
    this.player.x = spawn.x;
    this.player.y = spawn.y;
    const npcSpawn = getMapDefinition("pirate_ship").npcSpawns[0];
    if (!npcSpawn)
      throw new Error("[MapData] pirate_ship requires old_drunk NPC spawn.");
    this.npc = new NpcDomain(npcSpawn);
    this.enemies = [];
    this.log(`${this.player.name} iniciou a jornada no Barco Pirata.`);
  }
  persistentState(): PersistedPlayer {
    return this.player.persistentState();
  }
  creditPurchasedRubies(amount: number, purchaseId: string): void {
    this.wallets.credit(this.player.wallet, "RUBIES", amount, {
      playerId: this.player.id,
      source: "RUBY_PURCHASE",
      referenceId: purchaseId,
    });
    this.log(`Compra aprovada: +${amount} Rubis.`);
  }
  private log(message: string): void {
    this.logs.push(message);
  }
  drainLogs(): string[] {
    return this.logs.splice(0);
  }
  private createEnemies(type: EnemyDomain["snapshot"]["type"]): EnemyDomain[] {
    const prefix =
      type === "enemy_wapol"
        ? "wapol"
        : type === "enemy_buffalo"
          ? "buffalo"
          : "alvida";
    return [...getEnemySpawnPoints(this.area)]
      .sort(() => Math.random() - 0.5)
      .slice(0, getMaxAliveEnemies(this.area))
      .map(
        ({ x, y }, index) =>
          new EnemyDomain(
            `${prefix}_${this.nextEnemyId++}_${index}`,
            x,
            y,
            type,
          ),
      );
  }
  private randomSpawn(
    type: EnemyDomain["snapshot"]["type"],
  ): readonly [number, number] {
    const points = getEnemySpawnPoints(this.area);
    const free = points.filter(
      ({ x, y }) =>
        Math.hypot(this.player.x - x, this.player.y - y) >= 180 &&
        !this.enemies.some(
          (enemy) =>
            enemy.snapshot.state !== "DEAD" &&
            Math.hypot(enemy.snapshot.x - x, enemy.snapshot.y - y) < 130,
        ),
    );
    const selected = free[Math.floor(Math.random() * free.length)];
    if (!selected) {
      const fallback = points.find(({ x, y }) =>
        !this.enemies.some((enemy) =>
          enemy.snapshot.state !== "DEAD" &&
          Math.hypot(enemy.snapshot.x - x, enemy.snapshot.y - y) < 130,
        ),
      );
      if (!fallback) throw new Error(`[Spawn] ${this.area} has no valid respawn slot.`);
      this.log(`[Spawn] ${this.area} used a prevalidated fallback slot.`);
      return [fallback.x, fallback.y];
    }
    return [selected.x, selected.y];
  }
  private scheduleEnemyRespawn(enemy: EnemyDomain, now: number): void {
    if (this.enemyLifecycle.has(enemy.snapshot.id)) return;
    this.enemyLifecycle.set(enemy.snapshot.id, {
      type: enemy.snapshot.type,
      removeAt: now + 500,
      respawnAt: now + 3000,
    });
    this.log(
      `[EnemyLifecycle] ${enemy.snapshot.id} ${enemy.snapshot.type} ALIVE→DEAD; RESPAWN_SCHEDULED`,
    );
  }
  private processEnemyLifecycle(now: number): void {
    for (const [id, lifecycle] of this.enemyLifecycle) {
      if (
        now >= lifecycle.removeAt &&
        this.enemies.some((enemy) => enemy.snapshot.id === id)
      ) {
        this.enemies = this.enemies.filter((enemy) => enemy.snapshot.id !== id);
        this.log(`[EnemyLifecycle] ${id} REMOVED`);
      }
      if (
        now >= lifecycle.respawnAt &&
        this.enemies.length < getMaxAliveEnemies(this.area)
      ) {
        const [x, y] = this.randomSpawn(lifecycle.type);
        const prefix =
          lifecycle.type === "enemy_wapol"
            ? "wapol"
            : lifecycle.type === "enemy_buffalo"
              ? "buffalo"
              : "alvida";
        const enemy = new EnemyDomain(
          `${prefix}_${this.nextEnemyId++}`,
          x,
          y,
          lifecycle.type,
        );
        this.enemies.push(enemy);
        this.enemyLifecycle.delete(id);
        this.log(
          `[EnemyLifecycle] ${enemy.snapshot.id} ${lifecycle.type} RESPAWNED`,
        );
      }
    }
  }
  private pushFeedback(
    entry: Omit<CombatFeedbackSnapshot, "id" | "createdAt">,
  ): void {
    this.feedback.push({
      ...entry,
      id: `feedback_${++this.feedbackSequence}`,
      createdAt: Date.now(),
    });
  }
  private useItem(itemId: ItemId, now: number, auto = false): boolean {
    const result = this.consumables.use(this.player, itemId, now);
    if (!result.ok) return false;
    const text = `+${result.restoredHp} HP`;
    this.pushFeedback({
      target: "player",
      x: this.player.x,
      y: this.player.y - 145,
      text,
      kind: "status",
    });
    this.log(
      `${auto ? "Auto: " : ""}${itemDefinitions[itemId].displayName} utilizada: ${text}.`,
    );
    return true;
  }
  private autoPotion(now: number): void {
    const s = this.player.autoHuntSettings;
    if (
      this.player.isDead ||
      this.player.autoHunt === "OFF" ||
      !s.autoUseConsumables ||
      !s.hpPotionEnabled ||
      (this.player.resources.currentHp / this.player.stats.maxHp) * 100 >
        s.hpThresholdPercent
    )
      return;
    const slots =
      s.utilityMode === "SLOT_1"
        ? [this.player.utilitySlots[0]]
        : s.utilityMode === "SLOT_2"
          ? [this.player.utilitySlots[1]]
          : [...this.player.utilitySlots];
    const ids = slots.filter((id): id is ItemId => Boolean(id));
    for (const id of ids) if (this.useItem(id, now, true)) break;
  }
  snapshot(now = Date.now()): GameSnapshot {
    this.autoPotion(now);
    while (this.feedback.length && now - this.feedback[0].createdAt > 1400)
      this.feedback.shift();
    return {
      area: this.area,
      player: this.player.snapshot(),
      enemies: this.enemies.map((enemy) => enemy.snapshot),
      npcs: this.area === "pirate_ship" ? [this.npc.snapshot] : [],
      huntAnalyzer: this.analyzer.snapshot(now),
      huntAnalyzerHistory: this.analyzer.historySnapshot(),
      combatFeedback: [...this.feedback],
      auction: this.auction.snapshotFor(this.player.id, now),
      contentCatalog: {
        items: Object.values(itemDefinitions),
        fruits: Object.values(fruitDefinitions),
        public: publicCatalog(),
        discovery: {
          items: [...this.player.discoveredItems],
          fruits: [...this.player.discoveredFruits],
          enemies: [...this.player.discoveredEnemies],
          hunts: [...this.player.discoveredHunts],
        },
      },
    };
  }
  private targetInRange(): EnemyDomain | undefined {
    return this.targetWithin(this.player.stats.attackRange);
  }
  private targetWithin(range: number): EnemyDomain | undefined {
    return this.enemies
      .filter(
        (enemy) =>
          enemy.snapshot.state !== "DEAD" &&
          Math.hypot(
            enemy.snapshot.x - this.player.x,
            enemy.snapshot.y - this.player.y,
          ) <= range,
      )
      .sort(
        (a, b) =>
          Math.hypot(
            a.snapshot.x - this.player.x,
            a.snapshot.y - this.player.y,
          ) -
          Math.hypot(
            b.snapshot.x - this.player.x,
            b.snapshot.y - this.player.y,
          ),
      )[0];
  }
  private enemiesInRadius(radius: number): EnemyDomain[] {
    return this.enemies.filter(
      (enemy) =>
        enemy.snapshot.state !== "DEAD" &&
        Math.hypot(enemy.snapshot.x - this.player.x, enemy.snapshot.y - this.player.y) <= radius,
    );
  }
  private autoTarget(): EnemyDomain | undefined {
    const distance = (enemy: EnemyDomain) =>
      Math.hypot(
        enemy.snapshot.x - this.player.x,
        enemy.snapshot.y - this.player.y,
      );
    const candidates = this.enemies.filter(
      (enemy) =>
        enemy.snapshot.state !== "DEAD" &&
        !this.unreachableAutoTargets.has(enemy.snapshot.id),
    );
    const priority = this.player.autoHuntSettings.targetPriority;
    return candidates.sort((a, b) =>
      priority === "LOWEST_HP"
        ? a.snapshot.hp - b.snapshot.hp || distance(a) - distance(b)
        : priority === "HIGHEST_HP"
          ? b.snapshot.hp - a.snapshot.hp || distance(a) - distance(b)
          : distance(a) - distance(b),
    )[0];
  }
  private resetAutoPath(): void {
    this.autoPathTargetId = undefined;
    this.autoPath = [];
    this.autoPathFailures = 0;
  }
  /** Reuses a route while chasing one target; recomputes only after a blocked step. */
  private moveTowardAutoTarget(target: EnemyDomain, attackRange: number): boolean {
    if (this.autoPathTargetId !== target.snapshot.id || !this.autoPath.length) {
      const path = findNavigationPath(
        this.area,
        this.player,
        target.snapshot,
        attackRange,
      );
      if (!path) {
        this.unreachableAutoTargets.add(target.snapshot.id);
        this.resetAutoPath();
        this.log(`[AutoHunt] alvo inacessível ignorado: ${target.snapshot.id}.`);
        return false;
      }
      this.autoPathTargetId = target.snapshot.id;
      this.autoPath = path;
    }
    const direction = this.autoPath.shift();
    if (!direction) return false;
    if (this.player.move(direction, 20, (x, y) => !canMoveTo(this.area, x, y))) {
      this.autoPathFailures = 0;
      return true;
    }
    this.autoPath = [];
    this.autoPathFailures += 1;
    if (this.autoPathFailures >= 2) {
      this.unreachableAutoTargets.add(target.snapshot.id);
      this.resetAutoPath();
      this.log(`[AutoHunt] rota bloqueada; alvo trocado: ${target.snapshot.id}.`);
    }
    return false;
  }
  private dealHit(
    target: EnemyDomain,
    attack: number,
    now: number,
    label?: string,
    fixed = false,
  ): void {
    this.player.direction = cardinalDirection(
      target.snapshot.x - this.player.x,
      target.snapshot.y - this.player.y,
    );
    const before = target.snapshot.hp;
    const result = fixed
      ? { damage: attack, critical: false, dodged: false }
      : resolveCombat(
          attack,
          target.definition.defense,
          this.player.stats.critChanceBps,
        );
    if (!result.dodged) target.damage(result.damage);
    const damage = before - target.snapshot.hp;
    if (damage)
      this.pushFeedback({
        target: "enemy",
        targetId: target.snapshot.id,
        x: target.snapshot.x,
        y: target.snapshot.y - 110,
        text: label
          ? `${label} ${damage}`
          : `${result.critical ? "CRÍTICO " : "-"}${damage}`,
        kind: result.critical ? "critical" : "damage",
      });
    this.analyzer.recordDamageDealt(damage, result.critical);
    if (!target.claimReward()) return;
    const drops = target.loot(undefined, (chanceBps) =>
      this.player.rewardDropChance(chanceBps),
    );
    for (const drop of drops) {
      if (drop.itemId.startsWith("fruit_")) this.player.gainFruit(drop.itemId);
      const beforeQuantity = this.player.inventory.quantity(
        drop.itemId as ItemId,
      );
      this.player.inventory.add(drop.itemId as ItemId, drop.quantity);
      if (process.env.NODE_ENV !== "production")
        console.info(
          `[ContentLoot] enemy=${target.snapshot.type} item=${drop.itemId} chance=resolved result=DROP quantity=${drop.quantity} inventory=${beforeQuantity}->${this.player.inventory.quantity(drop.itemId as ItemId)}`,
        );
      for (let i = 0; i < drop.quantity; i++)
        this.analyzer.recordLoot(drop.itemId as ItemId);
    }
    const awardedXp = this.player.rewardXp(target.definition.xpReward);
    const progress = this.player.gainXp(awardedXp);
    this.wallets.credit(
      this.player.wallet,
      "BERRIES",
      target.definition.berriesReward,
      {
        playerId: this.player.id,
        source: "ENEMY_REWARD",
        referenceId: target.snapshot.id,
      },
    );
    this.analyzer.recordKill(target.snapshot.type);
    this.analyzer.recordXp(awardedXp);
    this.analyzer.recordBerries(target.definition.berriesReward);
    this.scheduleEnemyRespawn(target, now);
    this.log(
      `${target.snapshot.type === "enemy_buffalo" ? "Buffalo" : "Alvida"} derrotada. +${awardedXp} XP, +${target.definition.berriesReward} Berries${drops.length ? `: ${drops.map((drop) => drop.itemId).join(", ")} coletados` : ""}.`,
    );
    if (progress.levelsGained)
      this.log(
        `LEVEL UP! Lv. ${progress.oldLevel} → Lv. ${progress.newLevel}.`,
      );
  }
  private attack(now: number): boolean {
    const tank = this.player.isTank(now);
    const target = tank ? this.targetWithin(8 * 64) : this.targetInRange();
    if (!target || !this.player.canAttack(now)) return false;
    if (tank) {
      if (now < this.tankNextShotAt || this.tankShotsFired >= 7) return false;
      this.tankShotsFired += 1;
      this.tankNextShotAt = now + 4000;
      this.player.attacked(now);
      this.pushFeedback({
        target: "player",
        x: this.player.x,
        y: this.player.y - 90,
        endX: target.snapshot.x,
        endY: target.snapshot.y - 90,
        text: "TIRO DE CANHÃO",
        kind: "status",
      });
      this.dealHit(target, Math.floor(this.player.attackPower * 2), now, "CANHÃO -");
      return true;
    }
    this.player.attacked(now);
    this.dealHit(target, this.player.attackPower, now);
    return true;
  }
  private castSkill(skillId: string, now: number): boolean {
    const target = this.targetInRange();
    if (skillId === "sube_bubbles") {
      if (!this.player.useSkill(skillId, now)) return false;
      this.enemiesInRadius(5 * 64).forEach((enemy) =>
        this.dealHit(enemy, Math.floor(this.player.attackPower * 0.8), now, "BOLHAS -"),
      );
      this.pushFeedback({ target: "player", x: this.player.x, y: this.player.y - 150, text: "BOLHAS 5×5", kind: "status" });
      return true;
    }
    if (skillId === "guro_blast") {
      if (!this.player.useSkill(skillId, now)) return false;
      this.pushFeedback({ target: "player", x: this.player.x, y: this.player.y - 150, text: "HÉLICES", kind: "status" });
      return true;
    }
    if (skillId === "guro_spin") {
      const lineTarget = this.targetWithin(8 * 64);
      if (!lineTarget || !this.player.useSkill(skillId, now)) return false;
      const dx = lineTarget.snapshot.x - this.player.x;
      const dy = lineTarget.snapshot.y - this.player.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      this.enemies
        .filter((enemy) => {
          if (enemy.snapshot.state === "DEAD") return false;
          const ex = enemy.snapshot.x - this.player.x;
          const ey = enemy.snapshot.y - this.player.y;
          const projection = (ex * dx + ey * dy) / length;
          const perpendicular = Math.abs(ex * dy - ey * dx) / length;
          return projection >= 0 && projection <= 8 * 64 && perpendicular <= 60;
        })
        .forEach((enemy) => {
          this.dealHit(enemy, Math.floor(this.player.attackPower * 1.3), now, "VENTOS -");
          enemy.knockUp(now);
        });
      this.pushFeedback({ target: "enemy", x: lineTarget.snapshot.x, y: lineTarget.snapshot.y - 145, text: "KNOCK UP", kind: "status" });
      return true;
    }
    if (skillId === "guro_crush") {
      if (!this.player.useSkill(skillId, now)) return false;
      this.pushFeedback({ target: "player", x: this.player.x, y: this.player.y - 150, text: "EVASÃO +15%", kind: "status" });
      return true;
    }
    if (skillId === "baku_cannon") {
      if (!this.player.useSkill(skillId, now)) return false;
      this.tankShotsFired = 0;
      this.tankNextShotAt = now;
      this.pushFeedback({ target: "player", x: this.player.x, y: this.player.y - 150, text: "TANK MODE", kind: "status" });
      return true;
    }
    if (skillId === "baku_bite") {
      if (!target || !this.player.useSkill(skillId, now)) return false;
      const before = target.snapshot.hp;
      this.dealHit(target, Math.floor(this.player.attackPower * 1.5), now, "MORDIDA -");
      this.player.resources.currentHp = Math.min(
        this.player.stats.maxHp,
        this.player.resources.currentHp +
          Math.floor((before - target.snapshot.hp) * 0.2),
      );
      this.pushFeedback({ target: "player", x: this.player.x, y: this.player.y - 150, text: "MORDIDA +VIDA", kind: "status" });
      return true;
    }
    if (skillId === "baku_armor") {
      if (!this.player.useSkill(skillId, now)) return false;
      this.pushFeedback({ target: "player", x: this.player.x, y: this.player.y - 150, text: "DEFENSE +40%", kind: "status" });
      return true;
    }
    return this.player.useSkill(skillId, now);
  }
  handle(intent: ClientIntent, now = Date.now()): void {
    if (this.player.isDead) {
      if (intent.type === "requestRespawn") this.respawnToShip();
      return;
    }
    if (intent.type === "move") {
      const x = Math.sign(intent.x),
        y = Math.sign(intent.y);
      if (!x && !y) this.player.stop();
      else if (!(x && y))
        this.player.move(
          x < 0 ? "left" : x > 0 ? "right" : y < 0 ? "up" : "down",
          20,
          (nextX, nextY) => !canMoveTo(this.area, nextX, nextY),
        );
    } else if (intent.type === "attack") this.attack(now);
    else if (intent.type === "useItem") {
      if (!this.useItem(intent.itemId, now))
        this.log(
          this.player.resources.currentHp >= this.player.stats.maxHp
            ? "Vida já está cheia."
            : "Item não pode ser usado agora.",
        );
    } else if (intent.type === "setUtilitySlot") {
      const definition = itemDefinitions[intent.itemId];
      if (
        !definition?.usable ||
        !definition.consumable ||
        !this.player.inventory.quantity(intent.itemId) ||
        this.player.utilitySlots[1 - intent.slot] === intent.itemId
      )
        this.log("Utilidade inválida ou duplicada.");
      else this.player.utilitySlots[intent.slot] = intent.itemId;
    } else if (intent.type === "clearUtilitySlot")
      this.player.utilitySlots[intent.slot] = null;
    else if (intent.type === "updateAutoHuntSettings") {
      const s = {
        ...this.player.autoHuntSettings,
        ...intent.settings,
        skillPolicies: {
          ...this.player.autoHuntSettings.skillPolicies,
          ...intent.settings.skillPolicies,
        },
      };
      const policiesValid = Object.values(s.skillPolicies).every(
        (policy) =>
          Number.isInteger(policy.priority) &&
          policy.priority >= 1 &&
          policy.priority <= 4 &&
          Number.isInteger(policy.hpThresholdPercent) &&
          policy.hpThresholdPercent >= 1 &&
          policy.hpThresholdPercent <= 99 &&
          ["ALWAYS", "HP_BELOW"].includes(policy.condition),
      );
      if (
        Number.isInteger(s.hpThresholdPercent) &&
        Number.isInteger(s.manaThresholdPercent) &&
        s.hpThresholdPercent >= 1 &&
        s.hpThresholdPercent <= 99 &&
        s.manaThresholdPercent >= 1 &&
        s.manaThresholdPercent <= 99 &&
        ["SMALL_FIRST", "LARGE_FIRST", "SMART"].includes(s.potionPreference) &&
        ["NEAREST", "LOWEST_HP", "HIGHEST_HP"].includes(s.targetPriority) &&
        policiesValid
      )
        this.player.autoHuntSettings = s;
      else this.log("Configuração do Bot inválida.");
    } else if (
      intent.type === "useSkill" &&
      !this.castSkill(intent.skillId, now)
    )
      this.log(
        "Habilidade indisponível: equipe a fruta correta, aguarde o cooldown e fique no alcance.",
      );
    else if (intent.type === "toggleAutoHunt") {
      if (this.area === "pirate_ship")
        this.log("Entre em uma Hunt para ativar o Auto-Hunt.");
      else {
        this.player.autoHunt =
          this.player.autoHunt === "OFF" ? "SEARCHING" : "OFF";
        this.log(`Auto-Hunt: ${this.player.autoHunt}`);
      }
    } else if (intent.type === "equipFruit") {
      try {
        this.player.equipFruit(intent.fruitId);
        this.log(`${intent.fruitId} equipada.`);
      } catch {
        this.log("Akuma no Mi não obtida.");
      }
    } else if (intent.type === "unequipFruit") {
      this.player.unequipFruit();
      this.log("Akuma no Mi desequipada.");
    } else if (intent.type === "enterHunt") {
      const hunt = hunts.find((entry) => entry.id === intent.huntId);
      if (!hunt) {
        this.log("Hunt indisponível.");
        return;
      }
      const type =
        hunt.mainEnemyId === "enemy_wapol"
          ? "enemy_wapol"
          : hunt.mainEnemyId === "enemy_buffalo"
            ? "enemy_buffalo"
            : "enemy_alvida";
      this.area = hunt.mapId;
      this.enemyLifecycle.clear();
      this.unreachableAutoTargets.clear();
      this.resetAutoPath();
      this.analyzer.start(hunt.id, now);
      this.player.discoverHunt(hunt.id);
      const spawn = getPlayerSpawn(this.area);
      this.player.x = spawn.x;
      this.player.y = spawn.y;
      this.player.state = "IDLE";
      this.player.autoHunt = "OFF";
      this.enemies = this.createEnemies(type);
      this.log(`Ted viajou para ${hunt.displayName}. Auto-Hunt desligado.`);
    } else if (intent.type === "leaveHunt") this.returnToShip(now);
    else if (intent.type === "buyItem") {
      const definition = itemDefinitions[intent.itemId],
        price = definition?.buyValue;
      const quantity = intent.quantity ?? 1;
      if (
        !definition?.shopBuyable ||
        !price ||
        !Number.isInteger(quantity) ||
        quantity < 1
      )
        this.log("Item não está à venda.");
      else if (
        !this.wallets.debit(this.player.wallet, "BERRIES", price * quantity, {
          playerId: this.player.id,
          source: "SHOP_PURCHASE",
          referenceId: intent.itemId,
        })
      )
        this.log("Berries insuficientes.");
      else {
        this.player.inventory.add(intent.itemId, quantity);
        this.log(`${definition.displayName} ×${quantity} adicionada à Bolsa.`);
      }
    } else if (intent.type === "depositItem") {
      const error = this.player.transferToStorage(
        intent.itemId,
        intent.quantity,
      );
      this.log(
        error ??
          `${itemDefinitions[intent.itemId]?.displayName ?? "Item"} x${intent.quantity} enviado ao Depósito.`,
      );
    } else if (intent.type === "withdrawItem") {
      const error = this.player.transferFromStorage(
        intent.itemId,
        intent.quantity,
      );
      this.log(
        error ??
          `${itemDefinitions[intent.itemId]?.displayName ?? "Item"} x${intent.quantity} retirado do Depósito.`,
      );
    } else if (intent.type === "setItemLock") {
      const error = this.player.setItemLocked(intent.itemId, intent.locked);
      this.log(
        error ?? (intent.locked ? "Item protegido." : "Proteção removida."),
      );
    } else if (intent.type === "purchaseVip") {
      if (this.player.vipActive) this.log("VIP já está ativo.");
      else if (
        !this.wallets.debit(this.player.wallet, "RUBIES", 20, {
          playerId: this.player.id,
          source: "VIP_PURCHASE",
          referenceId: "vip_permanent",
        })
      )
        this.log("Rubis insuficientes para ativar o VIP.");
      else if (this.player.activateVip(now))
        this.log("VIP PROJECT ONE ativado permanentemente.");
      else {
        this.wallets.credit(this.player.wallet, "RUBIES", 20, {
          playerId: this.player.id,
          source: "VIP_PURCHASE",
          referenceId: "vip_rollback",
        });
        this.log("Não foi possível ativar o VIP.");
      }
    } else if (intent.type === "sellItems")
      this.sellInventoryItems(intent.itemIds);
    else if (intent.type === "sellAll")
      this.sellInventoryItems(
        this.player.inventory
          .snapshot()
          .map((stack) => stack.itemId)
          .filter(
            (id) =>
              !intent.excludedItemIds.includes(id) &&
              !this.player.isItemLocked(id),
          ),
      );
    else if (intent.type === "createAuctionListing") {
      const result = this.auction.createListing(
        this.player,
        intent.itemId,
        intent.quantity,
        intent.berriesPrice,
        intent.rubiesPrice,
        intent.allowOffers,
        now,
      );
      this.log(
        result.ok ? "Anúncio criado e item colocado em escrow." : result.reason,
      );
    } else if (intent.type === "buyAuctionListing") {
      const result = this.auction.buy(
        this.player,
        intent.listingId,
        intent.currency,
        now,
      );
      this.log(
        result.ok
          ? "Compra concluída. Taxa de 10% aplicada ao vendedor."
          : result.reason,
      );
    } else if (intent.type === "cancelAuctionListing") {
      const result = this.auction.cancel(this.player, intent.listingId);
      this.log(
        result.ok ? "Anúncio cancelado e item devolvido." : result.reason,
      );
    } else if (intent.type === "createAuctionOffer") {
      const result = this.auction.offer(
        this.player,
        intent.listingId,
        intent.currency,
        intent.amount,
        now,
      );
      this.log(
        result.ok
          ? "Oferta enviada; saldo reservado em escrow."
          : result.reason,
      );
    } else if (intent.type === "acceptAuctionOffer") {
      const result = this.auction.accept(
        this.player,
        intent.listingId,
        intent.offerId,
        now,
      );
      this.log(
        result.ok ? "Oferta aceita e transação concluída." : result.reason,
      );
    } else if (intent.type === "rejectAuctionOffer") {
      const result = this.auction.reject(
        this.player,
        intent.listingId,
        intent.offerId,
      );
      this.log(
        result.ok ? "Oferta recusada e saldo devolvido." : result.reason,
      );
    } else if (intent.type === "interactWithNpc") {
      const result = this.npc.interact(intent.npcId, this.player, now);
      this.log(
        result === "HEALED"
          ? "Velho Bêbado restaurou sua vida."
          : result === "FULL_HEALTH"
            ? "Você já está com a vida cheia."
            : result === "TOO_FAR"
              ? "Chegue mais perto."
              : result === "COOLDOWN"
                ? "O Velho Bêbado ainda está servindo o gole."
                : result === "PLAYER_DEAD"
                  ? "Você precisa estar vivo para conversar."
                  : "Esse NPC não existe.",
      );
    } else if (
      intent.type === "resetHuntAnalyzer" &&
      this.analyzer.snapshot(now).huntId
    )
      this.analyzer.reset(this.analyzer.snapshot(now).huntId!, now);
    else if (intent.type === "requestRespawn") this.respawnToShip();
  }
  private handlePlayerDeath(now: number): void {
    if (this.deathHandled) return;
    this.deathHandled = true;
    this.player.resources.currentHp = 0;
    this.player.state = "DEAD";
    this.player.cancelPendingActions();
    this.analyzer.recordDeath();
    this.respawnAt = now + 1800;
    this.log(
      `[DeathDebug] ${this.id} ALIVE→DEAD hp=0 area=${this.area} auto=OFF`,
    );
    this.log("Ted foi derrotado. Retornando ao barco...");
  }
  /** One finite server-authoritative inventory transaction. It never mutates while discovering eligibility. */
  private sellInventoryItems(requestedIds: readonly ItemId[]): void {
    const requested = new Set(requestedIds);
    const eligible = this.player.inventory.snapshot().filter((stack) => {
      const definition = itemDefinitions[stack.itemId];
      return (
        requested.has(stack.itemId) &&
        !this.player.isItemLocked(stack.itemId) &&
        stack.itemId !== this.player.activeFruitId &&
        definition?.sellable !== false &&
        definition?.category !== "fruit" &&
        stack.quantity > 0
      );
    });
    const berries = eligible.reduce(
      (total, stack) =>
        total +
        stack.quantity * (itemDefinitions[stack.itemId]?.sellValue ?? 0),
      0,
    );
    if (!eligible.length) {
      this.log("Nenhum item disponível para venda.");
      return;
    }
    for (const stack of eligible)
      this.player.inventory.remove(stack.itemId, stack.quantity);
    this.wallets.credit(this.player.wallet, "BERRIES", berries, {
      playerId: this.player.id,
      source: "ITEM_SELL",
    });
    this.log(`Itens vendidos por ${berries} Berries.`);
  }
  private returnToShip(now: number): void {
    if (this.area === "pirate_ship") return;
    this.analyzer.end(now);
    this.enemyLifecycle.clear();
    this.enemies = [];
    this.area = "pirate_ship";
    const spawn = getPlayerSpawn(this.area);
    this.player.x = spawn.x;
    this.player.y = spawn.y;
    this.player.state = "IDLE";
    this.player.autoHunt = "OFF";
    this.log("Ted retornou ao Barco Pirata.");
  }
  private respawnToShip(): void {
    if (!this.player.isDead || !this.deathHandled) return;
    this.log(`[DeathDebug] ${this.id} DEAD→RESPAWNING area=${this.area}`);
    this.analyzer.end();
    this.area = "pirate_ship";
    this.player.healFull();
    const spawn = getPlayerSpawn(this.area);
    this.player.x = spawn.x;
    this.player.y = spawn.y;
    this.player.state = "IDLE";
    this.player.autoHunt = "OFF";
    this.respawnAt = null;
    this.deathHandled = false;
    this.log(`[DeathDebug] ${this.id} RESPAWNING→ALIVE area=pirate_ship`);
    this.log("Ted retornou ao barco para se recuperar.");
  }
  tick(now = Date.now()): void {
    this.player.tick(now);
    this.npc.tick(now);
    this.processEnemyLifecycle(now);
    if (this.player.isDead) {
      if (this.respawnAt !== null && now >= this.respawnAt)
        this.respawnToShip();
      return;
    }
    if (this.area === "pirate_ship") return;
    const config =
      this.area === "ice_mountain"
        ? wapolConfig
        : this.area === "beach_buffalo"
          ? buffaloConfig
          : alvidaConfig;
    for (const enemy of this.enemies)
      if (
        enemy.tick(
          this.player,
          now,
          config.moveSpeed * 0.3,
          (x, y) => !canMoveTo(this.area, x, y),
        )
      ) {
        const hit = resolveCombat(
          enemy.definition.attackPower,
          this.player.defenseAt(now),
          0,
          this.player.evasionAt(now),
        );
        this.player.receiveDamage(hit.damage);
        if (hit.dodged) {
          this.analyzer.recordDodge();
          this.pushFeedback({
            target: "player",
            x: this.player.x,
            y: this.player.y - 125,
            text: "ESQUIVOU",
            kind: "dodge",
          });
        } else {
          this.analyzer.recordDamageTaken(hit.damage);
          this.pushFeedback({
            target: "player",
            x: this.player.x,
            y: this.player.y - 125,
            text: `-${hit.damage}`,
            kind: "damage",
          });
        }
        if (this.player.isDead) {
          this.handlePlayerDeath(now);
          break;
        }
      }
    if (this.player.consumeGuroHelicesTick(now)) {
      this.enemiesInRadius(150).forEach((enemy) =>
        this.dealHit(enemy, Math.floor(this.player.attackPower * 0.3), now, "HÉLICES -"),
      );
      this.pushFeedback({
        target: "player",
        x: this.player.x,
        y: this.player.y - 175,
        text: "HÉLICES",
        kind: "status",
      });
    }
    if (this.player.autoHunt !== "OFF") {
      const autoTarget = this.autoTarget();
      if (!autoTarget) {
        this.player.autoHunt = "SEARCHING";
        this.resetAutoPath();
        return;
      }
      const dx = autoTarget.snapshot.x - this.player.x,
        dy = autoTarget.snapshot.y - this.player.y;
      const attackRange = this.player.isTank(now)
        ? 8 * 64
        : this.player.stats.attackRange;
      if (Math.hypot(dx, dy) <= attackRange) {
        this.resetAutoPath();
        this.player.autoHunt = "ATTACKING";
        const fruit = this.player.activeFruitId
          ? fruitDefinitions[this.player.activeFruitId]
          : undefined;
        const skills: readonly string[] = fruit?.skillIds ?? [];
        const policy = (id: string) =>
          this.player.autoHuntSettings.skillPolicies[id] ?? {
            enabled: true,
            priority: skills.indexOf(id) + 1,
            condition: "ALWAYS" as const,
            hpThresholdPercent: 40,
          };
        const nextSkills = [...skills]
          .filter(
            (id) =>
              skillDefinitions[id]?.status === "AVAILABLE" &&
              policy(id).enabled &&
              (policy(id).condition === "ALWAYS" ||
                (this.player.resources.currentHp / this.player.stats.maxHp) *
                  100 <
                  policy(id).hpThresholdPercent),
          )
          .sort((a, b) => policy(a).priority - policy(b).priority);
        if (!nextSkills.some((skillId) => this.castSkill(skillId, now))) {
          if (this.player.autoHuntSettings.basicAttackEnabled) this.attack(now);
        }
      } else {
        this.player.autoHunt = "MOVING_TO_TARGET";
        this.moveTowardAutoTarget(autoTarget, attackRange);
      }
    }
  }
}
