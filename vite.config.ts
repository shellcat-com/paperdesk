import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const contentSecurityPolicy =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://cdn.jsdelivr.net https://tessdata.projectnaptha.com; object-src 'none'; base-uri 'self'; form-action 'none'";

export default defineConfig(({ command, isPreview }) => ({
  base: command === "serve" && !isPreview ? "/" : "/paperdesk/",
  plugins: [
    react(),
    {
      name: "static-document-security",
      apply: "build",
      transformIndexHtml() {
        return [
          {
            tag: "meta",
            attrs: {
              "http-equiv": "Content-Security-Policy",
              content: contentSecurityPolicy,
            },
            injectTo: "head-prepend",
          },
        ];
      },
    },
  ],
  build: { chunkSizeWarningLimit: 1800 },
  server: { port: 5178, strictPort: true },
}));
