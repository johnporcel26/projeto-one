import test from "node:test";
import assert from "node:assert/strict";
import { GameSession } from "../src/GameSession.js";

const killTed = (session: GameSession, now = 2_000): void => {
  session.handle({ type: "enterHunt", huntId: "hunt_alvida_forest" }, 0);
  const enemy = session.enemies[0]; session.player.resources.currentHp = 1; session.player.stats.evasionChanceBps = 0; session.player.autoHunt = "SEARCHING"; session.player.x = enemy.snapshot.x; session.player.y = enemy.snapshot.y;
  session.tick(now);
};

test("death is emitted once, cancels auto-hunt/actions and does not loop for later ticks", () => {
  const session = new GameSession("death-once"); killTed(session); assert.equal(session.player.resources.currentHp, 0); assert.equal(session.player.state, "DEAD"); assert.equal(session.player.autoHunt, "OFF"); assert.equal(session.analyzer.snapshot(2_000).deaths, 1);
  for (let now = 2_100; now < 3_700; now += 10) session.tick(now);
  assert.equal(session.player.resources.currentHp, 0); assert.equal(session.player.state, "DEAD"); assert.equal(session.analyzer.snapshot(3_700).deaths, 1);
});

test("respawn is idempotent and restores a usable player at pirate ship", () => {
  const session = new GameSession("respawn"); killTed(session); session.handle({ type: "requestRespawn" }, 2_100); session.handle({ type: "requestRespawn" }, 2_101);
  assert.equal(session.area, "pirate_ship"); assert.equal(session.player.state, "IDLE"); assert.equal(session.player.resources.currentHp, session.player.stats.maxHp); assert.equal(session.player.resources.currentMana, session.player.stats.maxMana); assert.equal(session.player.autoHunt, "OFF");
  const x = session.player.x; session.handle({ type: "move", x: 1, y: 0 }, 2_200); assert.equal(session.player.x, x + 20); // deck movement is validated by the map data
  session.handle({ type: "enterHunt", huntId: "hunt_alvida_forest" }, 2_300); assert.equal(session.area, "forest_alvida"); assert.equal(session.player.state, "IDLE");
});

test("a second death cycle stays isolated and does not affect another session", () => {
  const first = new GameSession("first"), second = new GameSession("second"); killTed(first); const hpB = second.player.resources.currentHp; first.tick(4_000);
  assert.equal(first.area, "pirate_ship"); assert.equal(second.player.resources.currentHp, hpB); assert.notEqual(second.player.state, "DEAD");
  first.handle({ type: "enterHunt", huntId: "hunt_alvida_forest" }, 5_000); killTed(first, 7_000); assert.equal(first.analyzer.snapshot(7_000).deaths, 1); first.tick(9_000); assert.equal(first.area, "pirate_ship");
});
