import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
const root = resolve(__dirname, "../..");
const introAssets = { "/intro/project-one-logo.png": resolve(root, "logo/logo-projetoone.png"), "/intro/project-one-background.png": resolve(root, "logo/background/808d948d-eff7-4e18-9b53-79417e3116a6.png") } as const;
const introAssetPlugin = (): Plugin => ({ name: "project-one-intro-assets", configureServer(server) { server.middlewares.use((request, response, next) => { const source = introAssets[(request.url ?? "").split("?")[0] as keyof typeof introAssets]; if (!source) return next(); response.setHeader("Content-Type", "image/png"); response.end(readFileSync(source)); }); }, generateBundle() { for (const [fileName, source] of Object.entries(introAssets)) this.emitFile({ type: "asset", fileName: fileName.slice(1), source: readFileSync(source) }); } });
export default defineConfig({ plugins: [react(), introAssetPlugin()], publicDir: resolve(__dirname, "../../assets"), server: { fs: { allow: [root] } } });
