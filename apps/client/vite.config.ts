import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const root = resolve(__dirname, "../..");
/** Assets consumed by the browser live under the Vite public directory (`assets/`). */
export default defineConfig({ plugins: [react()], publicDir: resolve(__dirname, "../../assets"), server: { fs: { allow: [root] } } });
