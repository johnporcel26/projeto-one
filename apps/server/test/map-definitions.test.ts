import test from "node:test";
import assert from "node:assert/strict";
import { canMoveTo, getEnemySpawnPoints, getMapDefinition, getPlayerSpawn, isBlocked, shapeContains } from "../src/map-definitions.js";

test("all map player and enemy spawns are read from Tiled object layers and are navigable", () => {
  for (const area of ["pirate_ship", "forest_alvida", "beach_buffalo"] as const) {
    const definition = getMapDefinition(area);
    assert.equal(isBlocked(area, getPlayerSpawn(area).x, getPlayerSpawn(area).y), false);
    for (const spawn of getEnemySpawnPoints(area)) assert.equal(isBlocked(area, spawn.x, spawn.y), false);
    assert.ok(definition.walkable.length > 0);
  }
});

test("rectangle, circle and polygon collision shapes are all honored by the server feet collider", () => {
  assert.equal(isBlocked("forest_alvida", 300, 260), true); // circle tree base
  assert.equal(isBlocked("beach_buffalo", 200, 500), true); // water rectangle
  assert.equal(isBlocked("pirate_ship", 150, 500), true); // outside deck polygon
  assert.equal(isBlocked("pirate_ship", 700, 310), true); // counter rectangle
  assert.equal(canMoveTo("pirate_ship", 720, 520), true);
  const deck = getMapDefinition("pirate_ship").walkable[0]; assert.equal(shapeContains(deck, 720, 520), true);
});

test("boat data keeps the NPC, portal and safe-zone metadata without creating gameplay entities", () => {
  const boat = getMapDefinition("pirate_ship");
  assert.equal(boat.npcSpawns[0]?.id, "old_drunk"); assert.equal(boat.portals[0]?.id, "hunt_board"); assert.equal(boat.safeZones.length, 1);
});
