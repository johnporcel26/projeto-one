import { randomUUID } from "node:crypto";
import { GameSession } from "./GameSession.js";
import { AuctionService } from "./auction.js";
import { WalletService } from "./economy.js";
import { PlayerDomain, type PersistedPlayer } from "./domain.js";
import type { MarketSaleNotification } from "@onepiece/shared";
import type { PersistedMarket, PersistedMarketNotification } from "./auth-repository.js";

export type RuntimeSessionState = "ACTIVE" | "REPLACED" | "DISCONNECTED" | "LOGGED_OUT";
export type RuntimeSession = { sessionId: string; accountId?: string; playerId: string; createdAt: number; state: RuntimeSessionState };
type OfflinePlayer = { accountId: string; state: PersistedPlayer };

/** Owns the authoritative online-player registry and one-active-session policy. */
export class SessionManager {
  private readonly sessions = new Map<string, GameSession>();
  private readonly runtime = new Map<string, RuntimeSession>();
  private readonly activeByAccount = new Map<string, string>();
  private readonly activeByPlayer = new Map<string, string>();
  private readonly marketSales = new Map<string, MarketSaleNotification[]>();
  private readonly offlinePlayers = new Map<string, { accountId: string; player: PlayerDomain }>();
  private readonly pendingNotifications: PersistedMarketNotification[] = [];
  readonly wallets = new WalletService();
  readonly auction: AuctionService;
  constructor(
    private readonly onMarketMutation: () => void = () => undefined,
    private readonly offlinePlayerById?: (playerId: string) => OfflinePlayer | undefined,
  ) {
    this.auction = new AuctionService(this.wallets, (playerId) => this.resolvePlayer(playerId), (playerId, sale) => this.recordSale(playerId, sale), onMarketMutation);
  }
  hydrateMarket(state: PersistedMarket): void { this.auction.hydrate(state); }
  marketState(): PersistedMarket { return this.auction.persistentState(); }
  /** Creates an instanced GameSession and binds it to the authenticated account. */
  createSession(saved?: PersistedPlayer, accountId?: string): GameSession {
    if (accountId) this.replaceActiveSession(accountId);
    const session = new GameSession(randomUUID(), this.wallets, this.auction, saved);
    this.sessions.set(session.id, session);
    const meta: RuntimeSession = { sessionId: session.id, accountId, playerId: session.player.id, createdAt: Date.now(), state: "ACTIVE" };
    this.runtime.set(session.id, meta);
    if (accountId) this.activeByAccount.set(accountId, session.id);
    this.activeByPlayer.set(session.player.id, session.id);
    return session;
  }
  getSession(id: string): GameSession | undefined { return this.sessions.get(id); }
  getRuntimeSession(id: string): RuntimeSession | undefined { return this.runtime.get(id); }
  activeSessionForAccount(accountId: string): GameSession | undefined { const id = this.activeByAccount.get(accountId); return id ? this.sessions.get(id) : undefined; }
  isActive(id: string, accountId: string): boolean { const meta = this.runtime.get(id); return meta?.state === "ACTIVE" && meta.accountId === accountId && this.activeByAccount.get(accountId) === id; }
  /** Marks a prior session as replaced before its socket is closed. */
  replaceActiveSession(accountId: string): string | undefined {
    const previousId = this.activeByAccount.get(accountId);
    if (!previousId) return undefined;
    const previous = this.runtime.get(previousId);
    if (previous) previous.state = "REPLACED";
    this.activeByAccount.delete(accountId);
    if (previous?.playerId && this.activeByPlayer.get(previous.playerId) === previousId) this.activeByPlayer.delete(previous.playerId);
    return previousId;
  }
  findByPlayerId(playerId: string): GameSession | undefined { const id = this.activeByPlayer.get(playerId); return id ? this.sessions.get(id) : undefined; }
  private resolvePlayer(playerId: string): PlayerDomain | undefined {
    const online = this.findByPlayerId(playerId)?.player;
    if (online) return online;
    const cached = this.offlinePlayers.get(playerId);
    if (cached) return cached.player;
    const loaded = this.offlinePlayerById?.(playerId);
    if (!loaded) return undefined;
    const player = new PlayerDomain(loaded.state.id, loaded.state.name, loaded.state);
    this.offlinePlayers.set(playerId, { accountId: loaded.accountId, player });
    return player;
  }
  private recordSale(playerId: string, sale: MarketSaleNotification): void {
    if (this.findByPlayerId(playerId)) { this.marketSales.set(playerId, [...(this.marketSales.get(playerId) ?? []), sale]); return; }
    this.pendingNotifications.push({ playerId, sale, createdAt: Date.now() });
  }
  drainMarketSales(playerId: string): MarketSaleNotification[] { const sales = this.marketSales.get(playerId) ?? []; this.marketSales.delete(playerId); return sales; }
  queuePersistedSales(playerId: string, sales: readonly MarketSaleNotification[]): void { if (sales.length) this.marketSales.set(playerId, [...(this.marketSales.get(playerId) ?? []), ...sales]); }
  /** Offline states touched by marketplace settlement are persisted with the buyer transaction. */
  pendingOfflinePlayerStates(): { accountId: string; state: PersistedPlayer }[] { return [...this.offlinePlayers.values()].map(({ accountId, player }) => ({ accountId, state: player.persistentState() })); }
  pendingMarketNotifications(): readonly PersistedMarketNotification[] { return this.pendingNotifications; }
  markPendingMarketPersistenceSaved(): void { this.offlinePlayers.clear(); this.pendingNotifications.splice(0); }
  destroySession(id: string, state: Exclude<RuntimeSessionState, "ACTIVE"> = "DISCONNECTED"): void {
    const meta = this.runtime.get(id);
    if (meta) {
      meta.state = state;
      if (meta.accountId && this.activeByAccount.get(meta.accountId) === id) this.activeByAccount.delete(meta.accountId);
      if (this.activeByPlayer.get(meta.playerId) === id) this.activeByPlayer.delete(meta.playerId);
    }
    this.sessions.delete(id); this.runtime.delete(id);
  }
  values(): IterableIterator<GameSession> { return this.sessions.values(); }
  get size(): number { return this.sessions.size; }
}
