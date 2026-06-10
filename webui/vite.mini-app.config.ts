// Separate Vite config for the mini-app iframe runtime (see
// mini-app-archi.md §6). The runtime lives at a different origin
// (different port in dev, different subdomain in prod) so the browser
// treats it as cross-origin from the host bundle — that's the
// load-bearing security primitive.
//
// In dev: two Vite servers, the host on $APP_PORT and the runtime on
// $MINI_APP_PORT, both spun up by separate `npm run` scripts.
// In prod: this config's build output is deployed under
// $VITE_MINI_APP_ORIGIN.

import path from "path"

import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react-swc"
import { defineConfig, type Plugin } from "vite"


/**
 * Swap CSP directives at index.html serve/build time. The meta-tag in the
 * HTML uses {{CSP_CONNECT_SRC}} / {{CSP_SCRIPT_SRC}} placeholders so dev
 * builds can allow Vite's HMR WebSocket without leaving prod open.
 *
 * - dev (`server` defined): allow `ws:` + `'self'` so Vite HMR connects.
 * - prod build: tighten to `'none'` — the iframe must not reach any
 *   network endpoint, period.
 */
function miniAppCspPlugin(): Plugin {
  return {
    name: "mini-app-csp",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const isDev = Boolean(ctx.server)
        const connectSrc = isDev ? "'self' ws: wss:" : "'none'"
        return html
          .replace("{{CSP_CONNECT_SRC}}", connectSrc)
      },
    },
  }
}


export default defineConfig({
  root: path.resolve(__dirname, "mini-app-runtime"),
  plugins: [react(), tailwindcss(), miniAppCspPlugin()],
  resolve: {
    alias: {
      // The runtime will pull a curated subset of host components into
      // its bundle (Card, Button, Chart, ...). They share source via
      // the same `@/...` alias; tree-shaking + a small SCOPE registry
      // keeps the bundle lean.
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: Number(process.env.MINI_APP_PORT) || 5174,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.MINI_APP_PORT) || 5174,
    strictPort: true,
  },
  build: {
    outDir: path.resolve(__dirname, "dist-mini-app"),
    emptyOutDir: true,
  },
})
