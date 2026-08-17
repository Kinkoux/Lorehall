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
  const client = postgres(url, {
    prepare: false,
    max: process.env.NODE_ENV === "production" ? 1 : 5,
    connect_timeout: 15,
  });
  return drizzle(client, { schema });
}

// Cache on globalThis so Next.js dev-mode HMR doesn't open a new
// connection pool on every reload.
const globalForDb = globalThis as unknown as {
  __dndDb?: PostgresJsDatabase<typeof schema>;
};

export const db = globalForDb.__dndDb ?? createDb();
globalForDb.__dndDb = db;

export * from "./schema";
