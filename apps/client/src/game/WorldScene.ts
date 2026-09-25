import Phaser from "phaser";
import type {
  CombatFeedbackSnapshot,
  Direction,
  EnemySnapshot,
  GameSnapshot,
  NpcSnapshot,
  PlayerSnapshot,
} from "@onepiece/shared";
import { Asset } from "../assets/AssetManifest";
import { bridge } from "./GameBridge";
import {
  alvidaFrame,
  buffaloFrame,
  oldDrunkFrame,
  tedFrame,
  wapolFrame,
  type AnimationFrame,
} from "./DirectionalAnimation";

const treeIds = [
  "d4b57d88-a0bb-4355-bfe0-567a4ff6356b",
  "d1880c40-fc8a-46e5-b9f4-50b4ccb1cf06",
  "2e588455-f05a-4012-be2f-7712a710d827",
  "25032c55-d8c5-4fb8-9ebf-218d4577867a",
];
const worldSizes: Record<GameSnapshot["area"], { width: number; height: number }> = {
  pirate_ship: { width: 1600, height: 1100 },
  forest_alvida: { width: 1600, height: 1100 },
  beach_buffalo: { width: 1600, height: 1100 },
  ice_mountain: { width: 1600, height: 1100 },
};
type Visual = {
  sprite: Phaser.GameObjects.Image;
  label?: Phaser.GameObjects.Text;
  lastTexture: string;
};

export class WorldScene extends Phaser.Scene {
  private ted?: Visual;
  private player?: PlayerSnapshot;
  private enemies = new Map<
    string,
    {
      visual: Visual;
      healthBar: Phaser.GameObjects.Graphics;
      snapshot: EnemySnapshot;
    }
  >();
  private oldDrunk?: { visual: Visual; snapshot: NpcSnapshot };
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private pressed = new Set<Direction>();
  private lastDirection: Direction = "down";
  private lastMove = 0;
  private playerWalkUntil = 0;
  private background?: Phaser.GameObjects.TileSprite;
  private healingCounter?: Phaser.GameObjects.Image;
  private fruitFx?: Phaser.GameObjects.Image;
  private fruitFxTimer?: Phaser.Time.TimerEvent;
  private subeDefenseFx?: Phaser.GameObjects.Image;
  private subeEvasionFx?: Phaser.GameObjects.Image;
  private collisionDebug?: Phaser.GameObjects.Graphics;
  private readonly displayedFeedback = new Set<string>();
  private readonly queuedTextures = new Set<string>();
  private forestPropsCreated = false;
  private area: GameSnapshot["area"] = "forest_alvida";

  constructor() {
    super("world");
  }

  preload(): void {
    this.installDevelopmentLoaderLogging();
    // A new player starts on the ship. Loading every hunt, enemy and fruit frame
    // here decoded more than 1 GB of textures before the mobile scene could render.
    this.load.image("ship_1", Asset.shipFrames[0]);
    this.load.image("ted_idle_1", Asset.ted("idle", 1));
    this.load.image("healing_counter", Asset.healingCounter);
    this.load.image(
      "old_drunk_seated_idle_1",
      Asset.oldDrunkSeated("idle", 1),
    );
  }

  create(): void {
    this.background = this.add
      .tileSprite(800, 550, 1600, 1100, "ship_1")
      .setDisplaySize(1600, 1100)
      .setTint(0x9bc479);
    this.healingCounter = this.add
      .image(800, 470, "healing_counter")
      .setDisplaySize(440, 440)
      .setOrigin(0.5, 1)
      .setDepth(470)
      .setVisible(false)
      .setName("ship-prop");
    const sprite = this.add
      .image(620, 600, "ted_idle_1")
      .setDisplaySize(112, 112)
      .setOrigin(0.5, 1);
    this.ted = { sprite, lastTexture: "" };
    this.syncWorldBounds();
    this.cameras.main.startFollow(sprite, true, 0.12, 0.12);
    this.cameras.main.setZoom(1.15);
    this.scale.on("resize", () => this.fillViewportBackground());
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.keys = this.input.keyboard?.addKeys("W,A,S,D,SPACE") as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
    this.input.keyboard?.on("keydown", (event: KeyboardEvent) =>
      this.rememberDirection(event.code),
    );
    bridge.onSnapshot = (snapshot) => this.applySnapshot(snapshot);
    void this.renderCollisionDebug();
    this.devLog("create complete", { width: this.scale.width, height: this.scale.height });
  }

  update(time: number): void {
    this.fillViewportBackground();
    this.setBackgroundTexture(
      this.area === "pirate_ship"
        ? `ship_${(Math.floor(time / 150) % 4) + 1}`
        : this.area === "beach_buffalo"
          ? `beach_${(Math.floor(time / 180) % 4) + 1}`
          : this.area === "ice_mountain"
            ? `ice_${(Math.floor(time / 380) % 4) + 1}`
            : "ground",
    );
    this.renderAnimatedVisuals(time);
    if (
      !this.cursors ||
      !this.keys ||
      (document.activeElement as HTMLElement | null)?.matches(
        "input, textarea, select",
      )
    )
      return;
    const active = this.activeDirection();
    if (time - this.lastMove >= 80) {
      window.dispatchEvent(
        new CustomEvent("game-intent", {
          detail: active
            ? { type: "move", ...vector(active) }
            : { type: "move", x: 0, y: 0 },
        }),
      );
      this.lastMove = time;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE))
      window.dispatchEvent(
        new CustomEvent("game-intent", { detail: { type: "attack" } }),
      );
  }

  /** HUD panels float over Phaser; this keeps the original stable backdrop filling the viewport. */
  private devLog(message: string, detail?: unknown): void {
    if (import.meta.env.DEV) console.info(`[Phaser World] ${message}`, detail ?? "");
  }

  private installDevelopmentLoaderLogging(): void {
    if (!import.meta.env.DEV) return;
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) =>
      console.error("[Phaser World] asset failed", { key: file.key, src: file.src }),
    );
    this.load.on(Phaser.Loader.Events.COMPLETE, () =>
      this.devLog("preload complete"),
    );
    this.devLog("preload start");
  }

  private setBackgroundTexture(texture: string): void {
    if (this.textures.exists(texture)) this.background?.setTexture(texture);
    else this.requestTexture(texture);
  }

  private requestTexture(key: string): void {
    if (this.textures.exists(key) || this.queuedTextures.has(key)) return;
    const source = this.sourceForTexture(key);
    if (!source) return this.devLog("missing manifest entry", key);
    this.queuedTextures.add(key);
    this.load.image(key, source);
    this.devLog("queued asset", { key, source });
    if (!this.load.isLoading()) this.load.start();
  }

  private sourceForTexture(key: string): string | undefined {
    if (key === "ground") return Asset.forestGround;
    const background = /^(ship|beach|ice)_(\d+)$/.exec(key);
    if (background) {
      const [, type, index] = background;
      return type === "ship"
        ? Asset.shipFrames[Number(index) - 1]
        : type === "beach"
          ? Asset.beachFrames[Number(index) - 1]
          : Asset.iceFrames[Number(index) - 1];
    }
    if (key.startsWith("tree_")) return Asset.tree(key.slice("tree_".length));
    const ted = /^ted_(idle|walk|attack|death)_(\d+)$/.exec(key);
    if (ted) return Asset.ted(ted[1] as "idle" | "walk" | "attack" | "death", Number(ted[2]));
    const tedDirectional = /^ted_idle_(Costa|Lado)_(\d+)$/.exec(key);
    if (tedDirectional)
      return Asset.tedIdleDirectional(tedDirectional[1] as "Costa" | "Lado", Number(tedDirectional[2]));
    const drunk = /^old_drunk_seated_(idle|drink|sway|interact|heal)_(\d+)$/.exec(key);
    if (drunk)
      return Asset.oldDrunkSeated(drunk[1] as "idle" | "drink" | "sway" | "interact" | "heal", Number(drunk[2]));
    const alvida = /^alvida_(Idle|Walking)_(Frente|Costa|Lado)_(\d+)$/.exec(key);
    if (alvida)
      return Asset.alvida(alvida[1] as "Idle" | "Walking", alvida[2] as "Frente" | "Costa" | "Lado", Number(alvida[3]));
    const alvidaAttack = /^alvida_Attack_(\d+)$/.exec(key);
    if (alvidaAttack) return Asset.alvidaAttack(Number(alvidaAttack[1]));
    const buffalo = /^buffalo_(idle|walk)_(down|up|side)_(\d+)$/.exec(key);
    if (buffalo)
      return Asset.buffalo(buffalo[1] as "idle" | "walk", buffalo[2] as "down" | "up" | "side", Number(buffalo[3]));
    const buffaloAttack = /^buffalo_attack_(\d+)$/.exec(key);
    if (buffaloAttack) return Asset.buffaloAttackDown(Number(buffaloAttack[1]));
    const wapol = /^wapol_(idle|walk)_(down|up|side)_(\d+)$/.exec(key);
    if (wapol)
      return Asset.wapol(wapol[1] as "idle" | "walk", wapol[2] as "down" | "up" | "side", Number(wapol[3]));
    const wapolAttack = /^wapol_attack_(\d+)$/.exec(key);
    if (wapolAttack) return Asset.wapolAttack(Number(wapolAttack[1]));
    const fruit = /^(sube|guro|baku)_h([123])_(.+)$/.exec(key);
    if (fruit) return Asset.fruitSkill(fruit[1] as "sube" | "guro" | "baku", Number(fruit[2]), fruit[3]);
    const defense = /^sube_defense_fx_(\d+)$/.exec(key);
    if (defense) return Asset.subeDefenseFx(Number(defense[1]));
    const evasion = /^sube_evasion_fx_(\d+)$/.exec(key);
    if (evasion) return Asset.subeEvasionFx(Number(evasion[1]));
    const cannon = /^baku_h2_tiro(\d+)$/.exec(key);
    if (cannon) return Asset.fruitSkill("baku", 2, `tiro${cannon[1]}`);
    return undefined;
  }

  private ensureForestProps(): void {
    if (this.forestPropsCreated) {
      this.children.list
        .filter((child) => child.name === "forest-prop")
        .forEach((child) => (child as Phaser.GameObjects.Image).setVisible(true));
      return;
    }
    const unavailable = treeIds.filter((id) => !this.textures.exists(`tree_${id}`));
    if (unavailable.length) {
      unavailable.forEach((id) => this.requestTexture(`tree_${id}`));
      return;
    }
    [
      [300, 260], [720, 310], [1250, 240], [260, 830], [860, 850], [1390, 760],
    ].forEach(([x, y], index) =>
      this.add.image(x, y, `tree_${treeIds[index % treeIds.length]}`)
        .setDisplaySize(230, 230).setOrigin(0.5, 0.82).setDepth(y).setName("forest-prop"),
    );
    this.forestPropsCreated = true;
  }

  /** HUD panels float over Phaser; this keeps the original stable backdrop filling the viewport. */
  private fillViewportBackground(): void {
    if (!this.background) return;
    const view = this.cameras.main.worldView;
    this.background
      .setPosition(view.centerX, view.centerY)
      .setDisplaySize(view.width + 8, view.height + 8);
  }

  private renderAnimatedVisuals(time: number): void {
    const heldDirection = this.activeDirection();
    if (this.ted && this.player) {
      const state =
        this.player.state === "DEAD"
          ? "DEAD"
          : this.player.state === "ATTACK"
            ? "ATTACK"
            : heldDirection || time < this.playerWalkUntil
              ? "WALK"
              : "IDLE";
      this.applyVisual(
        this.ted,
        this.player.x,
        this.player.y,
        tedFrame(state, heldDirection ?? this.player.direction, time),
      );
      const effects = this.player.statusEffectEndsAt;
      if ((effects.guro_spin ?? 0) > Date.now()) {
        this.ted.sprite.setAngle((time * 0.7) % 360).setTint(0xffc46b);
      } else {
        this.ted.sprite.setAngle(0);
        if ((effects.sube_evasion ?? 0) > Date.now())
          this.ted.sprite.setTint(time % 360 < 180 ? 0xc6f7ff : 0x81d8ff);
        else if ((effects.guro_evasion ?? 0) > Date.now())
          this.ted.sprite.setTint(time % 300 < 150 ? 0xd4fbff : 0x90d8ff);
        else if ((effects.sube_defense ?? 0) > Date.now())
          this.ted.sprite.setTint(0x8ebcff);
        else if ((effects.baku_armor ?? 0) > Date.now())
          this.ted.sprite.setTint(0xc6ccdf);
        else this.ted.sprite.clearTint();
      }
      if ((effects.baku_tank ?? 0) > Date.now()) {
        if (this.textures.exists("baku_h2_6"))
          this.ted.sprite.setTexture("baku_h2_6").setDisplaySize(150, 150);
        else this.requestTexture("baku_h2_6");
      }
      else this.ted.sprite.setDisplaySize(112, 112);
    }
    this.enemies.forEach(({ visual, healthBar, snapshot }) => {
      visual.sprite.setAlpha(snapshot.state === "DEAD" ? 0.3 : 1);
      this.applyVisual(
        visual,
        snapshot.x,
        snapshot.y,
        snapshot.type === "enemy_wapol"
          ? wapolFrame(snapshot.state, snapshot.direction, time)
          : snapshot.type === "enemy_buffalo"
            ? buffaloFrame(snapshot.state, snapshot.direction, time)
            : alvidaFrame(snapshot.state, snapshot.direction, time),
      );
      this.drawEnemyHealth(
        healthBar,
        snapshot,
        visual.sprite.x,
        visual.sprite.y,
      );
    });
    if (this.oldDrunk && this.player)
      this.renderOldDrunk(
        this.oldDrunk.snapshot,
        this.player.x,
        this.player.y,
        time,
      );
  }

  private playFruitFx(
    fruit: "sube" | "guro" | "baku",
    skill: number,
    atX = this.ted?.sprite.x ?? 0,
    atY = (this.ted?.sprite.y ?? 0) - 55,
    duration = 700,
  ): void {
    if (!this.ted) return;
    const frames = fruit === "baku" && skill === 2 ? 6 : 5;
    const prefix = `${fruit}_h${skill}`;
    if (!this.textures.exists(`${prefix}_1`)) {
      for (let frame = 1; frame <= frames; frame++)
        this.requestTexture(`${prefix}_${frame}`);
      return;
    }
    this.fruitFxTimer?.remove();
    this.fruitFx?.destroy();
    const fx = this.add
      .image(this.ted.sprite.x, this.ted.sprite.y - 55, `${prefix}_1`)
      .setPosition(atX, atY)
      .setDisplaySize(fruit === "baku" && skill === 2 ? 190 : 160, fruit === "baku" && skill === 2 ? 190 : 160)
      .setDepth(this.ted.sprite.depth + 2)
      .setAlpha(0.9);
    this.fruitFx = fx;
    let frame = 1;
    const timer = this.time.addEvent({
      delay: 110,
      repeat: frames - 1,
      callback: () => {
        if (!fx.active) return;
        frame += 1;
        if (frame > frames) {
          fx.destroy();
          return;
        }
        fx.setTexture(`${prefix}_${frame}`);
      },
    });
    this.fruitFxTimer = timer;
    this.time.delayedCall(
      duration,
      () => {
        if (this.fruitFxTimer !== timer) return;
        timer.remove();
        if (this.fruitFx === fx) {
          fx.destroy();
          this.fruitFx = undefined;
          this.fruitFxTimer = undefined;
        }
      },
    );
  }

  /** Sube Defense uses only the silver-shield source frames, centered on Ted. */
  private playSubeDefenseFx(): void {
    if (!this.ted) return;
    if (!this.textures.exists("sube_defense_fx_1")) {
      for (let frame = 1; frame <= 5; frame++)
        this.requestTexture(`sube_defense_fx_${frame}`);
      return;
    }
    this.subeDefenseFx?.destroy();
    const fx = this.add
      .image(this.ted.sprite.x, this.ted.sprite.y - 56, "sube_defense_fx_1")
      .setDisplaySize(164, 164)
      .setDepth(this.ted.sprite.depth + 3);
    this.subeDefenseFx = fx;
    let frame = 1;
    const timer = this.time.addEvent({
      delay: 105,
      repeat: 4,
      callback: () => {
        if (!fx.active || !this.ted) return;
        frame += 1;
        fx.setPosition(this.ted.sprite.x, this.ted.sprite.y - 56);
        if (frame <= 5) fx.setTexture(`sube_defense_fx_${frame}`);
      },
    });
    this.time.delayedCall(630, () => {
      timer.remove();
      if (this.subeDefenseFx === fx) this.subeDefenseFx = undefined;
      fx.destroy();
    });
  }

  /** Sube Evasion uses only the dedicated word-and-wind source frames above Ted. */
  private playSubeEvasionFx(): void {
    if (!this.ted) return;
    if (!this.textures.exists("sube_evasion_fx_1")) {
      for (let frame = 1; frame <= 5; frame++)
        this.requestTexture(`sube_evasion_fx_${frame}`);
      return;
    }
    this.subeEvasionFx?.destroy();
    const fx = this.add
      .image(this.ted.sprite.x, this.ted.sprite.y - 126, "sube_evasion_fx_1")
      .setDisplaySize(196, 196)
      .setDepth(this.ted.sprite.depth + 4);
    this.subeEvasionFx = fx;
    let frame = 1;
    const timer = this.time.addEvent({
      delay: 115,
      repeat: 4,
      callback: () => {
        if (!fx.active || !this.ted) return;
        frame += 1;
        fx.setPosition(this.ted.sprite.x, this.ted.sprite.y - 126);
        if (frame <= 5) fx.setTexture(`sube_evasion_fx_${frame}`);
      },
    });
    this.time.delayedCall(690, () => {
      timer.remove();
      if (this.subeEvasionFx === fx) this.subeEvasionFx = undefined;
      fx.destroy();
    });
  }

  private rememberDirection(code: string): void {
    const direction =
      code === "KeyW" || code === "ArrowUp"
        ? "up"
        : code === "KeyS" || code === "ArrowDown"
          ? "down"
          : code === "KeyA" || code === "ArrowLeft"
            ? "left"
            : code === "KeyD" || code === "ArrowRight"
              ? "right"
              : undefined;
    if (direction) this.lastDirection = direction;
  }
  private activeDirection(): Direction | undefined {
    if (!this.cursors || !this.keys) return undefined;
    this.pressed.clear();
    if (this.cursors.up.isDown || this.keys.W.isDown) this.pressed.add("up");
    if (this.cursors.down.isDown || this.keys.S.isDown)
      this.pressed.add("down");
    if (this.cursors.left.isDown || this.keys.A.isDown)
      this.pressed.add("left");
    if (this.cursors.right.isDown || this.keys.D.isDown)
      this.pressed.add("right");
    if (!this.pressed.size) return undefined;
    return this.pressed.has(this.lastDirection)
      ? this.lastDirection
      : [...this.pressed][0];
  }
  /** Smooths authoritative 300 ms snapshots without changing their game positions or hitboxes. */
  private applyVisual(
    visual: Visual,
    x: number,
    y: number,
    frame: AnimationFrame,
  ): void {
    const distance = Phaser.Math.Distance.Between(
      visual.sprite.x,
      visual.sprite.y,
      x,
      y,
    );
    const snap = distance > 180;
    const renderedX = snap ? x : Phaser.Math.Linear(visual.sprite.x, x, 0.28);
    const renderedY = snap ? y : Phaser.Math.Linear(visual.sprite.y, y, 0.28);
    visual.sprite
      .setPosition(renderedX, renderedY)
      .setDepth(renderedY)
      .setFlipX(frame.flipX);
    if (visual.lastTexture !== frame.texture) {
      if (this.textures.exists(frame.texture)) {
        visual.sprite.setTexture(frame.texture);
        visual.lastTexture = frame.texture;
      } else this.requestTexture(frame.texture);
    }
  }

  private applySnapshot(snapshot: GameSnapshot): void {
    const previousEffects = this.player?.statusEffectEndsAt;
    if (
      this.player &&
      (this.player.x !== snapshot.player.x ||
        this.player.y !== snapshot.player.y)
    )
      this.playerWalkUntil = this.time.now + 420;
    this.player = snapshot.player;
    if (
      (snapshot.player.statusEffectEndsAt.sube_defense ?? 0) >
      (previousEffects?.sube_defense ?? 0)
    )
      this.playSubeDefenseFx();
    if (
      (snapshot.player.statusEffectEndsAt.sube_evasion ?? 0) >
      (previousEffects?.sube_evasion ?? 0)
    )
      this.playSubeEvasionFx();
    if (this.area !== snapshot.area) {
      this.area = snapshot.area;
      this.setBackgroundTexture(
          this.area === "pirate_ship"
            ? "ship_1"
            : this.area === "beach_buffalo"
              ? "beach_1"
              : this.area === "ice_mountain"
                ? "ice_1"
                : "ground",
        );
      this.background?.setTint(this.area === "forest_alvida" ? 0x9bc479 : 0xffffff);
      this.syncWorldBounds();
      this.healingCounter?.setVisible(this.area === "pirate_ship");
      void this.renderCollisionDebug();
    }
    if (this.area === "forest_alvida") this.ensureForestProps();
    else
      this.children.list
        .filter((child) => child.name === "forest-prop")
        .forEach((child) => (child as Phaser.GameObjects.Image).setVisible(false));
    const alive = new Set(snapshot.enemies.map((enemy) => enemy.id));
    this.enemies.forEach(({ visual, healthBar }, id) => {
      if (!alive.has(id) || this.area === "pirate_ship") {
        visual.sprite.destroy();
        healthBar.destroy();
        this.enemies.delete(id);
      }
    });
    snapshot.enemies.forEach((enemy) => this.cacheEnemy(enemy));
    snapshot.combatFeedback.forEach((entry) => this.showCombatFeedback(entry));
    const npc = snapshot.npcs[0];
    if (npc && this.area === "pirate_ship") this.cacheOldDrunk(npc);
    else if (this.oldDrunk) {
      this.oldDrunk.visual.sprite.destroy();
      this.oldDrunk.visual.label?.destroy();
      this.oldDrunk = undefined;
    }
  }

  /** Keeps the original stable map bounds aligned with the camera. */
  private syncWorldBounds(): void {
    const { width, height } = worldSizes[this.area];
    this.background
      ?.setPosition(width / 2, height / 2)
      .setSize(width, height)
      .setDisplaySize(width, height);
    this.cameras.main.setBounds(0, 0, width, height);
  }

  private cacheEnemy(enemy: EnemySnapshot): void {
    if (this.area === "pirate_ship") return;
    const existing = this.enemies.get(enemy.id);
    if (existing) {
      existing.snapshot = enemy;
      return;
    }
    const buffalo = enemy.type === "enemy_buffalo",
      wapol = enemy.type === "enemy_wapol";
    const texture = wapol
      ? "wapol_idle_down_1"
      : buffalo
        ? "buffalo_idle_down_1"
        : "alvida_Idle_Frente_1";
    if (!this.textures.exists(texture)) {
      this.requestTexture(texture);
      return;
    }
    const sprite = this.add
      .image(
        enemy.x,
        enemy.y,
        texture,
      )
      .setDisplaySize(
        wapol ? 190 : buffalo ? 165 : 118,
        wapol ? 190 : buffalo ? 165 : 118,
      )
      .setOrigin(0.5, 1);
    const healthBar = this.add.graphics().setDepth(enemy.y + 4);
    this.enemies.set(enemy.id, {
      visual: { sprite, lastTexture: "" },
      healthBar,
      snapshot: enemy,
    });
  }
  private drawEnemyHealth(
    bar: Phaser.GameObjects.Graphics,
    enemy: EnemySnapshot,
    renderedX = enemy.x,
    renderedY = enemy.y,
  ): void {
    const width = enemy.type === "enemy_buffalo" ? 92 : 72;
    const x = renderedX - width / 2;
    const y = renderedY - (enemy.type === "enemy_buffalo" ? 156 : 116);
    bar.clear();
    if (enemy.state === "DEAD") return;
    bar
      .fillStyle(0x091015, 0.95)
      .fillRoundedRect(x - 2, y - 2, width + 4, 10, 3);
    bar.fillStyle(0x421f25, 1).fillRect(x, y, width, 6);
    bar
      .fillStyle(0x49b86a, 1)
      .fillRect(x, y, width * Math.max(0, enemy.hp / enemy.maxHp), 6);
    bar.setDepth(renderedY + 5);
  }
  private playCannonShot(entry: CombatFeedbackSnapshot): void {
    if (!this.ted || entry.endX === undefined || entry.endY === undefined) return;
    if (!this.textures.exists("baku_h2_tiro1")) {
      for (let frame = 1; frame <= 3; frame++)
        this.requestTexture(`baku_h2_tiro${frame}`);
      return;
    }
    const shot = this.add
      .image(entry.x, entry.y, "baku_h2_tiro1")
      .setDisplaySize(110, 110)
      .setDepth(2995);
    let frame = 1;
    const timer = this.time.addEvent({
      delay: 140,
      repeat: 2,
      callback: () => shot.active && shot.setTexture(`baku_h2_tiro${Math.min(++frame, 3)}`),
    });
    this.tweens.add({
      targets: shot,
      x: entry.endX,
      y: entry.endY,
      duration: 580,
      ease: "Linear",
      onComplete: () => {
        timer.remove();
        shot.destroy();
        const blast = this.add.circle(entry.endX!, entry.endY!, 18, 0xffb04c, 0.9).setDepth(2996);
        this.tweens.add({
          targets: blast,
          scale: 4,
          alpha: 0,
          duration: 360,
          onComplete: () => blast.destroy(),
        });
      },
    });
  }
  private showCombatFeedback(entry: CombatFeedbackSnapshot): void {
    if (this.displayedFeedback.has(entry.id)) return;
    this.displayedFeedback.add(entry.id);
    if (this.displayedFeedback.size > 120) this.displayedFeedback.clear();
    if (entry.text === "TIRO DE CANHÃO") this.playCannonShot(entry);
    if (entry.kind === "status" && entry.target === "player") {
      if (entry.text.includes("BOLHAS")) this.playFruitFx("sube", 1);
      else if (entry.text === "HÉLICES") this.playFruitFx("guro", 1, undefined, undefined, 5_000);
      else if (entry.text.includes("EVASÃO +15")) this.playFruitFx("guro", 3, undefined, undefined, 10_000);
      else if (entry.text.includes("TANK MODE")) this.playFruitFx("baku", 2, undefined, undefined, 900);
      else if (entry.text.includes("MORDIDA")) this.playFruitFx("baku", 1);
      else if (entry.text.includes("+40")) this.playFruitFx("baku", 3, undefined, undefined, 5_000);
    } else if (entry.kind === "status" && entry.text.includes("KNOCK UP")) {
      this.playFruitFx("guro", 2, entry.x, entry.y, 700);
    }
    const critical = entry.kind === "critical";
    const color = critical
      ? "#ffe16b"
      : entry.kind === "dodge"
        ? "#75e8ff"
        : entry.kind === "status"
          ? "#a9f1b7"
          : entry.target === "player"
            ? "#ff746c"
            : "#ffd39a";
    const label = this.add
      .text(entry.x, entry.y, entry.text, {
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: critical
          ? "34px"
          : entry.target === "player"
            ? "28px"
            : "26px",
        fontStyle: "bold",
        color,
        stroke: "#071116",
        strokeThickness: critical ? 7 : 6,
        shadow: {
          offsetX: 0,
          offsetY: 3,
          color: "#000000",
          blur: 2,
          fill: true,
        },
      })
      .setOrigin(0.5)
      .setDepth(3000)
      .setScale(0.55);
    this.tweens.add({
      targets: label,
      y: entry.y - (critical ? 62 : 52),
      alpha: 0,
      scale: critical ? 1.42 : 1.2,
      duration: critical ? 980 : 850,
      ease: "Back.Out",
      onComplete: () => label.destroy(),
    });
  }
  private cacheOldDrunk(npc: NpcSnapshot): void {
    if (this.oldDrunk) {
      this.oldDrunk.snapshot = npc;
      return;
    }
    const sprite = this.add
      .image(npc.x, npc.y, "old_drunk_seated_idle_1")
      .setDisplaySize(180, 180)
      .setOrigin(0.5, 1)
      .setInteractive({ useHandCursor: true });
    sprite.on("pointerdown", () =>
      window.dispatchEvent(
        new CustomEvent("game-intent", {
          detail: { type: "interactWithNpc", npcId: npc.id },
        }),
      ),
    );
    const label = this.add.text(0, 0, "", {
      fontSize: "13px",
      color: "#ffe998",
      backgroundColor: "#14241bd9",
      padding: { x: 5, y: 3 },
    });
    this.oldDrunk = {
      visual: { sprite, label, lastTexture: "" },
      snapshot: npc,
    };
  }
  private renderOldDrunk(
    npc: NpcSnapshot,
    playerX: number,
    playerY: number,
    time: number,
  ): void {
    if (!this.oldDrunk) return;
    const visual = this.oldDrunk.visual;
    const near =
      Math.hypot(playerX - npc.x, playerY - npc.y) <= npc.interactionRange;
    this.applyVisual(visual, npc.x, npc.y, oldDrunkFrame(npc.state, time));
    visual.label
      ?.setPosition(npc.x - 76, npc.y - 190)
      .setDepth(npc.y + 1)
      .setText(
        near
          ? "Velho Bêbado\nCura · clique para recuperar a vida"
          : "Velho Bêbado\nChegue mais perto",
      );
    visual.sprite.input!.cursor = near ? "pointer" : "not-allowed";
  }
  /** Development-only visualizer. The server remains the movement authority. Set localStorage.SHOW_COLLISIONS='true'. */
  private async renderCollisionDebug(): Promise<void> {
    this.collisionDebug?.destroy();
    if (
      window.location.hostname !== "localhost" ||
      window.localStorage.getItem("SHOW_COLLISIONS") !== "true"
    )
      return;
    const file =
      this.area === "pirate_ship"
        ? "pirate_ship"
        : this.area === "beach_buffalo"
          ? "beach_buffalo"
          : "forest_alvida";
    type DebugMap = {
      layers: {
        name: string;
        objects?: {
          x: number;
          y: number;
          width?: number;
          height?: number;
          ellipse?: boolean;
          polygon?: { x: number; y: number }[];
        }[];
      }[];
    };
    const map = await fetch(`/maps/data/${file}.json`)
      .then((response) => response.json() as Promise<DebugMap>)
      .catch(() => undefined);
    const requestedArea =
      file === "pirate_ship"
        ? "pirate_ship"
        : file === "beach_buffalo"
          ? "beach_buffalo"
          : "forest_alvida";
    if (!map || this.area !== requestedArea) return;
    const debug = this.add.graphics().setDepth(9_000);
    for (const layer of map.layers)
      for (const object of layer.objects ?? []) {
        const color =
          layer.name === "WATER"
            ? 0x3ca9ff
            : layer.name.includes("SPAWN")
              ? 0xffdc61
              : 0xff4c5e;
        debug.lineStyle(2, color, 0.85);
        if (object.polygon)
          debug.strokePoints(
            object.polygon.map(
              (point) =>
                new Phaser.Geom.Point(object.x + point.x, object.y + point.y),
            ),
            true,
          );
        else if (object.ellipse)
          debug.strokeEllipse(
            object.x,
            object.y,
            object.width ?? 0,
            object.height ?? 0,
          );
        else
          debug.strokeRect(
            object.x,
            object.y,
            object.width ?? 8,
            object.height ?? 8,
          );
      }
    this.collisionDebug = debug;
  }
}
function vector(direction: Direction): { x: number; y: number } {
  return direction === "left"
    ? { x: -1, y: 0 }
    : direction === "right"
      ? { x: 1, y: 0 }
      : direction === "up"
        ? { x: 0, y: -1 }
        : { x: 0, y: 1 };
}
