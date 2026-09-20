import { WebSocketServer, WebSocket } from "ws";
import type { ClientIntent, ServerEvent } from "@onepiece/shared";
import { SessionManager } from "./SessionManager.js";
import { startAdminApi } from "./admin-api.js";
import { ContentRepository } from "./content-repository.js";
import { applyContentRuntime } from "./domain.js";

const content = new ContentRepository();
const reloadContentRuntime = async (): Promise<void> => {
  applyContentRuntime(await content.read());
  console.info("[ContentRuntime] Validated content applied without resetting sessions.");
};
await reloadContentRuntime();
const sessions = new SessionManager();
startAdminApi(content, reloadContentRuntime);
const wss = new WebSocketServer({ port: 8787 });
const sockets = new Map<string, WebSocket>();

/** A socket is bound to exactly one isolated GameSession. No player state is broadcast globally. */
wss.on("connection", (socket) => {
  const session = sessions.createSession();
  sockets.set(session.id, socket);
  const send = (event: ServerEvent): void => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event)); };
  const publish = (): void => { for (const message of session.drainLogs()) send({ type: "log", message }); send({ type: "snapshot", payload: session.snapshot() }); };
  socket.on("message", (raw) => { try { session.handle(JSON.parse(raw.toString()) as ClientIntent); } catch { send({ type: "log", message: "Intent inválida ignorada pelo servidor." }); } publish(); });
  socket.on("close", () => { sockets.delete(session.id); sessions.destroySession(session.id); });
  publish();
});
setInterval(() => { for (const session of sessions.values()) { session.tick(); const socket = sockets.get(session.id); if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "snapshot", payload: session.snapshot() } satisfies ServerEvent)); } }, 300);
console.log("Authoritative WebSocket server listening on ws://localhost:8787");
