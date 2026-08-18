import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Project root with forward slashes, so aliases resolve the same on Windows. */
const root = fileURLToPath(new URL(".", import.meta.url)).replace(/\\/g, "/");
const stub = (name: string) => `${root}test/stubs/${name}.ts`;

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Every file boots its own WASM Postgres and replays the bootstrap DDL;
    // the 5s default is not enough for that on a cold start.
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: [
      // Next resolves these itself at build time; outside of Next they either
      // do not exist on disk (`server-only`) or need a request to be useful.
      { find: "server-only", replacement: stub("server-only") },
      { find: "next/cache", replacement: stub("next-cache") },
      { find: "next/headers", replacement: stub("next-headers") },
      { find: "next/navigation", replacement: stub("next-navigation") },
      // Mirrors the `@/*` path mapping in tsconfig.json.
      { find: /^@\/(.*)$/, replacement: `${root}$1` },
    ],
  },
});
