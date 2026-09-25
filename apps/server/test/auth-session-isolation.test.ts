import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { WebSocket } from "ws";
import { AuthRepository } from "../src/auth-repository.js";
import { PlayerDomain } from "../src/domain.js";
import { SessionManager } from "../src/SessionManager.js";

const waitFor = (predicate: () => boolean, timeout = 8_000): Promise<void> => new Promise((resolve, reject) => {
  const until = Date.now() + timeout;
  const tick = () => predicate() ? resolve() : Date.now() > until ? reject(new Error("Timed out")) : setTimeout(tick, 20);
  tick();
});
const open = async (url: string): Promise<WebSocket> => {
  const socket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  return socket;
};
const nextEvent = <T extends { type: string }>(socket: WebSocket, type: T["type"]): Promise<T> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Missing ${type}`)), 6_000);
  const listener = (raw: WebSocket.RawData) => {
    const event = JSON.parse(raw.toString()) as T;
    if (event.type !== type) return;
    clearTimeout(timer); socket.off("message", listener); resolve(event);
  };
  socket.on("message", listener);
});

test("offline seller sale persists credit, item delivery and a durable notification atomically", async () => {
  const folder = mkdtempSync(join(tmpdir(), "project-one-offline-market-"));
  const database = join(folder, "alpha.sqlite");
  const repository = new AuthRepository(database);
  let reopened: AuthRepository | undefined;
  try {
    const sellerAuth = await repository.register("seller_alpha", "seller@alpha.local", "senha-segura");
    const buyerAuth = await repository.register("buyer_alpha", "buyer@alpha.local", "senha-segura");
    if (!sellerAuth.ok || !buyerAuth.ok) return assert.fail("Could not create test accounts");
    const sellerState = repository.loadPlayer(sellerAuth.session.accountId)!;
    sellerState.inventory = [{ itemId: "item_gravel", quantity: 4 }];
    const buyerState = repository.loadPlayer(buyerAuth.session.accountId)!;
    buyerState.berries = 100;
    buyerState.rubies = 50;
    repository.saveRuntimeState([
      { accountId: sellerAuth.session.accountId, state: sellerState },
      { accountId: buyerAuth.session.accountId, state: buyerState },
    ], { listings: [], offers: [] });
    const seller = new PlayerDomain(sellerState.id, sellerState.name, sellerState);
    const listed = new SessionManager(() => undefined, (playerId) => repository.loadPlayerById(playerId));
    assert.equal(listed.auction.createListing(seller, "item_gravel", 2, 100, undefined, false, 1).ok, true);
    repository.saveRuntimeState([{ accountId: sellerAuth.session.accountId, state: seller.persistentState() }], listed.marketState());
    const runtime = new SessionManager(() => undefined, (playerId) => repository.loadPlayerById(playerId));
    runtime.hydrateMarket(repository.loadMarket());
    const buyer = runtime.createSession(repository.loadPlayer(buyerAuth.session.accountId), buyerAuth.session.accountId);
    const listing = runtime.marketState().listings[0]!;
    assert.equal(runtime.auction.buy(buyer.player, listing.id, "BERRIES", 2).ok, true);
    repository.saveRuntimeState(
      [{ accountId: buyerAuth.session.accountId, state: buyer.persistentState() }, ...runtime.pendingOfflinePlayerStates()],
      runtime.marketState(), runtime.wallets.ledger, runtime.pendingMarketNotifications(),
    );
    runtime.markPendingMarketPersistenceSaved();
    const sellerForRubiesState = repository.loadPlayer(sellerAuth.session.accountId)!;
    const sellerForRubies = new PlayerDomain(sellerForRubiesState.id, sellerForRubiesState.name, sellerForRubiesState);
    assert.equal(runtime.auction.createListing(sellerForRubies, "item_gravel", 2, undefined, 20, false, 3).ok, true);
    repository.saveRuntimeState([
      { accountId: sellerAuth.session.accountId, state: sellerForRubies.persistentState() },
      { accountId: buyerAuth.session.accountId, state: buyer.persistentState() },
    ], runtime.marketState());
    const rubyListing = runtime.marketState().listings.find((entry) => entry.status === "ACTIVE")!;
    assert.equal(runtime.auction.buy(buyer.player, rubyListing.id, "RUBIES", 4).ok, true);
    repository.saveRuntimeState(
      [{ accountId: buyerAuth.session.accountId, state: buyer.persistentState() }, ...runtime.pendingOfflinePlayerStates()],
      runtime.marketState(), runtime.wallets.ledger, runtime.pendingMarketNotifications(),
    );
    runtime.markPendingMarketPersistenceSaved();
    repository.close();
    reopened = new AuthRepository(database);
    const savedSeller = reopened.loadPlayer(sellerAuth.session.accountId)!;
    const savedBuyer = reopened.loadPlayer(buyerAuth.session.accountId)!;
    assert.equal(savedSeller.berries, 90);
    assert.equal(savedSeller.rubies, 18);
    assert.equal(savedBuyer.berries, 0);
    assert.equal(savedBuyer.rubies, 30);
    assert.equal(savedBuyer.inventory.find((stack) => stack.itemId === "item_gravel")?.quantity, 4);
    assert.equal(reopened.loadMarket().listings.every((entry) => entry.status === "SOLD"), true);
    const notifications = reopened.consumeMarketNotifications(savedSeller.id);
    assert.deepEqual(notifications.map((notification) => notification.receivedAmount).sort((a, b) => a - b), [18, 90]);
  } finally {
    try { repository.close(); } catch { /* closed for restart assertion */ }
    reopened?.close(); rmSync(folder, { recursive: true, force: true });
  }
});

test("five concurrent GameSessions keep player, hunt and automation state isolated", () => {
  const manager = new SessionManager();
  const players = Array.from({ length: 5 }, (_, index) => manager.createSession({
    id: `player_isolation_${index}`, name: `Sailor ${index}`, totalXp: index * 100,
    berries: index * 10, rubies: index, inventory: [], storage: [], ownedFruitIds: [], activeFruitId: null,
    utilitySlots: [null, null], lockedItemIds: [], autoHuntSettings: { autoUseConsumables: Boolean(index % 2), hpPotionEnabled: true, hpThresholdPercent: 40, manaPotionEnabled: false, manaThresholdPercent: 30, potionPreference: "SMART", utilityMode: "AUTO", basicAttackEnabled: true, targetPriority: "NEAREST", skillPolicies: {} },
    discovery: { items: [], fruits: [], enemies: [], hunts: [] },
  }));
  for (const [index, session] of players.entries()) {
    session.player.inventory.add("item_gravel", index + 1);
    session.player.storage.add("item_soap", index + 1);
    session.player.setItemLocked("item_gravel", true);
    session.player.discoverItem("item_gravel");
    session.handle({ type: "enterHunt", huntId: index % 2 ? "hunt_buffalo_beach" : "hunt_alvida_forest" }, index + 1);
    session.player.autoHunt = "SEARCHING";
  }
  for (const [index, session] of players.entries()) {
    const state = session.persistentState();
    assert.equal(state.inventory[0]?.quantity, index + 1);
    assert.equal(state.storage[0]?.quantity, index + 1);
    assert.equal(state.lockedItemIds.includes("item_gravel"), true);
    assert.equal(state.discovery.items.includes("item_gravel"), true);
    assert.equal(session.analyzer.snapshot().huntId, index % 2 ? "hunt_buffalo_beach" : "hunt_alvida_forest");
    assert.equal(session.player.autoHunt, "SEARCHING");
    assert.equal(manager.findByPlayerId(state.id), session);
  }
});

test("authenticated websocket sessions isolate players and revoke a superseded socket", async () => {
  const folder = mkdtempSync(join(tmpdir(), "project-one-session-ws-"));
  const database = join(folder, "alpha.sqlite");
  const seed = new AuthRepository(database);
  let child: ReturnType<typeof spawn> | undefined;
  let first: WebSocket | undefined, second: WebSocket | undefined, replacement: WebSocket | undefined;
  try {
    const alpha = await seed.register("alpha_guard", "alpha@guard.local", "senha-segura");
    const beta = await seed.register("beta_guard", "beta@guard.local", "senha-segura");
    if (!alpha.ok || !beta.ok) return assert.fail("Could not create test accounts");
    const alphaState = seed.loadPlayer(alpha.session.accountId)!;
    alphaState.inventory = [{ itemId: "item_gravel", quantity: 1 }];
    seed.savePlayer(alpha.session.accountId, alphaState);
    seed.close();
    const port = 19_000 + Math.floor(Math.random() * 900);
    const root = join(process.cwd(), "..", "..");
    child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", "import './apps/server/src/index.ts';"], {
      cwd: root, env: { ...process.env, PORT: String(port), PROJECT_ONE_DB_PATH: database, DISABLE_CONTENT_ADMIN: "true" }, stdio: ["ignore", "pipe", "pipe"],
    });
    let started = false;
    child.stdout?.on("data", (chunk) => { if (chunk.toString().includes("listening")) started = true; });
    await waitFor(() => started);
    first = await open(`ws://127.0.0.1:${port}/?token=${alpha.session.token}`);
    second = await open(`ws://127.0.0.1:${port}/?token=${beta.session.token}`);
    const firstSnapshot = await nextEvent<{ type: "snapshot"; payload: { player: { id: string } } }>(first, "snapshot");
    const secondSnapshot = await nextEvent<{ type: "snapshot"; payload: { player: { id: string } } }>(second, "snapshot");
    assert.notEqual(firstSnapshot.payload.player.id, secondSnapshot.payload.player.id);
    const replaced = nextEvent<{ type: "sessionReplaced"; message: string }>(first, "sessionReplaced");
    const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity: "alpha_guard", password: "senha-segura" }) });
    const loginBody = await login.json() as { ok: boolean; session?: { token: string } };
    assert.equal(loginBody.ok, true);
    // A frame queued by the old client after replacement must never create a listing.
    try { first.send(JSON.stringify({ type: "createAuctionListing", itemId: "item_gravel", quantity: 1, berriesPrice: 1, allowOffers: false, playerId: secondSnapshot.payload.player.id })); } catch { /* socket already closed is also safe */ }
    assert.match((await replaced).message, /outro dispositivo/i);
    replacement = await open(`ws://127.0.0.1:${port}/?token=${loginBody.session!.token}`);
    const fresh = await nextEvent<{ type: "snapshot"; payload: { player: { id: string }; auction: { myListings: unknown[] } } }>(replacement, "snapshot");
    assert.equal(fresh.payload.player.id, firstSnapshot.payload.player.id);
    assert.equal(fresh.payload.auction.myListings.length, 0);
    replacement.send(JSON.stringify({ type: "move", x: 1, y: 0, playerId: secondSnapshot.payload.player.id, accountId: "spoofed" }));
    const moved = await nextEvent<{ type: "snapshot"; payload: { player: { id: string } } }>(replacement, "snapshot");
    assert.equal(moved.payload.player.id, firstSnapshot.payload.player.id);
    replacement.send(JSON.stringify({ type: "move", x: 99_999, y: 0 }));
    const invalid = await nextEvent<{ type: "log"; message: string }>(replacement, "log");
    assert.match(invalid.message, /inválida/i);
    const unauthenticated = new WebSocket(`ws://127.0.0.1:${port}/?token=not-a-session`);
    unauthenticated.on("error", () => undefined);
    await new Promise<void>((resolve) => unauthenticated.once("close", () => resolve()));
  } finally {
    first?.close(); second?.close(); replacement?.close();
    if (child?.exitCode === null) {
      const exited = new Promise<void>((resolve) => child!.once("exit", () => resolve()));
      child.kill("SIGTERM");
      await exited;
    }
    try { seed.close(); } catch { /* seed was closed before spawning */ }
    rmSync(folder, { recursive: true, force: true });
  }
});
