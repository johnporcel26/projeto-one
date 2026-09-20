import Phaser from "phaser";
import { Asset } from "../assets/AssetManifest";

type Preview = { key: string; title: string; count: number; fps: number; x: number; y: number };
const previews: Preview[] = [
  { key: "idle-down", title: "IDLE DOWN", count: 4, fps: 5, x: 150, y: 190 }, { key: "idle-up", title: "IDLE UP", count: 4, fps: 5, x: 390, y: 190 }, { key: "idle-side", title: "IDLE SIDE", count: 4, fps: 5, x: 630, y: 190 },
  { key: "walk-down", title: "WALK DOWN", count: 5, fps: 8, x: 150, y: 410 }, { key: "walk-up", title: "WALK UP", count: 5, fps: 8, x: 390, y: 410 }, { key: "walk-side", title: "WALK SIDE", count: 5, fps: 8, x: 630, y: 410 },
  { key: "attack-down", title: "ATTACK DOWN", count: 6, fps: 8, x: 830, y: 190 }, { key: "special-spin", title: "SPECIAL SPIN", count: 8, fps: 12, x: 830, y: 410 }
];

export class BuffaloPreviewScene extends Phaser.Scene {
  private fpsMultiplier = 1;
  private frames = new Map<string, number>();
  private images = new Map<string, Phaser.GameObjects.Image>();
  private caption?: Phaser.GameObjects.Text;
  constructor() { super("buffalo-preview"); }
  preload(): void {
    for (const preview of previews) for (let frame = 1; frame <= preview.count; frame++) {
      const source = preview.key.startsWith("attack") ? Asset.buffaloAttackDown(frame) : preview.key === "special-spin" ? Asset.buffaloSpecialSpin(frame) : Asset.buffalo(preview.key.startsWith("idle") ? "idle" : "walk", preview.key.endsWith("down") ? "down" : preview.key.endsWith("up") ? "up" : "side", frame);
      this.load.image(`buffalo-${preview.key}-${frame}`, source);
    }
  }
  create(): void {
    this.add.rectangle(0, 0, 960, 640, 0x102820).setOrigin(0);
    this.add.text(22, 16, "BUFFALO — Animation Preview", { fontFamily: "monospace", fontSize: "18px", color: "#ffe47a" });
    this.caption = this.add.text(22, 44, "FPS multiplier: 1.0x  |  use + / - to adjust", { fontFamily: "monospace", fontSize: "12px", color: "#d8eee4" });
    for (const preview of previews) {
      this.add.text(preview.x - 75, preview.y - 92, preview.title, { fontFamily: "monospace", fontSize: "11px", color: "#d8eee4" });
      const image = this.add.image(preview.x, preview.y + 72, `buffalo-${preview.key}-1`).setOrigin(0.5, 1).setScale(0.13);
      this.images.set(preview.key, image); this.frames.set(preview.key, 1);
    }
    this.input.keyboard?.on("keydown-PLUS", () => this.setMultiplier(this.fpsMultiplier + 0.25));
    this.input.keyboard?.on("keydown-MINUS", () => this.setMultiplier(this.fpsMultiplier - 0.25));
  }
  update(_: number, delta: number): void {
    for (const preview of previews) {
      const interval = 1000 / (preview.fps * this.fpsMultiplier);
      const accumulator = (this.frames.get(`${preview.key}-time`) ?? 0) + delta;
      if (accumulator < interval) { this.frames.set(`${preview.key}-time`, accumulator); continue; }
      this.frames.set(`${preview.key}-time`, accumulator - interval);
      const next = (this.frames.get(preview.key) ?? 1) % preview.count + 1;
      this.frames.set(preview.key, next); this.images.get(preview.key)?.setTexture(`buffalo-${preview.key}-${next}`);
    }
  }
  private setMultiplier(value: number): void { this.fpsMultiplier = Phaser.Math.Clamp(value, 0.25, 3); this.caption?.setText(`FPS multiplier: ${this.fpsMultiplier.toFixed(2)}x  |  use + / - to adjust`); }
}
