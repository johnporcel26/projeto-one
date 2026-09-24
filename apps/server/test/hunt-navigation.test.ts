import test from "node:test";
import assert from "node:assert/strict";
import { GameSession } from "../src/GameSession.js";

test("new sessions start safely on the pirate ship", () => { const session = new GameSession("new-player"); assert.equal(session.area, "pirate_ship"); assert.equal(session.enemies.length, 0); assert.equal(session.snapshot().huntAnalyzer.status, "IDLE"); });
test("joining a valid hunt is server-authoritative, does not level-block, and is isolated", () => { const a = new GameSession("a"), b = new GameSession("b"); a.handle({ type: "enterHunt", huntId: "hunt_buffalo_beach" }, 100); b.handle({ type: "enterHunt", huntId: "hunt_alvida_forest" }, 100); assert.equal(a.area, "beach_buffalo"); assert.equal(a.snapshot(101).huntAnalyzer.huntId, "hunt_buffalo_beach"); assert.equal(a.player.autoHunt, "OFF"); assert.equal(b.area, "forest_alvida"); a.handle({ type: "enterHunt", huntId: "invalid_hunt" as never }, 200); assert.equal(a.area, "beach_buffalo"); });
test("leaving a hunt returns to ship and clears combat entities and auto-hunt", () => { const session = new GameSession("return"); session.handle({ type: "enterHunt", huntId: "hunt_alvida_forest" }, 100); session.player.autoHunt = "ATTACKING"; assert.ok(session.enemies.length > 0); session.handle({ type: "leaveHunt" }, 200); assert.equal(session.area, "pirate_ship"); assert.equal(session.enemies.length, 0); assert.equal(session.player.autoHunt, "OFF"); assert.equal(session.snapshot(201).huntAnalyzer.status, "ENDED"); });

test("Wapol auto-hunt leaves entry and routes around the ice-tree blocker without WASD", () => {
  const session = new GameSession("wapol-auto");
  session.handle({ type: "enterHunt", huntId: "hunt_ice_mountain" }, 0);
  session.enemies = session.enemies.filter((enemy) => enemy.snapshot.x === 800 && enemy.snapshot.y === 430);
  session.handle({ type: "toggleAutoHunt" }, 1);
  for (let now = 100; now <= 4_000; now += 100) session.tick(now);
  assert.notDeepEqual([session.player.x, session.player.y], [800, 920]);
  assert.ok(session.player.y < 840, "Ted should pass the old direct-route blocking row");
  assert.ok(session.player.x !== 800, "Ted should have taken a lateral route around ice_tree_3");
});
