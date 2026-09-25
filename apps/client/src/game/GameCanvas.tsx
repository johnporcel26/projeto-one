import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { WorldScene } from "./WorldScene";
import { BuffaloPreviewScene } from "./BuffaloPreviewScene";

export function GameCanvas(): JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const log = (message: string, detail?: unknown) => {
      if (import.meta.env.DEV) console.info(`[Phaser Boot] ${message}`, detail ?? "");
    };
    const reportError = (event: ErrorEvent | PromiseRejectionEvent) =>
      console.error("[Phaser Boot] runtime error", event);
    window.addEventListener("error", reportError);
    window.addEventListener("unhandledrejection", reportError);
    const preview = new URLSearchParams(window.location.search).has("buffalo-preview");
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0 || !Number.isFinite(width + height))
        console.error("[Phaser Boot] invalid canvas host size", { width, height });
    });
    observer.observe(host.current);
    log("initializing", { width: host.current.clientWidth, height: host.current.clientHeight, dpr: window.devicePixelRatio });
    let game: Phaser.Game;
    try {
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: host.current,
        width: 960,
        height: 640,
        backgroundColor: "#152820",
        scene: preview ? [BuffaloPreviewScene] : [WorldScene],
        scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
      });
      game.scale.on("resize", (size: Phaser.Structs.Size) =>
        log("resize", { width: size.width, height: size.height }),
      );
    } catch (error) {
      console.error("[Phaser Boot] initialization failed", error);
      throw error;
    }
    return () => {
      observer.disconnect();
      window.removeEventListener("error", reportError);
      window.removeEventListener("unhandledrejection", reportError);
      game.destroy(true);
    };
  }, []);
  return <div className="game-canvas" ref={host} />;
}
