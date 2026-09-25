/**
 * Resolves the authoritative game server from the page that loaded the client.
 * Explicit Vite values remain useful for proxies and non-standard environments.
 */
const withoutTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const pageHost = (): string => window.location.hostname || "localhost";
const pageProtocol = (): "http:" | "https:" =>
  window.location.protocol === "https:" ? "https:" : "http:";

export const serverHttpUrl = (): string => {
  const configured = import.meta.env.VITE_SERVER_URL?.trim();
  return configured
    ? withoutTrailingSlash(configured)
    : `${pageProtocol()}//${pageHost()}:8787`;
};

export const serverWebSocketUrl = (): string => {
  const configured = import.meta.env.VITE_WS_URL?.trim();
  if (configured) return withoutTrailingSlash(configured);
  const protocol = pageProtocol() === "https:" ? "wss:" : "ws:";
  return `${protocol}//${pageHost()}:8787`;
};

export const serverApiUrl = (path: string): string => `${serverHttpUrl()}${path}`;
