import test from "node:test";
import assert from "node:assert/strict";
import { canMoveTo, findNavigationPath, getEnemySpawnPoints, getMapDefinition, getMaxAliveEnemies, getPlayerSpawn, isBlocked, shapeContains } from "../src/map-definitions.js";

test("each hunt map has ten navigable spawn zones connected to its safe player entry", () => {
  for (const area of ["forest_alvida", "beach_buffalo", "ice_mountain"] as const) {
    const definition = getMapDefinition(area);
    const entry = getPlayerSpawn(area);
    assert.equal(getMaxAliveEnemies(area), 10);
    assert.equal(isBlocked(area, entry.x, entry.y), false);
    assert.equal(getEnemySpawnPoints(area).length, 10);
    for (const spawn of getEnemySpawnPoints(area)) {
      assert.equal(isBlocked(area, spawn.x, spawn.y), false, `${area}:${spawn.id}`);
      assert.ok(Math.hypot(spawn.x - entry.x, spawn.y - entry.y) >= 260, `${area}:${spawn.id} starts inside aggro reach`);
      assert.ok(findNavigationPath(area, entry, spawn, 40), `${area}:${spawn.id} is disconnected`);
    }
    const spawns = getEnemySpawnPoints(area);
    for (let index = 0; index < spawns.length; index++)
      for (let next = index + 1; next < spawns.length; next++)
        assert.ok(
          Math.hypot(spawns[index]!.x - spawns[next]!.x, spawns[index]!.y - spawns[next]!.y) >= 260,
          `${area}:${spawns[index]!.id} and ${spawns[next]!.id} are too close`,
        );
    assert.ok(definition.walkable.length > 0);
  }
});

test("Wapol entry has a route around the initial ice-tree obstacle without a manual step", () => {
  const entry = getPlayerSpawn("ice_mountain");
  assert.equal(canMoveTo("ice_mountain", entry.x, entry.y), true);
  assert.equal(canMoveTo("ice_mountain", 800, 840), true);
  assert.equal(canMoveTo("ice_mountain", 800, 820), false); // direct vertical route meets ice_tree_3
  const route = findNavigationPath("ice_mountain", entry, { x: 800, y: 430 }, 64);
  assert.ok(route && route.length > 0);
  assert.ok(route.includes("left") || route.includes("right"), "route must deliberately go around the blocker");
});

test("rectangle, circle and polygon collision shapes are all honored by the server feet collider", () => {
  assert.equal(isBlocked("forest_alvida", 300, 260), true);
  assert.equal(isBlocked("beach_buffalo", 200, 500), true);
  assert.equal(isBlocked("pirate_ship", 150, 500), true);
  assert.equal(isBlocked("pirate_ship", 700, 310), true);
  assert.equal(canMoveTo("pirate_ship", 720, 520), true);
  const deck = getMapDefinition("pirate_ship").walkable[0]!;
  assert.equal(shapeContains(deck, 720, 520), true);
});

test("boat data keeps the NPC, portal and safe-zone metadata without creating gameplay entities", () => {
  const boat = getMapDefinition("pirate_ship");
  assert.equal(boat.npcSpawns[0]?.id, "old_drunk");
  assert.equal(boat.portals[0]?.id, "hunt_board");
  assert.equal(boat.safeZones.length, 1);
});
