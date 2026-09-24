import test from "node:test";
import assert from "node:assert/strict";
import { AutoHuntSkillPlanner } from "../src/auto-hunt.js";
import { GameSession } from "../src/GameSession.js";
import { isBlocked } from "../src/map-definitions.js";
import { SessionManager } from "../src/SessionManager.js";

test("sessions own independent Ted, gold, inventory, fruit and analyzer", () => {
  const manager = new SessionManager(); const first = manager.createSession(); const second = manager.createSession();
  assert.notEqual(first.id, second.id); first.handle({ type: "move", x: 1, y: 0 }, 100); assert.notEqual(first.player.x, second.player.x);
  first.player.wallet.berries = 50; first.handle({ type: "buyItem", itemId: "item_potion_small" }, 200); assert.equal(second.player.wallet.berries, 0); assert.equal(second.player.inventory.quantity("item_potion_small"), 0);
  first.player.gainFruit("fruit_sube_sube"); first.handle({ type: "equipFruit", fruitId: "fruit_sube_sube" }, 300); assert.equal(second.player.activeFruitId, null);
  first.handle({ type: "enterHunt", huntId: "hunt_alvida_forest" }, 400); assert.equal(second.analyzer.snapshot(500).status, "IDLE");
});
test("map collision is data-driven: forest trees and beach water/rocks block while sand permits", () => {
  assert.equal(isBlocked("forest_alvida", 300, 260), true); assert.equal(isBlocked("forest_alvida", 500, 500), false);
  assert.equal(isBlocked("beach_buffalo", 200, 500), true); assert.equal(isBlocked("beach_buffalo", 630, 455), true); assert.equal(isBlocked("beach_buffalo", 500, 500), false);
});
test("auto-hunt planner is fruit-agnostic and defaults to basic attack only", () => {
  const planner = new AutoHuntSkillPlanner(); assert.equal(planner.chooseSkill(null, []), null); assert.equal(planner.chooseSkill("fruit_sube_sube", ["sube_bubbles"]), null); assert.equal(planner.chooseSkill("fruit_guro_guro", ["guro_blast"]), null);
});
test("Guro helices has server cooldown and exactly five one-second ticks", () => {
  const session = new GameSession("spin"); session.handle({ type: "enterHunt", huntId: "hunt_buffalo_beach" }, 500); session.player.gainFruit("fruit_guro_guro"); session.player.equipFruit("fruit_guro_guro"); const enemy = session.enemies[0]; session.player.x = enemy.snapshot.x; session.player.y = enemy.snapshot.y;
  session.handle({ type: "useSkill", skillId: "guro_blast" }, 1000); const hp = enemy.snapshot.hp; [1000, 2000, 3000, 4000, 5000].forEach((now) => session.tick(now)); assert.equal(enemy.snapshot.hp, hp - 5); session.tick(6000); assert.equal(enemy.snapshot.hp, hp - 5);
});
test("Wapol Tank Mode fires no more than seven long-range cannon shots", () => {
  const session = new GameSession("tank"); session.handle({ type: "enterHunt", huntId: "hunt_ice_mountain" }, 0); session.player.gainFruit("fruit_baku_baku"); session.player.equipFruit("fruit_baku_baku"); const enemy = session.enemies[0]; session.player.x = enemy.snapshot.x; session.player.y = enemy.snapshot.y;
  session.handle({ type: "useSkill", skillId: "baku_cannon" }, 1_000);
  [1_000, 5_000, 9_000, 13_000, 17_000, 21_000, 25_000, 29_000].forEach((now) => session.handle({ type: "attack" }, now));
  assert.equal(session.feedback.filter((entry) => entry.text === "TIRO DE CANHÃO").length, 7);
});
