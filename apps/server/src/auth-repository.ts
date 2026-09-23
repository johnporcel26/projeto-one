import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import type { PersistedPlayer } from "./domain.js";

const scrypt = promisify(scryptCallback);
export type Account = { id: string; username: string; email: string; passwordHash: string; createdAt: number; updatedAt: number };
export type AuthSession = { token: string; accountId: string; username: string; expiresAt: number };
const usernameRule = /^[A-Za-z0-9_-]{3,20}$/;

export class AuthRepository {
  private readonly db: DatabaseSync;
  constructor(path = "data/alpha.sqlite") {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS players (account_id TEXT PRIMARY KEY, state_json TEXT NOT NULL, updated_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS auth_sessions (token TEXT PRIMARY KEY, account_id TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);");
  }
  async register(username: string, email: string, password: string): Promise<{ ok: true; session: AuthSession } | { ok: false; message: string }> {
    const name = username.trim(); const normalizedEmail = email.trim().toLowerCase();
    if (!usernameRule.test(name)) return { ok: false, message: "Use um nome de 3–20 caracteres: letras, números, _ ou -." };
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) return { ok: false, message: "Informe um e-mail válido." };
    if (password.length < 8) return { ok: false, message: "A senha deve ter ao menos 8 caracteres." };
    if (this.accountBy("username", name)) return { ok: false, message: "Este nome de usuário já está em uso." };
    if (this.accountBy("email", normalizedEmail)) return { ok: false, message: "Este e-mail já está cadastrado." };
    const now = Date.now(); const id = randomBytes(18).toString("base64url"); const account: Account = { id, username: name, email: normalizedEmail, passwordHash: await hashPassword(password), createdAt: now, updatedAt: now };
    this.db.prepare("INSERT INTO accounts VALUES (?, ?, ?, ?, ?, ?)").run(account.id, account.username, account.email, account.passwordHash, now, now);
    const player: PersistedPlayer = { id: `player_${id}`, name, totalXp: 0, berries: 0, rubies: 0, inventory: [], storage: [], ownedFruitIds: [], activeFruitId: null, utilitySlots: [null, null], autoHuntSettings: { autoUseConsumables: false, hpPotionEnabled: true, hpThresholdPercent: 40, manaPotionEnabled: false, manaThresholdPercent: 30, potionPreference: "SMART", utilityMode: "AUTO", basicAttackEnabled: true, targetPriority: "NEAREST", skillPolicies: {} }, discovery: { items: [], fruits: [], enemies: [], hunts: [] } };
    this.savePlayer(id, player); return { ok: true, session: this.createSession(account) };
  }
  async login(identity: string, password: string): Promise<{ ok: true; session: AuthSession } | { ok: false; message: string }> { const account = this.accountBy(identity.includes("@") ? "email" : "username", identity.trim()); if (!account || !(await verifyPassword(password, account.passwordHash))) return { ok: false, message: "Usuário ou senha inválidos." }; return { ok: true, session: this.createSession(account) }; }
  validate(token: string | null | undefined): AuthSession | undefined { if (!token) return undefined; const row = this.db.prepare("SELECT s.token, s.account_id as accountId, a.username, s.expires_at as expiresAt FROM auth_sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token=? AND s.expires_at>? ").get(token, Date.now()) as AuthSession | undefined; return row; }
  logout(token: string): void { this.db.prepare("DELETE FROM auth_sessions WHERE token=?").run(token); }
  loadPlayer(accountId: string): PersistedPlayer | undefined { const row = this.db.prepare("SELECT state_json FROM players WHERE account_id=?").get(accountId) as { state_json: string } | undefined; return row ? JSON.parse(row.state_json) as PersistedPlayer : undefined; }
  savePlayer(accountId: string, state: PersistedPlayer): void { this.db.prepare("INSERT INTO players (account_id,state_json,updated_at) VALUES (?,?,?) ON CONFLICT(account_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at").run(accountId, JSON.stringify(state), Date.now()); }
  close(): void { this.db.close(); }
  private accountBy(field: "username" | "email", value: string): Account | undefined { const row = this.db.prepare(`SELECT id,username,email,password_hash as passwordHash,created_at as createdAt,updated_at as updatedAt FROM accounts WHERE ${field}=?`).get(value) as Account | undefined; return row; }
  private createSession(account: Account): AuthSession { const now = Date.now(); const token = randomBytes(32).toString("base64url"); const expiresAt = now + 7 * 24 * 60 * 60 * 1000; this.db.prepare("DELETE FROM auth_sessions WHERE account_id=? OR expires_at<?").run(account.id, now); this.db.prepare("INSERT INTO auth_sessions VALUES (?,?,?,?)").run(token, account.id, expiresAt, now); return { token, accountId: account.id, username: account.username, expiresAt }; }
}
async function hashPassword(password: string): Promise<string> { const salt = randomBytes(16); const derived = await scrypt(password, salt, 64) as Buffer; return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`; }
async function verifyPassword(password: string, stored: string): Promise<boolean> { const [algorithm, saltText, hashText] = stored.split("$"); if (algorithm !== "scrypt" || !saltText || !hashText) return false; const expected = Buffer.from(hashText, "base64url"); const actual = await scrypt(password, Buffer.from(saltText, "base64url"), expected.length) as Buffer; return actual.length === expected.length && timingSafeEqual(actual, expected); }
