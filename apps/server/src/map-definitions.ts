import { readFileSync } from "node:fs";
import type { Direction, GameSnapshot } from "@onepiece/shared";

type MapId = GameSnapshot["area"];
type ObjectLayerName = "COLLISION" | "WATER" | "PLAYER_SPAWN" | "ENEMY_SPAWN" | "NPC" | "PORTAL" | "SAFE_ZONE" | "DECORATION";
interface TiledPoint { x: number; y: number; }
interface TiledObject { name?: string; type?: string; x: number; y: number; width?: number; height?: number; ellipse?: boolean; polygon?: TiledPoint[]; }
interface TiledLayer { name: string; type: string; objects?: TiledObject[]; }
interface TiledMap { width: number; height: number; layers: TiledLayer[]; }
export type CollisionShape = { kind: "rectangle"; x: number; y: number; width: number; height: number } | { kind: "circle"; x: number; y: number; radiusX: number; radiusY: number } | { kind: "polygon"; points: readonly TiledPoint[] };
export interface SpawnPoint extends TiledPoint { id: string; }
export interface MapDefinition { readonly id: MapId; readonly width: number; readonly height: number; readonly maxAliveEnemies: number; readonly walkable: readonly CollisionShape[]; readonly collision: readonly CollisionShape[]; readonly water: readonly CollisionShape[]; readonly playerSpawn: SpawnPoint; readonly enemySpawns: readonly SpawnPoint[]; readonly npcSpawns: readonly SpawnPoint[]; readonly portals: readonly SpawnPoint[]; readonly safeZones: readonly CollisionShape[]; readonly decorations: readonly CollisionShape[]; }

const mapFiles: Record<MapId, string> = { pirate_ship: "pirate_ship.json", forest_alvida: "forest_alvida.json", beach_buffalo: "beach_buffalo.json", ice_mountain: "ice_mountain.json" };
/** One authoritative configuration point for hunt population; boat deliberately has none. */
const maxAliveByMap: Record<MapId, number> = { pirate_ship: 0, forest_alvida: 10, beach_buffalo: 10, ice_mountain: 10 };
const validLayerNames = new Set<ObjectLayerName>(["COLLISION", "WATER", "PLAYER_SPAWN", "ENEMY_SPAWN", "NPC", "PORTAL", "SAFE_ZONE", "DECORATION"]);
const PLAYER_FEET_RADIUS = 12;
const NAVIGATION_STEP = 20;
const MAX_NAVIGATION_NODES = 8_000;
const CARDINAL_DIRECTIONS: readonly Direction[] = ["up", "right", "down", "left"];
function objectShape(object: TiledObject): CollisionShape | undefined { if (object.polygon?.length && object.polygon.length >= 3) return { kind: "polygon", points: object.polygon.map((point) => ({ x: object.x + point.x, y: object.y + point.y })) }; if (object.ellipse) return { kind: "circle", x: object.x + (object.width ?? 0) / 2, y: object.y + (object.height ?? 0) / 2, radiusX: (object.width ?? 0) / 2, radiusY: (object.height ?? 0) / 2 }; if ((object.width ?? 0) > 0 && (object.height ?? 0) > 0) return { kind: "rectangle", x: object.x, y: object.y, width: object.width!, height: object.height! }; return undefined; }
function spawn(object: TiledObject, fallback: string): SpawnPoint { return { id: object.name || fallback, x: object.x, y: object.y }; }
function loadMap(id: MapId): MapDefinition { const tiled = JSON.parse(readFileSync(new URL(`../../../assets/maps/data/${mapFiles[id]}`, import.meta.url), "utf8")) as TiledMap; const groups = new Map<ObjectLayerName, TiledObject[]>(); for (const layer of tiled.layers) { const name = layer.name.toUpperCase() as ObjectLayerName; if (layer.type === "objectgroup" && validLayerNames.has(name)) groups.set(name, layer.objects ?? []); } const objects = (name: ObjectLayerName) => groups.get(name) ?? []; const shapes = (name: ObjectLayerName) => objects(name).map(objectShape).filter((shape): shape is CollisionShape => Boolean(shape)); const collisionObjects = objects("COLLISION"); const walkable = collisionObjects.filter((object) => object.name === "WALKABLE" || object.type === "WALKABLE").map(objectShape).filter((shape): shape is CollisionShape => Boolean(shape)); const collision = collisionObjects.filter((object) => object.name !== "WALKABLE" && object.type !== "WALKABLE").map(objectShape).filter((shape): shape is CollisionShape => Boolean(shape)); const playerObject = objects("PLAYER_SPAWN")[0]; if (!playerObject) throw new Error(`[MapData] ${id} has no PLAYER_SPAWN object.`); return Object.freeze({ id, width: tiled.width, height: tiled.height, maxAliveEnemies: maxAliveByMap[id], walkable, collision, water: shapes("WATER"), playerSpawn: spawn(playerObject, "player_spawn"), enemySpawns: objects("ENEMY_SPAWN").map((object, index) => spawn(object, `enemy_${index}`)), npcSpawns: objects("NPC").map((object, index) => spawn(object, `npc_${index}`)), portals: objects("PORTAL").map((object, index) => spawn(object, `portal_${index}`)), safeZones: shapes("SAFE_ZONE"), decorations: shapes("DECORATION") }); }
function inPolygon(x: number, y: number, points: readonly TiledPoint[]): boolean { let inside = false; for (let i = 0, j = points.length - 1; i < points.length; j = i++) { const a = points[i], b = points[j]; if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside; } return inside; }
export function shapeContains(shape: CollisionShape, x: number, y: number): boolean { if (shape.kind === "rectangle") return x >= shape.x && x <= shape.x + shape.width && y >= shape.y && y <= shape.y + shape.height; if (shape.kind === "circle") return ((x - shape.x) / shape.radiusX) ** 2 + ((y - shape.y) / shape.radiusY) ** 2 <= 1; return inPolygon(x, y, shape.points); }
function isNavigablePoint(definition: MapDefinition, x: number, y: number): boolean { return definition.walkable.some((shape) => shapeContains(shape, x, y)) && !definition.water.some((shape) => shapeContains(shape, x, y)) && !definition.collision.some((shape) => shapeContains(shape, x, y)); }
/** Server-authoritative feet collider. It never imports Phaser or samples image pixels. */
export function isBlocked(area: MapId, x: number, y: number): boolean { const definition = mapDefinitions[area]; return [{ x, y }, { x: x - PLAYER_FEET_RADIUS, y }, { x: x + PLAYER_FEET_RADIUS, y }, { x, y: y - PLAYER_FEET_RADIUS }, { x, y: y + PLAYER_FEET_RADIUS }].some((point) => !isNavigablePoint(definition, point.x, point.y)); }
export function canMoveTo(area: MapId, x: number, y: number): boolean { return !isBlocked(area, x, y); }
export function getMapDefinition(area: MapId): MapDefinition { return mapDefinitions[area]; }
export function getPlayerSpawn(area: MapId): SpawnPoint { return mapDefinitions[area].playerSpawn; }
export function getEnemySpawnPoints(area: MapId): readonly SpawnPoint[] { return mapDefinitions[area].enemySpawns; }
export function getMaxAliveEnemies(area: MapId): number { return mapDefinitions[area].maxAliveEnemies; }

type NavigationNode = { x: number; y: number; previous?: string; direction?: Direction };
const nodeKey = (x: number, y: number) => `${x}:${y}`;
const snapToNavigationGrid = (value: number) => Math.round(value / NAVIGATION_STEP) * NAVIGATION_STEP;
const moved = (x: number, y: number, direction: Direction) => direction === "up" ? [x, y - NAVIGATION_STEP] as const : direction === "down" ? [x, y + NAVIGATION_STEP] as const : direction === "left" ? [x - NAVIGATION_STEP, y] as const : [x + NAVIGATION_STEP, y] as const;

/** Finds a static-collision route once per target instead of walking directly into an obstacle. */
export function findNavigationPath(area: MapId, from: TiledPoint, target: TiledPoint, goalDistance: number): Direction[] | undefined {
  if (isBlocked(area, from.x, from.y)) return undefined;
  if (Math.hypot(target.x - from.x, target.y - from.y) <= goalDistance) return [];
  const startX = snapToNavigationGrid(from.x), startY = snapToNavigationGrid(from.y);
  if (isBlocked(area, startX, startY)) return undefined;
  const startKey = nodeKey(startX, startY);
  const nodes = new Map<string, NavigationNode>([[startKey, { x: startX, y: startY }]]);
  const queue = [startKey];
  for (let cursor = 0; cursor < queue.length && cursor < MAX_NAVIGATION_NODES; cursor++) {
    const currentKey = queue[cursor]!;
    const current = nodes.get(currentKey)!;
    const directions = [...CARDINAL_DIRECTIONS].sort((a, b) => {
      const [ax, ay] = moved(current.x, current.y, a), [bx, by] = moved(current.x, current.y, b);
      return Math.hypot(ax - target.x, ay - target.y) - Math.hypot(bx - target.x, by - target.y);
    });
    for (const direction of directions) {
      const [x, y] = moved(current.x, current.y, direction);
      const key = nodeKey(x, y);
      if (nodes.has(key) || isBlocked(area, x, y)) continue;
      nodes.set(key, { x, y, previous: currentKey, direction });
      if (Math.hypot(x - target.x, y - target.y) <= goalDistance) {
        const path: Direction[] = [];
        let walkKey: string | undefined = key;
        while (walkKey && walkKey !== startKey) { const node: NavigationNode = nodes.get(walkKey)!; if (node.direction) path.push(node.direction); walkKey = node.previous; }
        return path.reverse();
      }
      queue.push(key);
    }
  }
  return undefined;
}
export function hasNavigationRoute(area: MapId, from: TiledPoint, target: TiledPoint, goalDistance = NAVIGATION_STEP): boolean { return findNavigationPath(area, from, target, goalDistance) !== undefined; }
function validateMap(definition: MapDefinition): void { if (!definition.walkable.length) throw new Error(`[MapData] ${definition.id} requires a WALKABLE object in COLLISION.`); if (isBlocked(definition.id, definition.playerSpawn.x, definition.playerSpawn.y)) throw new Error(`[MapData] ${definition.id} PLAYER_SPAWN is blocked.`); if (definition.maxAliveEnemies > definition.enemySpawns.length) throw new Error(`[MapData] ${definition.id} needs at least ${definition.maxAliveEnemies} ENEMY_SPAWN slots.`); for (const point of definition.enemySpawns) { if (isBlocked(definition.id, point.x, point.y)) throw new Error(`[MapData] ${definition.id} ENEMY_SPAWN ${point.id} is blocked.`); if (!hasNavigationRoute(definition.id, definition.playerSpawn, point, NAVIGATION_STEP * 2)) throw new Error(`[MapData] ${definition.id} ENEMY_SPAWN ${point.id} is disconnected from PLAYER_SPAWN.`); } }
/** Loaded and validated once at server start-up. */
export const mapDefinitions: Record<MapId, MapDefinition> = Object.freeze({ pirate_ship: loadMap("pirate_ship"), forest_alvida: loadMap("forest_alvida"), beach_buffalo: loadMap("beach_buffalo"), ice_mountain: loadMap("ice_mountain") });
Object.values(mapDefinitions).forEach(validateMap);
