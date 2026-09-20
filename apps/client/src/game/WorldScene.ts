import Phaser from "phaser";
import type { CombatFeedbackSnapshot, Direction, EnemySnapshot, GameSnapshot, NpcSnapshot, PlayerSnapshot } from "@onepiece/shared";
import { Asset } from "../assets/AssetManifest";
import { bridge } from "./GameBridge";
import { alvidaFrame, buffaloFrame, oldDrunkFrame, tedFrame, type AnimationFrame } from "./DirectionalAnimation";

const treeIds = ["d4b57d88-a0bb-4355-bfe0-567a4ff6356b", "d1880c40-fc8a-46e5-b9f4-50b4ccb1cf06", "2e588455-f05a-4012-be2f-7712a710d827", "25032c55-d8c5-4fb8-9ebf-218d4577867a"];
type Visual = { sprite: Phaser.GameObjects.Image; label?: Phaser.GameObjects.Text; lastTexture: string };

export class WorldScene extends Phaser.Scene {
  private ted?: Visual;
  private player?: PlayerSnapshot;
  private enemies = new Map<string, { visual: Visual; healthBar: Phaser.GameObjects.Graphics; snapshot: EnemySnapshot }>();
  private oldDrunk?: { visual: Visual; snapshot: NpcSnapshot };
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private pressed = new Set<Direction>();
  private lastDirection: Direction = "down";
  private lastMove = 0;
  private playerWalkUntil = 0;
  private background?: Phaser.GameObjects.TileSprite;
  private healingCounter?: Phaser.GameObjects.Image;
  private subeFx?: Phaser.GameObjects.Image;
  private subeFxTimer?: Phaser.Time.TimerEvent;
  private collisionDebug?: Phaser.GameObjects.Graphics;
  private readonly displayedFeedback = new Set<string>();
  private area: GameSnapshot["area"] = "forest_alvida";

  constructor() { super("world"); }

  preload(): void {
    this.load.image("ground", Asset.forestGround);
    this.load.image("healing_counter", Asset.healingCounter);
    for (let frame = 1; frame <= 5; frame++) this.load.image(`sube_bubbles_${frame}`, Asset.bubbles(frame));
    for (let frame = 1; frame <= 3; frame++) this.load.image(`guro_explosion_${frame}`, Asset.guroExplosion(frame));
    for (let frame = 1; frame <= 2; frame++) this.load.image(`sube_shield_${frame}`, Asset.shield(frame));
    for (const state of ["idle", "drink", "sway", "interact", "heal"] as const) {
      const count = state === "drink" ? 6 : state === "heal" ? 5 : 4;
      for (let frame = 1; frame <= count; frame++) this.load.image(`old_drunk_seated_${state}_${frame}`, Asset.oldDrunkSeated(state, frame));
    }
    Asset.shipFrames.forEach((path, index) => this.load.image(`ship_${index + 1}`, path));
    Asset.beachFrames.forEach((path, index) => this.load.image(`beach_${index + 1}`, path));
    treeIds.forEach((id) => this.load.image(`tree_${id}`, Asset.tree(id)));
    for (const state of ["idle", "walk", "attack", "death"] as const) for (let frame = 1; frame <= 6; frame++) this.load.image(`ted_${state}_${frame}`, Asset.ted(state, frame));
    for (const direction of ["Costa", "Lado"] as const) for (let frame = 1; frame <= 5; frame++) this.load.image(`ted_idle_${direction}_${frame}`, Asset.tedIdleDirectional(direction, frame));
    for (const state of ["Idle", "Walking"] as const) for (const direction of ["Frente", "Costa", "Lado"] as const) for (let frame = 1; frame <= 4; frame++) this.load.image(`alvida_${state}_${direction}_${frame}`, Asset.alvida(state, direction, frame));
    for (let frame = 1; frame <= 3; frame++) this.load.image(`alvida_Attack_${frame}`, Asset.alvidaAttack(frame));
    for (const animation of ["idle", "walk"] as const) for (const direction of ["down", "up", "side"] as const) for (let frame = 1; frame <= (animation === "idle" ? 4 : 5); frame++) this.load.image(`buffalo_${animation}_${direction}_${frame}`, Asset.buffalo(animation, direction, frame));
    for (let frame = 1; frame <= 6; frame++) this.load.image(`buffalo_attack_${frame}`, Asset.buffaloAttackDown(frame));
  }

  create(): void {
    this.background = this.add.tileSprite(800, 550, 1600, 1100, "ground").setDisplaySize(1600, 1100).setTint(0x9bc479);
    [[300, 260], [720, 310], [1250, 240], [260, 830], [860, 850], [1390, 760]].forEach(([x, y], index) => this.add.image(x, y, `tree_${treeIds[index % treeIds.length]}`).setDisplaySize(230, 230).setOrigin(.5, .82).setDepth(y).setName("forest-prop"));
    this.healingCounter = this.add.image(800, 470, "healing_counter").setDisplaySize(440, 440).setOrigin(.5, 1).setDepth(470).setVisible(false).setName("ship-prop");
    const sprite = this.add.image(620, 600, "ted_idle_1").setDisplaySize(112, 112).setOrigin(.5, 1);
    this.ted = { sprite, lastTexture: "" };
    this.cameras.main.setBounds(0, 0, 1600, 1100);
    this.cameras.main.startFollow(sprite, true, .12, .12);
    this.cameras.main.setZoom(1.15);
    this.scale.on("resize", () => this.fillViewportBackground());
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.keys = this.input.keyboard?.addKeys("W,A,S,D,SPACE") as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => this.rememberDirection(event.code));
    bridge.onSnapshot = (snapshot) => this.applySnapshot(snapshot);
    window.addEventListener("sube-fx", ((event: Event) => this.playSubeFx((event as CustomEvent<string>).detail)) as EventListener);
    void this.renderCollisionDebug();
  }

  update(time: number): void {
    this.fillViewportBackground();
    this.background?.setTexture(this.area === "pirate_ship" ? `ship_${Math.floor(time / 150) % 4 + 1}` : this.area === "beach_buffalo" ? `beach_${Math.floor(time / 180) % 4 + 1}` : "ground");
    this.renderAnimatedVisuals(time);
    if (!this.cursors || !this.keys || (document.activeElement as HTMLElement | null)?.matches("input, textarea, select")) return;
    const active = this.activeDirection();
    if (time - this.lastMove >= 80) { window.dispatchEvent(new CustomEvent("game-intent", { detail: active ? { type: "move", ...vector(active) } : { type: "move", x: 0, y: 0 } })); this.lastMove = time; }
    if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) window.dispatchEvent(new CustomEvent("game-intent", { detail: { type: "attack" } }));
  }

  /** HUD panels float over Phaser; this ensures the playable backdrop fills the browser viewport. */
  private fillViewportBackground(): void {
    if (!this.background) return;
    const view = this.cameras.main.worldView;
    this.background.setPosition(view.centerX, view.centerY).setDisplaySize(view.width + 8, view.height + 8);
  }

  private renderAnimatedVisuals(time: number): void {
    const heldDirection = this.activeDirection();
    if (this.ted && this.player) { const state = this.player.state === "DEAD" ? "DEAD" : this.player.state === "ATTACK" ? "ATTACK" : heldDirection || time < this.playerWalkUntil ? "WALK" : "IDLE"; this.applyVisual(this.ted, this.player.x, this.player.y, tedFrame(state, heldDirection ?? this.player.direction, time)); const effects = this.player.statusEffectEndsAt; if ((effects.guro_spin ?? 0) > Date.now()) { this.ted.sprite.setAngle((time * .7) % 360).setTint(0xffc46b); } else { this.ted.sprite.setAngle(0); if ((effects.sube_evasion ?? 0) > Date.now()) this.ted.sprite.setTint(time % 360 < 180 ? 0xc6f7ff : 0x81d8ff); else if ((effects.sube_defense ?? 0) > Date.now()) this.ted.sprite.setTint(0x8ebcff); else this.ted.sprite.clearTint(); } }
    this.enemies.forEach(({ visual, healthBar, snapshot }) => { visual.sprite.setAlpha(snapshot.state === "DEAD" ? .3 : 1); this.applyVisual(visual, snapshot.x, snapshot.y, snapshot.type === "enemy_buffalo" ? buffaloFrame(snapshot.state, snapshot.direction, time) : alvidaFrame(snapshot.state, snapshot.direction, time)); this.drawEnemyHealth(healthBar, snapshot, visual.sprite.x, visual.sprite.y); });
    if (this.oldDrunk && this.player) this.renderOldDrunk(this.oldDrunk.snapshot, this.player.x, this.player.y, time);
  }

  private playSubeFx(skillId: string): void { if (!this.ted) return; const frames = skillId === "sube_bubbles" ? 5 : 2; const prefix = skillId === "sube_bubbles" ? "sube_bubbles" : "sube_shield"; this.subeFxTimer?.remove(); this.subeFx?.destroy(); const fx = this.add.image(this.ted.sprite.x, this.ted.sprite.y - 55, `${prefix}_1`).setDisplaySize(140, 140).setDepth(this.ted.sprite.depth + 2).setAlpha(.9); this.subeFx = fx; let frame = 1; const timer = this.time.addEvent({ delay: 110, repeat: frames - 1, callback: () => { if (!fx.active) return; frame += 1; if (frame > frames) { fx.destroy(); return; } fx.setPosition(this.ted?.sprite.x ?? fx.x, (this.ted?.sprite.y ?? fx.y) - 55).setTexture(`${prefix}_${frame}`); } }); this.subeFxTimer = timer; this.time.delayedCall(skillId === "sube_defense" ? 5000 : skillId === "sube_evasion" ? 4000 : 700, () => { if (this.subeFxTimer !== timer) return; timer.remove(); if (this.subeFx === fx) { fx.destroy(); this.subeFx = undefined; this.subeFxTimer = undefined; } }); }

  private rememberDirection(code: string): void { const direction = code === "KeyW" || code === "ArrowUp" ? "up" : code === "KeyS" || code === "ArrowDown" ? "down" : code === "KeyA" || code === "ArrowLeft" ? "left" : code === "KeyD" || code === "ArrowRight" ? "right" : undefined; if (direction) this.lastDirection = direction; }
  private activeDirection(): Direction | undefined { if (!this.cursors || !this.keys) return undefined; this.pressed.clear(); if (this.cursors.up.isDown || this.keys.W.isDown) this.pressed.add("up"); if (this.cursors.down.isDown || this.keys.S.isDown) this.pressed.add("down"); if (this.cursors.left.isDown || this.keys.A.isDown) this.pressed.add("left"); if (this.cursors.right.isDown || this.keys.D.isDown) this.pressed.add("right"); if (!this.pressed.size) return undefined; return this.pressed.has(this.lastDirection) ? this.lastDirection : [...this.pressed][0]; }
  /** Smooths authoritative 300 ms snapshots without changing their game positions or hitboxes. */
  private applyVisual(visual: Visual, x: number, y: number, frame: AnimationFrame): void { const distance = Phaser.Math.Distance.Between(visual.sprite.x, visual.sprite.y, x, y); const snap = distance > 180; const renderedX = snap ? x : Phaser.Math.Linear(visual.sprite.x, x, .28); const renderedY = snap ? y : Phaser.Math.Linear(visual.sprite.y, y, .28); visual.sprite.setPosition(renderedX, renderedY).setDepth(renderedY).setFlipX(frame.flipX); if (visual.lastTexture !== frame.texture) { visual.sprite.setTexture(frame.texture); visual.lastTexture = frame.texture; } }

  private applySnapshot(snapshot: GameSnapshot): void {
    if (this.player && (this.player.x !== snapshot.player.x || this.player.y !== snapshot.player.y)) this.playerWalkUntil = this.time.now + 420;
    this.player = snapshot.player;
    if (this.area !== snapshot.area) { this.area = snapshot.area; this.background?.setTexture(this.area === "pirate_ship" ? "ship_1" : this.area === "beach_buffalo" ? "beach_1" : "ground").setTint(this.area === "forest_alvida" ? 0x9bc479 : 0xffffff); this.children.list.filter((child) => child.name === "forest-prop").forEach((child) => (child as Phaser.GameObjects.Image).setVisible(this.area === "forest_alvida")); this.healingCounter?.setVisible(this.area === "pirate_ship"); void this.renderCollisionDebug(); }
    const alive = new Set(snapshot.enemies.map((enemy) => enemy.id));
    this.enemies.forEach(({ visual, healthBar }, id) => { if (!alive.has(id) || this.area === "pirate_ship") { visual.sprite.destroy(); healthBar.destroy(); this.enemies.delete(id); } });
    snapshot.enemies.forEach((enemy) => this.cacheEnemy(enemy));
    snapshot.combatFeedback.forEach((entry) => this.showCombatFeedback(entry));
    const npc = snapshot.npcs[0];
    if (npc && this.area === "pirate_ship") this.cacheOldDrunk(npc); else if (this.oldDrunk) { this.oldDrunk.visual.sprite.destroy(); this.oldDrunk.visual.label?.destroy(); this.oldDrunk = undefined; }
  }

  private cacheEnemy(enemy: EnemySnapshot): void { if (this.area === "pirate_ship") return; const existing = this.enemies.get(enemy.id); if (existing) { existing.snapshot = enemy; return; } const buffalo = enemy.type === "enemy_buffalo"; const sprite = this.add.image(enemy.x, enemy.y, buffalo ? "buffalo_idle_down_1" : "alvida_Idle_Frente_1").setDisplaySize(buffalo ? 165 : 118, buffalo ? 165 : 118).setOrigin(.5, 1); const healthBar = this.add.graphics().setDepth(enemy.y + 4); this.enemies.set(enemy.id, { visual: { sprite, lastTexture: "" }, healthBar, snapshot: enemy }); }
  private drawEnemyHealth(bar: Phaser.GameObjects.Graphics, enemy: EnemySnapshot, renderedX = enemy.x, renderedY = enemy.y): void { const width = enemy.type === "enemy_buffalo" ? 92 : 72; const x = renderedX - width / 2; const y = renderedY - (enemy.type === "enemy_buffalo" ? 156 : 116); bar.clear(); if (enemy.state === "DEAD") return; bar.fillStyle(0x091015, .95).fillRoundedRect(x - 2, y - 2, width + 4, 10, 3); bar.fillStyle(0x421f25, 1).fillRect(x, y, width, 6); bar.fillStyle(0x49b86a, 1).fillRect(x, y, width * Math.max(0, enemy.hp / enemy.maxHp), 6); bar.setDepth(renderedY + 5); }
  private playGuroExplosion(x: number, y: number): void { const fx = this.add.image(x, y, "guro_explosion_1").setDisplaySize(190, 190).setOrigin(.5).setDepth(2990); let frame = 1; this.time.addEvent({ delay: 120, repeat: 2, callback: () => { frame += 1; if (frame <= 3) fx.setTexture(`guro_explosion_${frame}`); } }); this.tweens.add({ targets: fx, alpha: 0, scale: 1.35, duration: 480, onComplete: () => fx.destroy() }); }
  private showCombatFeedback(entry: CombatFeedbackSnapshot): void { if (this.displayedFeedback.has(entry.id)) return; this.displayedFeedback.add(entry.id); if (this.displayedFeedback.size > 120) this.displayedFeedback.clear(); if (entry.text.includes("EXPLOSÃO")) this.playGuroExplosion(entry.x, entry.y); if (entry.kind === "status" && entry.target === "player") { const skill = entry.text.includes("BOLHAS") ? "sube_bubbles" : entry.text.includes("DEFESA") ? "sube_defense" : entry.text.includes("EVASÃO") ? "sube_evasion" : undefined; if (skill) this.playSubeFx(skill); } const critical = entry.kind === "critical"; const color = critical ? "#ffe16b" : entry.kind === "dodge" ? "#75e8ff" : entry.kind === "status" ? "#a9f1b7" : entry.target === "player" ? "#ff746c" : "#ffd39a"; const label = this.add.text(entry.x, entry.y, entry.text, { fontFamily: "Trebuchet MS", fontSize: critical ? "34px" : entry.target === "player" ? "28px" : "26px", fontStyle: "bold", color, stroke: "#071116", strokeThickness: critical ? 7 : 6, shadow: { offsetX: 0, offsetY: 3, color: "#000000", blur: 2, fill: true } }).setOrigin(.5).setDepth(3000).setScale(.55); this.tweens.add({ targets: label, y: entry.y - (critical ? 62 : 52), alpha: 0, scale: critical ? 1.42 : 1.2, duration: critical ? 980 : 850, ease: "Back.Out", onComplete: () => label.destroy() }); }
  private cacheOldDrunk(npc: NpcSnapshot): void { if (this.oldDrunk) { this.oldDrunk.snapshot = npc; return; } const sprite = this.add.image(npc.x, npc.y, "old_drunk_seated_idle_1").setDisplaySize(180, 180).setOrigin(.5, 1).setInteractive({ useHandCursor: true }); sprite.on("pointerdown", () => window.dispatchEvent(new CustomEvent("game-intent", { detail: { type: "interactWithNpc", npcId: npc.id } }))); const label = this.add.text(0, 0, "", { fontSize: "13px", color: "#ffe998", backgroundColor: "#14241bd9", padding: { x: 5, y: 3 } }); this.oldDrunk = { visual: { sprite, label, lastTexture: "" }, snapshot: npc }; }
  private renderOldDrunk(npc: NpcSnapshot, playerX: number, playerY: number, time: number): void { if (!this.oldDrunk) return; const visual = this.oldDrunk.visual; const near = Math.hypot(playerX - npc.x, playerY - npc.y) <= npc.interactionRange; this.applyVisual(visual, npc.x, npc.y, oldDrunkFrame(npc.state, time)); visual.label?.setPosition(npc.x - 76, npc.y - 190).setDepth(npc.y + 1).setText(near ? "Velho Bêbado\nCura · clique para recuperar a vida" : "Velho Bêbado\nChegue mais perto"); visual.sprite.input!.cursor = near ? "pointer" : "not-allowed"; }
  /** Development-only visualizer. The server remains the movement authority. Set localStorage.SHOW_COLLISIONS='true'. */
  private async renderCollisionDebug(): Promise<void> {
    this.collisionDebug?.destroy();
    if (window.location.hostname !== "localhost" || window.localStorage.getItem("SHOW_COLLISIONS") !== "true") return;
    const file = this.area === "pirate_ship" ? "pirate_ship" : this.area === "beach_buffalo" ? "beach_buffalo" : "forest_alvida";
    type DebugMap = { layers: { name: string; objects?: { x: number; y: number; width?: number; height?: number; ellipse?: boolean; polygon?: { x: number; y: number }[]; }[]; }[]; };
    const map = await fetch(`/maps/data/${file}.json`).then((response) => response.json() as Promise<DebugMap>).catch(() => undefined);
    const requestedArea = file === "pirate_ship" ? "pirate_ship" : file === "beach_buffalo" ? "beach_buffalo" : "forest_alvida";
    if (!map || this.area !== requestedArea) return;
    const debug = this.add.graphics().setDepth(9_000);
    for (const layer of map.layers) for (const object of layer.objects ?? []) {
      const color = layer.name === "WATER" ? 0x3ca9ff : layer.name.includes("SPAWN") ? 0xffdc61 : 0xff4c5e;
      debug.lineStyle(2, color, .85);
      if (object.polygon) debug.strokePoints(object.polygon.map((point) => new Phaser.Geom.Point(object.x + point.x, object.y + point.y)), true);
      else if (object.ellipse) debug.strokeEllipse(object.x, object.y, object.width ?? 0, object.height ?? 0);
      else debug.strokeRect(object.x, object.y, object.width ?? 8, object.height ?? 8);
    }
    this.collisionDebug = debug;
  }
}
function vector(direction: Direction): { x: number; y: number } { return direction === "left" ? { x: -1, y: 0 } : direction === "right" ? { x: 1, y: 0 } : direction === "up" ? { x: 0, y: -1 } : { x: 0, y: 1 }; }
