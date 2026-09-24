import { randomUUID } from "node:crypto";
import { GameSession } from "./GameSession.js";
import { AuctionService } from "./auction.js";
import { WalletService } from "./economy.js";
import type { PersistedPlayer } from "./domain.js";
import type { MarketSaleNotification } from "@onepiece/shared";
import type { PersistedMarket } from "./auth-repository.js";

export class SessionManager {
  private readonly sessions = new Map<string, GameSession>();
  private readonly marketSales = new Map<string, MarketSaleNotification[]>();
  readonly wallets = new WalletService();
  readonly auction: AuctionService;
  constructor(onMarketMutation: () => void = () => undefined) {
    this.auction = new AuctionService(
      this.wallets,
      (playerId) => this.findByPlayerId(playerId)?.player,
      (playerId, sale) =>
        this.marketSales.set(playerId, [
          ...(this.marketSales.get(playerId) ?? []),
          sale,
        ]),
      onMarketMutation,
    );
  }
  hydrateMarket(state: PersistedMarket): void {
    this.auction.hydrate(state);
  }
  marketState(): PersistedMarket {
    return this.auction.persistentState();
  }
  createSession(saved?: PersistedPlayer): GameSession {
    const session = new GameSession(
      randomUUID(),
      this.wallets,
      this.auction,
      saved,
    );
    this.sessions.set(session.id, session);
    return session;
  }
  getSession(id: string): GameSession | undefined {
    return this.sessions.get(id);
  }
  findByPlayerId(playerId: string): GameSession | undefined {
    return [...this.sessions.values()].find(
      (session) => session.player.id === playerId,
    );
  }
  drainMarketSales(playerId: string): MarketSaleNotification[] {
    const sales = this.marketSales.get(playerId) ?? [];
    this.marketSales.delete(playerId);
    return sales;
  }
  destroySession(id: string): void {
    this.sessions.delete(id);
  }
  values(): IterableIterator<GameSession> {
    return this.sessions.values();
  }
  get size(): number {
    return this.sessions.size;
  }
}
