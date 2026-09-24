import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import {
  fruitDefinitions,
  itemDefinitions,
  type AuctionListingSnapshot,
  type AuctionOfferSnapshot,
} from "@onepiece/shared";
import type { PersistedPlayer } from "./domain.js";
import type { LedgerEntry } from "./economy.js";

const scrypt = promisify(scryptCallback);
export type Account = {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  createdAt: number;
  updatedAt: number;
};
export type AuthSession = {
  token: string;
  accountId: string;
  username: string;
  expiresAt: number;
};
export type PurchaseStatus =
  "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED";
export type PurchaseRecord = {
  id: string;
  accountId: string;
  packageId: string;
  rubies: number;
  priceCents: number;
  currency: "BRL";
  status: PurchaseStatus;
  provider: string;
  providerPaymentId: string;
  createdAt: number;
  paidAt: number | null;
  updatedAt: number;
};
const usernameRule = /^[A-Za-z0-9_-]{3,20}$/;

export type PersistedMarket = {
  listings: AuctionListingSnapshot[];
  offers: AuctionOfferSnapshot[];
};

export class AuthRepository {
  private readonly db: DatabaseSync;
  constructor(path = "data/alpha.sqlite") {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    this.migrate();
  }
  async register(
    username: string,
    email: string,
    password: string,
  ): Promise<
    { ok: true; session: AuthSession } | { ok: false; message: string }
  > {
    const name = username.trim();
    const normalizedEmail = email.trim().toLowerCase();
    if (!usernameRule.test(name))
      return {
        ok: false,
        message: "Use um nome de 3–20 caracteres: letras, números, _ ou -.",
      };
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail))
      return { ok: false, message: "Informe um e-mail válido." };
    if (password.length < 8)
      return { ok: false, message: "A senha deve ter ao menos 8 caracteres." };
    if (this.accountBy("username", name))
      return { ok: false, message: "Este nome de usuário já está em uso." };
    if (this.accountBy("email", normalizedEmail))
      return { ok: false, message: "Este e-mail já está cadastrado." };
    const now = Date.now();
    const id = randomBytes(18).toString("base64url");
    const account: Account = {
      id,
      username: name,
      email: normalizedEmail,
      passwordHash: await hashPassword(password),
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare("INSERT INTO accounts VALUES (?, ?, ?, ?, ?, ?)")
      .run(
        account.id,
        account.username,
        account.email,
        account.passwordHash,
        now,
        now,
      );
    const player: PersistedPlayer = {
      id: `player_${id}`,
      name,
      totalXp: 0,
      berries: 0,
      rubies: 0,
      inventory: [],
      storage: [],
      ownedFruitIds: [],
      activeFruitId: null,
      utilitySlots: [null, null],
      autoHuntSettings: {
        autoUseConsumables: false,
        hpPotionEnabled: true,
        hpThresholdPercent: 40,
        manaPotionEnabled: false,
        manaThresholdPercent: 30,
        potionPreference: "SMART",
        utilityMode: "AUTO",
        basicAttackEnabled: true,
        targetPriority: "NEAREST",
        skillPolicies: {},
      },
      discovery: { items: [], fruits: [], enemies: [], hunts: [] },
    };
    this.savePlayer(id, player);
    return { ok: true, session: this.createSession(account) };
  }
  async login(
    identity: string,
    password: string,
  ): Promise<
    { ok: true; session: AuthSession } | { ok: false; message: string }
  > {
    const account = this.accountBy(
      identity.includes("@") ? "email" : "username",
      identity.trim(),
    );
    if (!account || !(await verifyPassword(password, account.passwordHash)))
      return { ok: false, message: "Usuário ou senha inválidos." };
    return { ok: true, session: this.createSession(account) };
  }
  validate(token: string | null | undefined): AuthSession | undefined {
    if (!token) return undefined;
    const row = this.db
      .prepare(
        "SELECT s.token, s.account_id as accountId, a.username, s.expires_at as expiresAt FROM auth_sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token=? AND s.expires_at>? ",
      )
      .get(token, Date.now()) as AuthSession | undefined;
    return row;
  }
  logout(token: string): void {
    this.db.prepare("DELETE FROM auth_sessions WHERE token=?").run(token);
  }
  loadPlayer(accountId: string): PersistedPlayer | undefined {
    const row = this.db
      .prepare("SELECT state_json FROM players WHERE account_id=?")
      .get(accountId) as { state_json: string } | undefined;
    if (!row) return undefined;
    try {
      return sanitizePlayer(JSON.parse(row.state_json) as PersistedPlayer);
    } catch (error) {
      console.error(`[Persistence] Failed to load player ${accountId}:`, error);
      return undefined;
    }
  }
  savePlayer(accountId: string, state: PersistedPlayer): void {
    this.db
      .prepare(
        "INSERT INTO players (account_id,state_json,updated_at) VALUES (?,?,?) ON CONFLICT(account_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at",
      )
      .run(accountId, JSON.stringify(sanitizePlayer(state)), Date.now());
  }
  /** Atomically persists all durable state touched by an economy/market mutation. */
  saveRuntimeState(
    players: readonly { accountId: string; state: PersistedPlayer }[],
    market: PersistedMarket,
    ledger: readonly LedgerEntry[] = [],
  ): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const player of players) this.savePlayer(player.accountId, player.state);
      this.db.exec("DELETE FROM market_offers; DELETE FROM market_listings;");
      const listing = this.db.prepare(
        "INSERT INTO market_listings (id,seller_player_id,item_id,quantity,berries_price,rubies_price,allow_offers,status,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      );
      for (const entry of market.listings)
        listing.run(entry.id, entry.sellerId, entry.itemId, entry.quantity, entry.berriesPrice, entry.rubiesPrice, entry.allowOffers ? 1 : 0, entry.status, entry.createdAt, entry.expiresAt);
      const offer = this.db.prepare(
        "INSERT INTO market_offers (id,listing_id,buyer_player_id,currency,amount,status,created_at) VALUES (?,?,?,?,?,?,?)",
      );
      for (const entry of market.offers)
        offer.run(entry.id, entry.listingId, entry.buyerId, entry.currency, entry.amount, entry.status, entry.createdAt);
      const addLedger = this.db.prepare(
        "INSERT INTO economy_ledger (player_id,currency,amount,source,reference_id,created_at) VALUES (?,?,?,?,?,?)",
      );
      for (const entry of ledger)
        addLedger.run(entry.playerId, entry.currency, entry.amount, entry.source, entry.referenceId ?? null, entry.timestamp);
      this.db.exec("COMMIT");
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* transaction was not opened */ }
      throw error;
    }
  }
  loadMarket(): PersistedMarket {
    const listings = this.db.prepare(
      "SELECT id,seller_player_id as sellerId,item_id as itemId,quantity,berries_price as berriesPrice,rubies_price as rubiesPrice,allow_offers as allowOffers,status,created_at as createdAt,expires_at as expiresAt FROM market_listings",
    ).all() as unknown as AuctionListingSnapshot[];
    const offers = this.db.prepare(
      "SELECT id,listing_id as listingId,buyer_player_id as buyerId,currency,amount,status,created_at as createdAt FROM market_offers",
    ).all() as unknown as AuctionOfferSnapshot[];
    return {
      listings: listings.filter(isValidListing).map((entry) => ({ ...entry, allowOffers: Boolean(entry.allowOffers) })),
      offers: offers.filter(isValidOffer).map((entry) => ({ ...entry })),
    };
  }
  createPurchase(
    accountId: string,
    packageId: string,
    rubies: number,
    priceCents: number,
    provider: string,
  ): PurchaseRecord {
    const now = Date.now();
    const id = randomBytes(18).toString("base64url");
    const providerPaymentId = `${provider}_${randomBytes(18).toString("base64url")}`;
    this.db
      .prepare("INSERT INTO purchases VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(
        id,
        accountId,
        packageId,
        rubies,
        priceCents,
        "BRL",
        "PENDING",
        provider,
        providerPaymentId,
        now,
        null,
        now,
      );
    return {
      id,
      accountId,
      packageId,
      rubies,
      priceCents,
      currency: "BRL",
      status: "PENDING",
      provider,
      providerPaymentId,
      createdAt: now,
      paidAt: null,
      updatedAt: now,
    };
  }
  purchaseFor(
    accountId: string,
    purchaseId: string,
  ): PurchaseRecord | undefined {
    return this.db
      .prepare(
        "SELECT id,account_id as accountId,package_id as packageId,rubies,price_cents as priceCents,currency,status,provider,provider_payment_id as providerPaymentId,created_at as createdAt,paid_at as paidAt,updated_at as updatedAt FROM purchases WHERE id=? AND account_id=?",
      )
      .get(purchaseId, accountId) as PurchaseRecord | undefined;
  }
  markPurchasePaid(
    accountId: string,
    purchaseId: string,
  ): PurchaseRecord | undefined {
    const current = this.purchaseFor(accountId, purchaseId);
    if (!current || current.status !== "PENDING") return undefined;
    const now = Date.now();
    const result = this.db
      .prepare(
        "UPDATE purchases SET status='PAID', paid_at=?, updated_at=? WHERE id=? AND account_id=? AND status='PENDING'",
      )
      .run(now, now, purchaseId, accountId);
    return result.changes === 1
      ? { ...current, status: "PAID", paidAt: now, updatedAt: now }
      : undefined;
  }
  close(): void {
    this.db.close();
  }
  private migrate(): void {
    this.db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)");
    const applied = new Set(
      (this.db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map((row) => row.version),
    );
    const migrations: readonly [number, string][] = [
      [1, "CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS players (account_id TEXT PRIMARY KEY REFERENCES accounts(id), state_json TEXT NOT NULL, updated_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS auth_sessions (token TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS purchases (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), package_id TEXT NOT NULL, rubies INTEGER NOT NULL, price_cents INTEGER NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL, provider TEXT NOT NULL, provider_payment_id TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, paid_at INTEGER, updated_at INTEGER NOT NULL);"],
      [2, "CREATE TABLE IF NOT EXISTS market_listings (id TEXT PRIMARY KEY, seller_player_id TEXT NOT NULL, item_id TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0), berries_price INTEGER, rubies_price INTEGER, allow_offers INTEGER NOT NULL CHECK(allow_offers IN (0,1)), status TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS idx_market_listings_status ON market_listings(status); CREATE INDEX IF NOT EXISTS idx_market_listings_seller ON market_listings(seller_player_id); CREATE TABLE IF NOT EXISTS market_offers (id TEXT PRIMARY KEY, listing_id TEXT NOT NULL REFERENCES market_listings(id), buyer_player_id TEXT NOT NULL, currency TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0), status TEXT NOT NULL, created_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS idx_market_offers_listing ON market_offers(listing_id); CREATE INDEX IF NOT EXISTS idx_market_offers_buyer ON market_offers(buyer_player_id); CREATE TABLE IF NOT EXISTS economy_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL, currency TEXT NOT NULL, amount INTEGER NOT NULL, source TEXT NOT NULL, reference_id TEXT, created_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS idx_economy_ledger_player ON economy_ledger(player_id, created_at);"],
    ];
    for (const [version, sql] of migrations) {
      if (applied.has(version)) continue;
      this.db.exec("BEGIN IMMEDIATE");
      try {
        this.db.exec(sql);
        this.db.prepare("INSERT INTO schema_migrations (version,applied_at) VALUES (?,?)").run(version, Date.now());
        this.db.exec("COMMIT");
      } catch (error) {
        try { this.db.exec("ROLLBACK"); } catch { /* migration did not begin */ }
        throw new Error(`Database migration ${version} failed: ${String(error)}`);
      }
    }
  }
  private accountBy(
    field: "username" | "email",
    value: string,
  ): Account | undefined {
    const row = this.db
      .prepare(
        `SELECT id,username,email,password_hash as passwordHash,created_at as createdAt,updated_at as updatedAt FROM accounts WHERE ${field}=?`,
      )
      .get(value) as Account | undefined;
    return row;
  }
  private createSession(account: Account): AuthSession {
    const now = Date.now();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000;
    this.db
      .prepare("DELETE FROM auth_sessions WHERE account_id=? OR expires_at<?")
      .run(account.id, now);
    this.db
      .prepare("INSERT INTO auth_sessions VALUES (?,?,?,?)")
      .run(token, account.id, expiresAt, now);
    return {
      token,
      accountId: account.id,
      username: account.username,
      expiresAt,
    };
  }
}
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}
async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [algorithm, saltText, hashText] = stored.split("$");
  if (algorithm !== "scrypt" || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, "base64url");
  const actual = (await scrypt(
    password,
    Buffer.from(saltText, "base64url"),
    expected.length,
  )) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const validInteger = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0
    ? value
    : fallback;
const validStack = (entry: unknown): entry is { itemId: string; quantity: number } => {
  if (!entry || typeof entry !== "object") return false;
  const stack = entry as { itemId?: unknown; quantity?: unknown };
  return typeof stack.itemId === "string" && Boolean(itemDefinitions[stack.itemId]) && validInteger(stack.quantity) > 0;
};
const knownFruit = (id: unknown): id is keyof typeof fruitDefinitions =>
  typeof id === "string" && Boolean(fruitDefinitions[id]);
/** Guards legacy JSON rows before they hydrate a live player. Unknown content is warned and excluded, never crashes the server. */
function sanitizePlayer(state: PersistedPlayer): PersistedPlayer {
  const rawInventory = Array.isArray(state.inventory) ? state.inventory : [];
  const rawStorage = Array.isArray(state.storage) ? state.storage : [];
  const rawFruits = Array.isArray(state.ownedFruitIds) ? state.ownedFruitIds : [];
  const inventory = rawInventory.filter(validStack);
  const storage = rawStorage.filter(validStack);
  const ownedFruitIds = rawFruits.filter(knownFruit);
  if (inventory.length !== rawInventory.length || storage.length !== rawStorage.length || ownedFruitIds.length !== rawFruits.length)
    console.warn(`[Persistence] Ignored invalid or unknown references while loading ${state.id}.`);
  const activeFruitId = knownFruit(state.activeFruitId) && ownedFruitIds.includes(state.activeFruitId)
    ? state.activeFruitId
    : null;
  const slots = Array.isArray(state.utilitySlots) ? state.utilitySlots : [null, null];
  const utilitySlots: PersistedPlayer["utilitySlots"] = [
    typeof slots[0] === "string" && itemDefinitions[slots[0]] ? slots[0] : null,
    typeof slots[1] === "string" && itemDefinitions[slots[1]] ? slots[1] : null,
  ];
  return {
    ...state,
    totalXp: validInteger(state.totalXp),
    berries: validInteger(state.berries),
    rubies: validInteger(state.rubies),
    reservedBerries: Math.min(validInteger(state.berries), validInteger(state.reservedBerries)),
    reservedRubies: Math.min(validInteger(state.rubies), validInteger(state.reservedRubies)),
    inventory,
    storage,
    ownedFruitIds,
    activeFruitId,
    utilitySlots,
    lockedItemIds: (Array.isArray(state.lockedItemIds) ? state.lockedItemIds : []).filter((id): id is keyof typeof itemDefinitions => typeof id === "string" && Boolean(itemDefinitions[id])),
    autoHuntSettings: state.autoHuntSettings ?? {
      autoUseConsumables: false, hpPotionEnabled: true, hpThresholdPercent: 40,
      manaPotionEnabled: false, manaThresholdPercent: 30, potionPreference: "SMART",
      utilityMode: "AUTO", basicAttackEnabled: true, targetPriority: "NEAREST", skillPolicies: {},
    },
    discovery: state.discovery ?? { items: [], fruits: [], enemies: [], hunts: [] },
  };
}
const isValidListing = (entry: AuctionListingSnapshot): boolean =>
  Boolean(itemDefinitions[entry.itemId]) &&
  Number.isInteger(entry.quantity) && entry.quantity > 0 &&
  Number.isFinite(entry.createdAt) && Number.isFinite(entry.expiresAt) &&
  ["ACTIVE", "SOLD", "CANCELLED", "EXPIRED"].includes(entry.status);
const isValidOffer = (entry: AuctionOfferSnapshot): boolean =>
  Number.isInteger(entry.amount) && entry.amount > 0 &&
  ["BERRIES", "RUBIES"].includes(entry.currency) &&
  ["ACTIVE", "ACCEPTED", "REJECTED", "CANCELLED"].includes(entry.status);
