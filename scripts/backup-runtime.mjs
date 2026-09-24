import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

const source = join("data", "alpha.sqlite");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const destination = join("data", "backups", `project-one-${timestamp}.sqlite`);

try {
  await stat(source);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  console.info(`[Backup] Runtime database copied to ${destination}`);
} catch (error) {
  console.error("[Backup] Failed. Stop the server first if SQLite reports a lock.", error);
  process.exitCode = 1;
}
