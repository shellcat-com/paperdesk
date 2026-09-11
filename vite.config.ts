import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import deployment from "./vercel.json";

const headers = Object.fromEntries(
  deployment.headers[0].headers.map(({ key, value }) => [key, value]),
);
export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1800 },
  server: { port: 5178, strictPort: true },
  preview: { headers },
});
