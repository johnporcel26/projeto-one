import type {
  ClientIntent,
  GameSnapshot,
  MarketSaleNotification,
  ServerEvent,
} from "@onepiece/shared";
export class GameSocket {
  private socket?: WebSocket;
  private retry?: number;
  onSnapshot?: (snapshot: GameSnapshot) => void;
  onLog?: (message: string) => void;
  onMarketSale?: (sale: MarketSaleNotification) => void;
  onSessionReplaced?: (message: string) => void;
  private token?: string;
  private reconnect = true;
  connect(token: string): void {
    this.token = token;
    this.reconnect = true;
    window.clearTimeout(this.retry);
    this.socket = new WebSocket(
      `ws://localhost:8787?token=${encodeURIComponent(token)}`,
    );
    this.socket.onopen = () => this.onLog?.("Servidor conectado.");
    this.socket.onmessage = (message) => {
      const event = JSON.parse(message.data) as ServerEvent;
      if (event.type === "snapshot") this.onSnapshot?.(event.payload);
      if (event.type === "log") this.onLog?.(event.message);
      if (event.type === "marketSale") this.onMarketSale?.(event.payload);
      if (event.type === "sessionReplaced") {
        this.reconnect = false;
        this.onSessionReplaced?.(event.message);
      }
    };
    this.socket.onclose = () => {
      if (this.reconnect && this.token) {
        this.onLog?.("Servidor desconectado. Tentando reconectar...");
        this.retry = window.setTimeout(() => this.connect(this.token!), 1000);
      }
    };
  }
  disconnect(): void {
    this.reconnect = false;
    window.clearTimeout(this.retry);
    this.socket?.close();
    this.socket = undefined;
  }
  intent(intent: ClientIntent): void {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(intent));
  }
}
