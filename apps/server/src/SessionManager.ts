import { randomUUID } from "node:crypto";
import { GameSession } from "./GameSession.js";
import { AuctionService } from "./auction.js";
import { WalletService } from "./economy.js";

export class SessionManager {
  private readonly sessions = new Map<string, GameSession>();
  readonly wallets = new WalletService();
  readonly auction = new AuctionService(this.wallets, (playerId) => [...this.sessions.values()].find((session) => session.player.id === playerId)?.player);
  createSession(): GameSession { const session = new GameSession(randomUUID(), this.wallets, this.auction); this.sessions.set(session.id, session); return session; }
  getSession(id: string): GameSession | undefined { return this.sessions.get(id); }
  destroySession(id: string): void { this.sessions.delete(id); }
  values(): IterableIterator<GameSession> { return this.sessions.values(); }
  get size(): number { return this.sessions.size; }
}
