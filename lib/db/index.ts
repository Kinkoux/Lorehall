import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

/**
 * Supabase Postgres via postgres-js. Schema DDL lives in
 * scripts/bootstrap-db.mjs (run once with `npm run db:bootstrap`).
 * `prepare: false` is required through the Supabase transaction pooler
 * (pgbouncer transaction mode does not support prepared statements).
 */
function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set — copy .env.example to .env.local (see DEPLOY.md)");
  }
  // The transaction pooler absorbs client connections cheaply; max > 1 lets
  // Promise.all'd page queries actually run concurrently on the wire.
  const client = postgres(url, {
    prepare: false,
    max: 8,
    idle_timeout: 20,
    connect_timeout: 15,
  });
  return drizzle(client, { schema });
}

// Cache on globalThis so Next.js dev-mode HMR doesn't open a new
// connection pool on every reload.
const globalForDb = globalThis as unknown as {
  __dndDb?: PostgresJsDatabase<typeof schema>;
};

function getDb() {
  if (!globalForDb.__dndDb) globalForDb.__dndDb = createDb();
  return globalForDb.__dndDb;
}

// Lazy proxy: `next build` imports route modules while collecting page
// data, and must not require DATABASE_URL — only real queries do.
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real as object, prop);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export * from "./schema";
