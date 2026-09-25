import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const root = resolve(__dirname, "../..");
const lanMode = process.env.PROJECT_ONE_LAN === "true";
/** Assets consumed by the browser live under the Vite public directory (`assets/`). */
export default defineConfig({
  plugins: [react()],
  publicDir: resolve(__dirname, "../../assets"),
  server: {
    host: lanMode ? "0.0.0.0" : "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: { allow: [root] },
  },
});
