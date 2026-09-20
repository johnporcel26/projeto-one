import test from "node:test";
import assert from "node:assert/strict";
import { GameSession } from "../src/GameSession.js";

const killWithBasicAttacks = (session: GameSession): { id: string; gold: number; deathAt: number } => {
  session.handle({ type: "enterHunt", huntId: "hunt_alvida_forest" }, 0); const enemy = session.enemies[0]; session.player.x = enemy.snapshot.x; session.player.y = enemy.snapshot.y;
  let now = 1_000, deathAt = 0; while (enemy.snapshot.state !== "DEAD") { session.handle({ type: "attack" }, now); if (enemy.snapshot.state === "DEAD") deathAt = now; now += 1_000; }
  return { id: enemy.snapshot.id, berries: session.player.wallet.berries, deathAt };
};

test("Alvida death remains visible briefly, is removed, then respawns once as a new instance", () => {
  const session = new GameSession("alvida-life"); const dead = killWithBasicAttacks(session); assert.equal(session.enemies.length, 3); assert.equal(session.enemies.find((enemy) => enemy.snapshot.id === dead.id)?.snapshot.state, "DEAD"); assert.equal(session.analyzer.snapshot(dead.deathAt).totalKills, 1);
  session.tick(dead.deathAt + 499); assert.equal(session.enemies.length, 3); session.tick(dead.deathAt + 500); assert.equal(session.enemies.some((enemy) => enemy.snapshot.id === dead.id), false); assert.equal(session.enemies.length, 2);
  session.tick(dead.deathAt + 2_999); assert.equal(session.enemies.length, 2); session.tick(dead.deathAt + 3_000); assert.equal(session.enemies.length, 3); const replacement = session.enemies.find((enemy) => ![dead.id].includes(enemy.snapshot.id)); assert.ok(replacement); assert.equal(session.enemies.some((enemy) => enemy.snapshot.id === dead.id), false); assert.equal(session.player.wallet.berries, dead.berries); assert.equal(session.analyzer.snapshot(dead.deathAt + 3_000).totalKills, 1);
});

test("Buffalo uses the same lifecycle and dead enemies cannot reward or act twice", () => {
  const session = new GameSession("buffalo-life"); session.handle({ type: "enterHunt", huntId: "hunt_buffalo_beach" }, 0); const enemy = session.enemies[0]; session.player.x = enemy.snapshot.x; session.player.y = enemy.snapshot.y; session.player.gainFruit("fruit_guro_guro"); session.player.equipFruit("fruit_guro_guro");
  [1_000, 26_000, 51_000].forEach((now) => session.handle({ type: "useSkill", skillId: "guro_crush" }, now)); assert.equal(enemy.snapshot.state, "DEAD"); const berries = session.player.wallet.berries; const kills = session.analyzer.snapshot(51_000).totalKills;
  session.handle({ type: "attack" }, 52_000); session.tick(51_500); assert.equal(session.player.wallet.berries, berries); assert.equal(session.analyzer.snapshot(51_500).totalKills, kills); session.tick(54_000); assert.equal(session.enemies.some((entry) => entry.snapshot.id === enemy.snapshot.id), false); session.tick(54_001); assert.equal(session.enemies.length, 3);
});
