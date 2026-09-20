import { defineConfig } from "vite"; import react from "@vitejs/plugin-react"; import { resolve } from "node:path";
export default defineConfig({ plugins: [react()], publicDir: resolve(__dirname, "../../assets"), server: { fs: { allow: [resolve(__dirname, "../..")] } } });
