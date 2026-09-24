import test from "node:test";
import assert from "node:assert/strict";
import { GameSession } from "../src/GameSession.js";

const killWithBasicAttacks = (session: GameSession): { id: string; berries: number; deathAt: number } => {
  session.handle({ type: "enterHunt", huntId: "hunt_alvida_forest" }, 0);
  const enemy = session.enemies[0]!;
  session.player.x = enemy.snapshot.x;
  session.player.y = enemy.snapshot.y;
  let now = 1_000;
  while (enemy.snapshot.state !== "DEAD") {
    session.handle({ type: "attack" }, now);
    now += 1_000;
  }
  return { id: enemy.snapshot.id, berries: session.player.wallet.berries, deathAt: now - 1_000 };
};

test("Alvida death remains visible briefly, then restores the configured ten-enemy population", () => {
  const session = new GameSession("alvida-life");
  const dead = killWithBasicAttacks(session);
  assert.equal(session.enemies.length, 10);
  assert.equal(session.enemies.find((enemy) => enemy.snapshot.id === dead.id)?.snapshot.state, "DEAD");
  session.tick(dead.deathAt + 500);
  assert.equal(session.enemies.length, 9);
  session.tick(dead.deathAt + 3_000);
  assert.equal(session.enemies.length, 10);
  assert.equal(session.enemies.some((enemy) => enemy.snapshot.id === dead.id), false);
  assert.equal(session.player.wallet.berries, dead.berries);
});

test("Buffalo respawn is capped at ten and dead enemies cannot reward twice", () => {
  const session = new GameSession("buffalo-life");
  session.handle({ type: "enterHunt", huntId: "hunt_buffalo_beach" }, 0);
  const enemy = session.enemies[0]!;
  session.player.x = enemy.snapshot.x;
  session.player.y = enemy.snapshot.y;
  session.player.gainFruit("fruit_guro_guro");
  session.player.equipFruit("fruit_guro_guro");
  session.player.stats.strength = 999;
  session.handle({ type: "useSkill", skillId: "guro_spin" }, 1_000);
  assert.equal(enemy.snapshot.state, "DEAD");
  const berries = session.player.wallet.berries;
  session.handle({ type: "attack" }, 52_000);
  session.tick(51_500);
  assert.equal(session.player.wallet.berries, berries);
  session.tick(54_000);
  assert.equal(session.enemies.length, 10);
  assert.equal(session.enemies.some((entry) => entry.snapshot.id === enemy.snapshot.id), false);
});

test("concurrent deaths never overspawn while their independent respawns are pending", () => {
  const session = new GameSession("population-cap");
  session.handle({ type: "enterHunt", huntId: "hunt_alvida_forest" }, 0);
  const schedule = (session as unknown as { scheduleEnemyRespawn: (enemy: (typeof session.enemies)[number], now: number) => void }).scheduleEnemyRespawn.bind(session);
  for (const enemy of session.enemies.slice(0, 4)) {
    session.player.x = enemy.snapshot.x;
    session.player.y = enemy.snapshot.y;
    enemy.damage(99_999);
    schedule(enemy, 1_000);
  }
  assert.equal(session.enemies.length, 10);
  session.tick(1_500);
  assert.equal(session.enemies.length, 6);
  session.tick(4_000);
  assert.equal(session.enemies.length, 10);
  assert.equal(new Set(session.enemies.map((enemy) => enemy.snapshot.id)).size, 10);
});
