import { useEffect, useMemo, useState } from "react";
import { fruitDefinitions, itemDefinitions } from "@onepiece/shared";
import { createRoot } from "react-dom/client";
import { GameCanvas } from "./game/GameCanvas";
import { bridge } from "./game/GameBridge";
import { GameSocket } from "./network/GameSocket";
import { serverApiUrl } from "./network/server-url";
import { Hud } from "./components/hud/Hud";
import { GameUiProvider, useGameUi } from "./ui/GameUiStore";
import { AuthGateway } from "./auth/AuthGateway";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "./theme/pirate-theme.css";
import "./styles.css";
import "./theme/pirate-hud.css";
const validate = async (token: string): Promise<boolean> => {
  try {
    const response = await fetch(serverApiUrl("/api/auth/validate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    return response.ok;
  } catch {
    return false;
  }
};
function GameApp({
  token,
  onLogout,
}: {
  token: string;
  onLogout: () => void;
}): JSX.Element {
  const socket = useMemo(() => new GameSocket(), []);
  const { setSnapshot, addLog } = useGameUi();
  useEffect(() => {
    socket.onSnapshot = (snapshot) => {
      for (const definition of snapshot.contentCatalog.items)
        itemDefinitions[definition.id] = definition;
      for (const definition of snapshot.contentCatalog.fruits)
        fruitDefinitions[definition.id] = definition;
      bridge.snapshot = snapshot;
      bridge.onSnapshot?.(snapshot);
      setSnapshot(snapshot);
    };
    socket.onLog = addLog;
    socket.onMarketSale = (sale) =>
      window.dispatchEvent(new CustomEvent("market-sale", { detail: sale }));
    socket.onSessionReplaced = (message) => {
      addLog(message);
      onLogout();
    };
    socket.connect(token);
    const listener = (event: Event) =>
      socket.intent((event as CustomEvent).detail);
    window.addEventListener("game-intent", listener);
    return () => {
      window.removeEventListener("game-intent", listener);
      socket.disconnect();
    };
  }, [socket, token, setSnapshot, addLog, onLogout]);
  return (
    <main className="game-app">
      <GameCanvas />
      <Hud
        onIntent={(intent) => socket.intent(intent as never)}
        onLogout={async () => {
          await fetch(serverApiUrl("/api/auth/logout"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          }).catch(() => undefined);
          onLogout();
        }}
      />
    </main>
  );
}
function Root(): JSX.Element {
  const [token, setToken] = useState<string | null>(null),
    [checked, setChecked] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("project-one-session");
    if (!saved) return setChecked(true);
    void validate(saved).then((valid) => {
      if (valid) setToken(saved);
      else localStorage.removeItem("project-one-session");
      setChecked(true);
    });
  }, []);
  const logout = () => {
    localStorage.removeItem("project-one-session");
    setToken(null);
  };
  if (!checked || !token) return <AuthGateway onAuthenticated={setToken} />;
  return (
    <GameUiProvider>
      <GameApp token={token} onLogout={logout} />
    </GameUiProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Root />);
