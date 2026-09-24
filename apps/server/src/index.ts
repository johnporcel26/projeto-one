import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
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
});
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
const saveDirtyState = (reason: string, force = false): void => {
  const playerStates = new Map<string, ReturnType<GameSession["persistentState"]>>();
  for (const [socket, entry] of socketSessions) {
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
    accounts.saveRuntimeState(
      [...playerStates].map(([accountId, state]) => ({ accountId, state })),
      sessions.marketState(),
      sessions.wallets.ledger.slice(persistedLedgerLength),
    );
    persistedLedgerLength = sessions.wallets.ledger.length;
    for (const entry of socketSessions.values()) entry.dirty = false;
    marketDirty = false;
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
const respond = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "http://localhost:5173",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  });
  response.end(JSON.stringify(body));
};
const readBody = async (
  request: IncomingMessage,
): Promise<Record<string, string>> => {
  let raw = "";
  for await (const chunk of request) raw += chunk;
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
    saveDirtyState("logout", true);
    if (input.token) accounts.logout(input.token);
    return respond(response, 200, { ok: true });
  }
  return respond(response, 404, { ok: false, message: "Não encontrado." });
});
const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (request, socket, head) => {
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
    const previous = accountSockets.get(auth.accountId);
    if (previous && previous !== socket)
      previous.close(4001, "Nova sessão iniciada.");
    const session = sessions.createSession(accounts.loadPlayer(auth.accountId));
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
        const intent = JSON.parse(raw.toString()) as ClientIntent;
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
    socket.on("close", () => {
      const entry = socketSessions.get(socket);
      if (entry) {
        entry.dirty = true;
        saveDirtyState("disconnect", true);
        socketSessions.delete(socket);
      }
      if (accountSockets.get(auth.accountId) === socket)
        accountSockets.delete(auth.accountId);
      sessions.destroySession(session.id);
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
server.listen(port, () =>
  console.log(`Authoritative authenticated game server listening on :${port}`),
);

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
