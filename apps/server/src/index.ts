import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { ClientIntent, ServerEvent } from "@onepiece/shared";
import { SessionManager } from "./SessionManager.js";
import { startAdminApi } from "./admin-api.js";
import { ContentRepository } from "./content-repository.js";
import { applyContentRuntime } from "./domain.js";
import { AuthRepository } from "./auth-repository.js";

const content = new ContentRepository();
const reloadContentRuntime = async (): Promise<void> => { applyContentRuntime(await content.read()); console.info("[ContentRuntime] Validated content applied without resetting sessions."); };
await reloadContentRuntime();
const accounts = new AuthRepository(); const sessions = new SessionManager();
startAdminApi(content, reloadContentRuntime);
const rateLimits = new Map<string, { attempts: number; resetAt: number }>();
const accountSockets = new Map<string, WebSocket>(); const socketSessions = new Map<WebSocket, { accountId: string; sessionId: string; saved: string }>();
const respond = (response: ServerResponse, status: number, body: unknown) => { response.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "http://localhost:5173", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" }); response.end(JSON.stringify(body)); };
const readBody = async (request: IncomingMessage): Promise<Record<string, string>> => { let raw = ""; for await (const chunk of request) raw += chunk; try { return JSON.parse(raw) as Record<string, string>; } catch { return {}; } };
const limited = (request: IncomingMessage, action: string): boolean => { const key = `${action}:${request.socket.remoteAddress ?? "unknown"}`; const now = Date.now(); const entry = rateLimits.get(key) ?? { attempts: 0, resetAt: now + 60_000 }; if (now > entry.resetAt) { entry.attempts = 0; entry.resetAt = now + 60_000; } entry.attempts += 1; rateLimits.set(key, entry); return entry.attempts > 8; };
const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") return respond(response, 204, {});
  if (request.method !== "POST" || !request.url?.startsWith("/api/auth/")) return respond(response, 404, { ok: false, message: "Não encontrado." });
  const action = request.url.slice("/api/auth/".length); if (limited(request, action)) return respond(response, 429, { ok: false, message: "Tente novamente em instantes." }); const input = await readBody(request);
  if (action === "register") { const result = await accounts.register(input.username ?? "", input.email ?? "", input.password ?? ""); return respond(response, result.ok ? 201 : 400, result); }
  if (action === "login") { const result = await accounts.login(input.identity ?? "", input.password ?? ""); return respond(response, result.ok ? 200 : 401, result); }
  if (action === "validate") { const session = accounts.validate(input.token); return respond(response, session ? 200 : 401, session ? { ok: true, session } : { ok: false }); }
  if (action === "logout") { if (input.token) accounts.logout(input.token); return respond(response, 200, { ok: true }); }
  return respond(response, 404, { ok: false, message: "Não encontrado." });
});
const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (request, socket, head) => { const token = new URL(request.url ?? "/", "http://localhost").searchParams.get("token"); const auth = accounts.validate(token); if (!auth) return socket.destroy(); wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, auth)); });
wss.on("connection", (socket, auth: NonNullable<ReturnType<AuthRepository["validate"]>>) => {
  const previous = accountSockets.get(auth.accountId); if (previous && previous !== socket) previous.close(4001, "Nova sessão iniciada.");
  const session = sessions.createSession(accounts.loadPlayer(auth.accountId)); accountSockets.set(auth.accountId, socket); socketSessions.set(socket, { accountId: auth.accountId, sessionId: session.id, saved: JSON.stringify(session.persistentState()) });
  const send = (event: ServerEvent) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event)); };
  const publish = () => { for (const message of session.drainLogs()) send({ type: "log", message }); send({ type: "snapshot", payload: session.snapshot() }); };
  socket.on("message", (raw) => { try { session.handle(JSON.parse(raw.toString()) as ClientIntent); } catch { send({ type: "log", message: "Intent inválida ignorada pelo servidor." }); } publish(); });
  socket.on("close", () => { const entry = socketSessions.get(socket); if (entry) { accounts.savePlayer(entry.accountId, session.persistentState()); socketSessions.delete(socket); } if (accountSockets.get(auth.accountId) === socket) accountSockets.delete(auth.accountId); sessions.destroySession(session.id); }); publish();
});
const tick = () => { for (const session of sessions.values()) { session.tick(); const pair = [...socketSessions.entries()].find(([, entry]) => entry.sessionId === session.id); if (!pair) continue; const [socket, entry] = pair; const state = JSON.stringify(session.persistentState()); if (state !== entry.saved) { accounts.savePlayer(entry.accountId, session.persistentState()); entry.saved = state; } if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "snapshot", payload: session.snapshot() } satisfies ServerEvent)); } };
setInterval(tick, 45_000); setInterval(() => { for (const session of sessions.values()) { session.tick(); const pair = [...socketSessions.entries()].find(([, entry]) => entry.sessionId === session.id); if (pair?.[0].readyState === WebSocket.OPEN) pair[0].send(JSON.stringify({ type: "snapshot", payload: session.snapshot() } satisfies ServerEvent)); } }, 300);
server.listen(8787, () => console.log("Authoritative authenticated game server listening on :8787"));
