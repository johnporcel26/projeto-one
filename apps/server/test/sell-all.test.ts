import assert from "node:assert/strict";
import test from "node:test";
import { GameSession } from "../src/GameSession.js";

test("sell all is finite, protects excluded and fruit stacks, and leaves the session able to travel", () => {
  const session = new GameSession("seller");
  session.player.inventory.add("item_gravel", 2);
  session.player.inventory.add("item_soap", 1);
  session.player.inventory.add("fruit_sube_sube", 1);
  session.handle({ type: "sellAll", excludedItemIds: ["item_soap"] }, 1000);
  assert.equal(session.player.inventory.quantity("item_gravel"), 0);
  assert.equal(session.player.inventory.quantity("item_soap"), 1);
  assert.equal(session.player.inventory.quantity("fruit_sube_sube"), 1);
  assert.equal(session.player.wallet.berries, 8);
  session.handle({ type: "enterHunt", huntId: "hunt_alvida_forest" }, 1100);
  assert.equal(session.area, "forest_alvida");
  session.handle({ type: "leaveHunt" }, 1200);
  session.handle({ type: "enterHunt", huntId: "hunt_buffalo_beach" }, 1300);
  assert.equal(session.area, "beach_buffalo");
  session.handle({ type: "leaveHunt" }, 1400);
  session.handle({ type: "enterHunt", huntId: "hunt_ice_mountain" }, 1500);
  assert.equal(session.area, "ice_mountain");
});

test("sell all with no eligible stacks is a no-op and is safely repeatable", () => {
  const session = new GameSession("empty");
  session.player.inventory.add("fruit_guro_guro", 1);
  session.handle({ type: "sellAll", excludedItemIds: [] }, 1000);
  session.handle({ type: "sellAll", excludedItemIds: [] }, 1100);
  assert.equal(session.player.inventory.quantity("fruit_guro_guro"), 1);
  assert.equal(session.player.wallet.berries, 0);
  assert.match(session.drainLogs().join("\n"), /Nenhum item disponível para venda/);
});
