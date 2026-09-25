import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { networkInterfaces } from "node:os";
import { WebSocketServer, WebSocket } from "ws";
import {
  rubyPackages,
  type ClientIntent,
  type ServerEvent,
} from "@onepiece/shared";
import { SessionManager } from "./SessionManager.js";
import { startAdminApi } from "./admin-api.js";
import { ContentRepository } from "./content-repository.js";
import { applyContentRuntime } from "./domain.js";
import { AuthRepository } from "./auth-repository.js";
import { paymentProvider } from "./payments.js";
import type { GameSession } from "./GameSession.js";

const content = new ContentRepository();
const lanMode = process.env.PROJECT_ONE_LAN === "true";
const reloadContentRuntime = async (): Promise<void> => {
  applyContentRuntime(await content.read());
  console.info(
    "[ContentRuntime] Validated content applied without resetting sessions.",
  );
};
await reloadContentRuntime();
const accounts = new AuthRepository(process.env.PROJECT_ONE_DB_PATH ?? "data/alpha.sqlite");
let marketDirty = false;
const sessions = new SessionManager(() => {
  marketDirty = true;
}, (playerId) => accounts.loadPlayerById(playerId));
sessions.hydrateMarket(accounts.loadMarket());
let persistedLedgerLength = 0;
if (process.env.DISABLE_CONTENT_ADMIN !== "true")
  startAdminApi(content, reloadContentRuntime);
const rateLimits = new Map<string, { attempts: number; resetAt: number }>();
const accountSockets = new Map<string, WebSocket>();
const socketSessions = new Map<
  WebSocket,
  { accountId: string; sessionId: string; saved: string; dirty: boolean }
>();
/** Saves then invalidates an account's live runtime state before its socket can issue another intent. */
const invalidateLiveSession = (
  accountId: string,
  state: "REPLACED" | "LOGGED_OUT",
  message: string,
): void => {
  const socket = accountSockets.get(accountId);
  const entry = socket ? socketSessions.get(socket) : undefined;
  if (entry) {
    entry.dirty = true;
    saveDirtyState(`session:${state.toLowerCase()}`, true);
  }
  const oldSessionId = sessions.replaceActiveSession(accountId);
  if (socket?.readyState === WebSocket.OPEN && state === "REPLACED")
    socket.send(JSON.stringify({ type: "sessionReplaced", message } satisfies ServerEvent));
  if (oldSessionId) sessions.destroySession(oldSessionId, state);
  if (socket) {
    accountSockets.delete(accountId);
    socket.close(state === "REPLACED" ? 4001 : 1000, message);
  }
};
const saveDirtyState = (reason: string, force = false): void => {
  const playerStates = new Map<string, ReturnType<GameSession["persistentState"]>>();
  for (const [socket, entry] of socketSessions) {
    if (!sessions.isActive(entry.sessionId, entry.accountId)) continue;
    const session = sessions.getSession(entry.sessionId);
    if (!session) continue;
    const state = session.persistentState();
    const serialized = JSON.stringify(state);
    if (serialized !== entry.saved) entry.dirty = true;
    if (!force && !entry.dirty && !marketDirty) continue;
    playerStates.set(entry.accountId, state);
    entry.saved = serialized;
  }
  if (!playerStates.size && !marketDirty && !force) return;
  try {
    for (const offline of sessions.pendingOfflinePlayerStates())
      playerStates.set(offline.accountId, offline.state);
    accounts.saveRuntimeState(
      [...playerStates].map(([accountId, state]) => ({ accountId, state })),
      sessions.marketState(),
      sessions.wallets.ledger.slice(persistedLedgerLength),
      sessions.pendingMarketNotifications(),
    );
    persistedLedgerLength = sessions.wallets.ledger.length;
    for (const entry of socketSessions.values()) entry.dirty = false;
    marketDirty = false;
    sessions.markPendingMarketPersistenceSaved();
    if (process.env.NODE_ENV !== "production")
      console.info(`[Persistence] Saved ${playerStates.size} player(s): ${reason}`);
  } catch (error) {
    console.error(`[Persistence] Save failed (${reason}); state remains dirty.`, error);
  }
};
const isCriticalIntent = (intent: ClientIntent): boolean =>
  [
    "equipFruit", "unequipFruit", "depositItem", "withdrawItem", "setItemLock",
    "setUtilitySlot", "clearUtilitySlot", "updateAutoHuntSettings", "createAuctionListing",
    "buyAuctionListing", "cancelAuctionListing", "createAuctionOffer", "acceptAuctionOffer",
    "rejectAuctionOffer", "purchaseVip",
  ].includes(intent.type);
const validId = (value: unknown, max = 96): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;
const validQuantity = (value: unknown, max = 999): boolean =>
  Number.isInteger(value) && Number(value) > 0 && Number(value) <= max;
const validAutoHuntSettings = (value: unknown): boolean => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const settings = value as Record<string, unknown>;
  const allowed = new Set(["autoUseConsumables", "hpPotionEnabled", "hpThresholdPercent", "manaPotionEnabled", "manaThresholdPercent", "potionPreference", "utilityMode", "basicAttackEnabled", "targetPriority", "skillPolicies"]);
  if (Object.keys(settings).some((key) => !allowed.has(key))) return false;
  for (const key of ["autoUseConsumables", "hpPotionEnabled", "manaPotionEnabled", "basicAttackEnabled"])
    if (settings[key] !== undefined && typeof settings[key] !== "boolean") return false;
  for (const key of ["hpThresholdPercent", "manaThresholdPercent"])
    if (settings[key] !== undefined && (!Number.isInteger(settings[key]) || Number(settings[key]) < 1 || Number(settings[key]) > 99)) return false;
  if (settings.potionPreference !== undefined && !["SMALL_FIRST", "LARGE_FIRST", "SMART"].includes(String(settings.potionPreference))) return false;
  if (settings.utilityMode !== undefined && !["AUTO", "SLOT_1", "SLOT_2"].includes(String(settings.utilityMode))) return false;
  if (settings.targetPriority !== undefined && !["NEAREST", "LOWEST_HP", "HIGHEST_HP"].includes(String(settings.targetPriority))) return false;
  if (settings.skillPolicies !== undefined && (!settings.skillPolicies || typeof settings.skillPolicies !== "object" || Array.isArray(settings.skillPolicies) || Object.keys(settings.skillPolicies as object).length > 8)) return false;
  return true;
};
/** Runtime payload firewall: TypeScript clients are not a security boundary. */
const isValidIntent = (value: unknown): value is ClientIntent => {
  if (!value || typeof value !== "object" || !validId((value as { type?: unknown }).type, 40)) return false;
  const intent = value as Record<string, unknown>;
  if (intent.type === "move") return Number.isFinite(intent.x) && Number.isFinite(intent.y) && Math.abs(Number(intent.x)) <= 1 && Math.abs(Number(intent.y)) <= 1;
  if (["attack", "toggleAutoHunt", "unequipFruit", "leaveHunt", "purchaseVip", "resetHuntAnalyzer", "requestRespawn"].includes(intent.type as string)) return true;
  if (intent.type === "useSkill") return validId(intent.skillId);
  if (["useItem", "equipFruit", "depositItem", "withdrawItem", "buyItem"].includes(intent.type as string)) return validId(intent.itemId) && (intent.quantity === undefined || validQuantity(intent.quantity));
  if (intent.type === "setItemLock") return validId(intent.itemId) && typeof intent.locked === "boolean";
  if (intent.type === "setUtilitySlot") return (intent.slot === 0 || intent.slot === 1) && validId(intent.itemId);
  if (intent.type === "clearUtilitySlot") return intent.slot === 0 || intent.slot === 1;
  if (intent.type === "enterHunt") return validId(intent.huntId);
  if (intent.type === "sellItems" || intent.type === "sellAll") { const ids = intent.type === "sellItems" ? intent.itemIds : intent.excludedItemIds; return Array.isArray(ids) && ids.length <= 100 && ids.every((id) => validId(id)); }
  if (intent.type === "updateAutoHuntSettings") return validAutoHuntSettings(intent.settings);
  if (intent.type === "createAuctionListing") return validId(intent.itemId) && validQuantity(intent.quantity) && typeof intent.allowOffers === "boolean" && (intent.berriesPrice === undefined || validQuantity(intent.berriesPrice, 1_000_000_000)) && (intent.rubiesPrice === undefined || validQuantity(intent.rubiesPrice, 1_000_000_000));
  if (intent.type === "buyAuctionListing") return validId(intent.listingId) && (intent.currency === "BERRIES" || intent.currency === "RUBIES");
  if (intent.type === "cancelAuctionListing") return validId(intent.listingId);
  if (intent.type === "createAuctionOffer") return validId(intent.listingId) && (intent.currency === "BERRIES" || intent.currency === "RUBIES") && validQuantity(intent.amount, 1_000_000_000);
  if (intent.type === "acceptAuctionOffer" || intent.type === "rejectAuctionOffer") return validId(intent.listingId) && validId(intent.offerId);
  if (intent.type === "interactWithNpc") return validId(intent.npcId);
  return false;
};
const isPrivateLanIpv4 = (host: string): boolean => {
  const octets = host.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  return octets[0] === 10
    || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31);
};
/** Only the local Vite origin, or a private-LAN Vite origin while explicitly enabled, can read API responses. */
const allowedClientOrigin = (origin: string | undefined): string | undefined => {
  if (!origin) return undefined;
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" || url.port !== "5173") return undefined;
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]") return origin;
    return lanMode && isPrivateLanIpv4(url.hostname) ? origin : undefined;
  } catch {
    return undefined;
  }
};
const respond = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  });
  response.end(JSON.stringify(body));
};
const readBody = async (
  request: IncomingMessage,
): Promise<Record<string, string>> => {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 16_384) return {};
  }
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
};
const limited = (request: IncomingMessage, action: string): boolean => {
  const key = `${action}:${request.socket.remoteAddress ?? "unknown"}`;
  const now = Date.now();
  const entry = rateLimits.get(key) ?? { attempts: 0, resetAt: now + 60_000 };
  if (now > entry.resetAt) {
    entry.attempts = 0;
    entry.resetAt = now + 60_000;
  }
  entry.attempts += 1;
  rateLimits.set(key, entry);
  return entry.attempts > 8;
};
const server = createServer(async (request, response) => {
  const origin = allowedClientOrigin(request.headers.origin);
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  if (request.method === "OPTIONS") return respond(response, 204, {});
  if (request.method !== "POST" || !request.url?.startsWith("/api/"))
    return respond(response, 404, { ok: false, message: "Não encontrado." });
  const authAction = request.url.startsWith("/api/auth/");
  const action = request.url.slice(
    authAction ? "/api/auth/".length : "/api/shop/".length,
  );
  if (limited(request, action))
    return respond(response, 429, {
      ok: false,
      message: "Tente novamente em instantes.",
    });
  const input = await readBody(request);
  if (!authAction) {
    const auth = accounts.validate(input.token);
    if (!auth)
      return respond(response, 401, { ok: false, message: "Sessão inválida." });
    if (action === "catalog")
      return respond(response, 200, {
        ok: true,
        packages: rubyPackages.filter((entry) => entry.enabled),
        development: process.env.NODE_ENV !== "production",
      });
    if (action === "purchase") {
      const entry = rubyPackages.find(
        (candidate) => candidate.id === input.packageId && candidate.enabled,
      );
      if (!entry)
        return respond(response, 400, {
          ok: false,
          message: "Pacote indisponível.",
        });
      const purchase = accounts.createPurchase(
        auth.accountId,
        entry.id,
        entry.rubies,
        entry.priceCents,
        paymentProvider.id,
      );
      return respond(response, 201, {
        ok: true,
        purchase,
        checkout: paymentProvider.createCheckout(purchase),
      });
    }
    if (action === "dev/approve" && process.env.NODE_ENV !== "production") {
      const session = sessions.findByPlayerId(`player_${auth.accountId}`);
      if (!session)
        return respond(response, 409, {
          ok: false,
          message:
            "Conecte-se ao jogo antes de aprovar o pagamento de desenvolvimento.",
        });
      const purchase = accounts.markPurchasePaid(
        auth.accountId,
        input.purchaseId ?? "",
      );
      if (!purchase)
        return respond(response, 409, {
          ok: false,
          message: "Pagamento já processado ou inexistente.",
        });
      session.creditPurchasedRubies(purchase.rubies, purchase.id);
      saveDirtyState("critical:ruby_purchase", true);
      return respond(response, 200, { ok: true, purchase });
    }
    return respond(response, 404, { ok: false, message: "Não encontrado." });
  }
  if (action === "register") {
    const result = await accounts.register(
      input.username ?? "",
      input.email ?? "",
      input.password ?? "",
    );
    return respond(response, result.ok ? 201 : 400, result);
  }
  if (action === "login") {
    const result = await accounts.login(
      input.identity ?? "",
      input.password ?? "",
    );
    if (result.ok)
      invalidateLiveSession(
        result.session.accountId,
        "REPLACED",
        "Sua sessão foi aberta em outro dispositivo.",
      );
    return respond(response, result.ok ? 200 : 401, result);
  }
  if (action === "validate") {
    const session = accounts.validate(input.token);
    return respond(
      response,
      session ? 200 : 401,
      session ? { ok: true, session } : { ok: false },
    );
  }
  if (action === "logout") {
    const auth = accounts.validate(input.token);
    if (auth)
      invalidateLiveSession(auth.accountId, "LOGGED_OUT", "Sessão encerrada.");
    if (input.token) accounts.logout(input.token);
    return respond(response, 200, { ok: true });
  }
  return respond(response, 404, { ok: false, message: "Não encontrado." });
});
const wss = new WebSocketServer({ noServer: true });
server.on("error", (error) =>
  console.error("[Server] HTTP listener error; process remains observable.", error),
);
wss.on("error", (error) =>
  console.error("[Server] WebSocket listener error; rejecting only the affected operation.", error),
);
server.on("upgrade", (request, socket, head) => {
  if (request.headers.origin && !allowedClientOrigin(request.headers.origin))
    return socket.destroy();
  const token = new URL(
    request.url ?? "/",
    "http://localhost",
  ).searchParams.get("token");
  const auth = accounts.validate(token);
  if (!auth) return socket.destroy();
  wss.handleUpgrade(request, socket, head, (ws) =>
    wss.emit("connection", ws, auth),
  );
});
wss.on(
  "connection",
  (socket, auth: NonNullable<ReturnType<AuthRepository["validate"]>>) => {
    invalidateLiveSession(
      auth.accountId,
      "REPLACED",
      "Sua sessão foi aberta em outro dispositivo.",
    );
    const session = sessions.createSession(accounts.loadPlayer(auth.accountId), auth.accountId);
    sessions.queuePersistedSales(
      session.player.id,
      accounts.consumeMarketNotifications(session.player.id),
    );
    accountSockets.set(auth.accountId, socket);
    const entry = {
      accountId: auth.accountId,
      sessionId: session.id,
      saved: JSON.stringify(session.persistentState()),
      dirty: false,
    };
    socketSessions.set(socket, entry);
    const send = (event: ServerEvent) => {
      if (socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify(event));
    };
    const publish = () => {
      for (const message of session.drainLogs()) send({ type: "log", message });
      for (const sale of sessions.drainMarketSales(session.player.id))
        send({ type: "marketSale", payload: sale });
      send({ type: "snapshot", payload: session.snapshot() });
    };
    socket.on("message", (raw) => {
      try {
        if (!sessions.isActive(entry.sessionId, entry.accountId)) return;
        const intent = JSON.parse(raw.toString()) as unknown;
        if (!isValidIntent(intent)) throw new Error("invalid intent");
        session.handle(intent);
        if (JSON.stringify(session.persistentState()) !== entry.saved)
          entry.dirty = true;
        if (isCriticalIntent(intent)) saveDirtyState(`critical:${intent.type}`);
      } catch {
        send({
          type: "log",
          message: "Intent inválida ignorada pelo servidor.",
        });
      }
      publish();
    });
    socket.on("error", (error) =>
      console.warn(`[Server] WebSocket error for session ${entry.sessionId}; closing only that socket.`, error.message),
    );
    socket.on("close", () => {
      const entry = socketSessions.get(socket);
      if (entry) {
        if (sessions.isActive(entry.sessionId, entry.accountId)) {
          entry.dirty = true;
          saveDirtyState("disconnect", true);
        }
        socketSessions.delete(socket);
      }
      if (accountSockets.get(auth.accountId) === socket)
        accountSockets.delete(auth.accountId);
      if (sessions.getSession(session.id)) sessions.destroySession(session.id);
    });
    publish();
  },
);
const tick = () => {
  for (const session of sessions.values()) {
    session.tick();
    const pair = [...socketSessions.entries()].find(
      ([, entry]) => entry.sessionId === session.id,
    );
    if (!pair) continue;
    const [socket, entry] = pair;
    if (JSON.stringify(session.persistentState()) !== entry.saved) entry.dirty = true;
    if (socket.readyState === WebSocket.OPEN)
      for (const sale of sessions.drainMarketSales(session.player.id))
        socket.send(
          JSON.stringify({
            type: "marketSale",
            payload: sale,
          } satisfies ServerEvent),
        );
    if (socket.readyState === WebSocket.OPEN)
      socket.send(
        JSON.stringify({
          type: "snapshot",
          payload: session.snapshot(),
        } satisfies ServerEvent),
      );
  }
};
const slowTick = setInterval(tick, 45_000);
const gameTick = setInterval(() => {
  for (const session of sessions.values()) {
    session.tick();
    const pair = [...socketSessions.entries()].find(
      ([, entry]) => entry.sessionId === session.id,
    );
    if (pair?.[0].readyState === WebSocket.OPEN)
      for (const sale of sessions.drainMarketSales(session.player.id))
        pair[0].send(
          JSON.stringify({
            type: "marketSale",
            payload: sale,
          } satisfies ServerEvent),
        );
    if (pair?.[0].readyState === WebSocket.OPEN)
      pair[0].send(
        JSON.stringify({
          type: "snapshot",
          payload: session.snapshot(),
        } satisfies ServerEvent),
      );
  }
}, 300);
const autosave = setInterval(() => saveDirtyState("autosave"), 30_000);
const port = Number(process.env.PORT ?? 8787);
const host = lanMode ? "0.0.0.0" : "127.0.0.1";
const lanAddresses = (): string[] => Object.values(networkInterfaces())
  .flat()
  .filter((network): network is NonNullable<typeof network> => Boolean(network && network.family === "IPv4" && !network.internal && isPrivateLanIpv4(network.address)))
  .map((network) => network.address);
server.listen(port, host, () => {
  console.log(`Authoritative authenticated game server listening on ${host}:${port}`);
  if (lanMode) {
    console.log("PROJECT ONE — LAN TEST");
    console.log("CLIENT LOCAL: http://localhost:5173");
    for (const address of lanAddresses()) {
      console.log(`CLIENT LAN: http://${address}:5173`);
      console.log(`SERVER LAN: ws://${address}:${port}`);
    }
    console.log("ADMIN: http://127.0.0.1:5174 (LOCAL ONLY)");
  }
});

let shuttingDown = false;
const shutdown = (signal: "SIGINT" | "SIGTERM") => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`[Persistence] ${signal} received; saving dirty player state.`);
  clearInterval(slowTick);
  clearInterval(gameTick);
  clearInterval(autosave);
  saveDirtyState(`shutdown:${signal}`, true);
  for (const socket of accountSockets.values()) socket.close(1001, "Servidor reiniciando.");
  wss.close();
  server.close(() => {
    accounts.close();
    process.exit(0);
  });
  setTimeout(() => {
    accounts.close();
    process.exit(1);
  }, 8_000).unref();
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
