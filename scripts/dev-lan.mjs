import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const logDirectory = resolve(root, "logs");
const logFile = resolve(logDirectory, "project-one-lan.log");
mkdirSync(logDirectory, { recursive: true });

const write = (line) => {
  const message = `${new Date().toISOString()} ${line}\n`;
  process.stdout.write(message);
  appendFileSync(logFile, message);
};
const services = [
  ["SERVER", "npm run dev -w @onepiece/server"],
  ["CLIENT", "npm run dev -w @onepiece/client"],
  ["ADMIN", "npm run dev -w @onepiece/admin"],
];
const children = services.map(([name, command]) => {
  write(`[${name}] starting: ${command}`);
  const child = spawn(command, {
    cwd: root,
    env: { ...process.env, PROJECT_ONE_LAN: "true" },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: false,
  });
  for (const stream of [child.stdout, child.stderr])
    stream?.on("data", (chunk) =>
      String(chunk).split(/\r?\n/).filter(Boolean).forEach((line) => write(`[${name}] ${line}`)),
    );
  child.on("error", (error) => write(`[${name}] PROCESS ERROR ${error.message}`));
  child.on("exit", (code, signal) =>
    write(`[${name}] PROCESS EXIT code=${code ?? "null"} signal=${signal ?? "none"}`),
  );
  return child;
});

let stopping = false;
const stop = (signal) => {
  if (stopping) return;
  stopping = true;
  write(`[LAN] ${signal} received; stopping remaining services.`);
  children.forEach((child) => child.kill(signal));
};
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
write(`[LAN] logs: ${logFile}`);
