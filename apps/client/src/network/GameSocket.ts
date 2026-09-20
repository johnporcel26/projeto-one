import type { ClientIntent, GameSnapshot, ServerEvent } from "@onepiece/shared";
export class GameSocket {
  private socket?: WebSocket; private retry?: number; onSnapshot?: (snapshot: GameSnapshot) => void; onLog?: (message: string) => void;
  connect(): void { window.clearTimeout(this.retry); this.socket = new WebSocket("ws://localhost:8787"); this.socket.onopen = () => this.onLog?.("Servidor conectado."); this.socket.onmessage = (message) => { const event = JSON.parse(message.data) as ServerEvent; if (event.type === "snapshot") this.onSnapshot?.(event.payload); if (event.type === "log") this.onLog?.(event.message); }; this.socket.onclose = () => { this.onLog?.("Servidor desconectado. Tentando reconectar..."); this.retry = window.setTimeout(() => this.connect(), 1000); }; }
  intent(intent: ClientIntent): void { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(intent)); }
}
