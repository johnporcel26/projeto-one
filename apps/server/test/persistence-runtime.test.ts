import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { WebSocket } from "ws";
import { AuthRepository } from "../src/auth-repository.js";

const waitFor = (predicate: () => boolean, timeout = 8_000): Promise<void> =>
  new Promise((resolve, reject) => {
    const until = Date.now() + timeout;
    const tick = () => predicate() ? resolve() : Date.now() > until ? reject(new Error("Timed out waiting for test server")) : setTimeout(tick, 25);
    tick();
  });

test("SIGTERM saves a dirty websocket player and a fresh server process reloads it", async () => {
  const folder = mkdtempSync(join(tmpdir(), "project-one-sigterm-"));
  const database = join(folder, "alpha.sqlite");
  const repository = new AuthRepository(database);
  let child: ReturnType<typeof spawn> | undefined;
  let socket: WebSocket | undefined;
  try {
    const registered = await repository.register("shutdownqa", "shutdownqa@test.local", "senha-segura");
    if (!registered.ok) return assert.fail(registered.message);
    const player = repository.loadPlayer(registered.session.accountId)!;
    player.berries = 100;
    repository.savePlayer(registered.session.accountId, player);
    const port = 18_000 + Math.floor(Math.random() * 1_000);
    const root = join(process.cwd(), "..", "..");
    const runner = "import './apps/server/src/index.ts'; process.on('message', (message) => { if (message === 'shutdown') process.emit('SIGTERM'); });";
    child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", runner], {
      cwd: root,
      env: { ...process.env, PORT: String(port), PROJECT_ONE_DB_PATH: database, DISABLE_CONTENT_ADMIN: "true" },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    let started = false;
    let processOutput = "";
    child.stdout?.on("data", (chunk) => { processOutput += chunk.toString(); if (chunk.toString().includes("listening")) started = true; });
    child.stderr?.on("data", (chunk) => { processOutput += chunk.toString(); });
    await waitFor(() => started).catch((error) => { throw new Error(`${error.message}: ${processOutput}`); });
    socket = new WebSocket(`ws://127.0.0.1:${port}/?token=${registered.session.token}`);
    await new Promise<void>((resolve, reject) => { socket!.once("open", resolve); socket!.once("error", reject); });
    socket.send(JSON.stringify({ type: "buyItem", itemId: "item_potion_small" }));
    await new Promise<void>((resolve, reject) => { socket!.once("message", () => resolve()); socket!.once("error", reject); });
    const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => child!.once("exit", (code, signal) => resolve({ code, signal })));
    child.send("shutdown");
    assert.deepEqual(await exit, { code: 0, signal: null });
    repository.close();
    const reopened = new AuthRepository(database);
    const saved = reopened.loadPlayer(registered.session.accountId)!;
    assert.equal(saved.inventory.find((stack) => stack.itemId === "item_potion_small")?.quantity, 1);
    reopened.close();
  } finally {
    socket?.close();
    if (child && child.exitCode === null) child.kill("SIGKILL");
    try { repository.close(); } catch { /* already reopened/closed */ }
    rmSync(folder, { recursive: true, force: true });
  }
});
