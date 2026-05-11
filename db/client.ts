import "server-only";

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";

/**
 * Cliente Postgres compartido entre server actions / route handlers.
 * En dev se cachea en globalThis para evitar abrir N conexiones cada HMR.
 */
declare global {
  // eslint-disable-next-line no-var
  var __pg__: ReturnType<typeof postgres> | undefined;
}

const queryClient =
  globalThis.__pg__ ??
  postgres(env.DATABASE_URL, {
    max: env.NODE_ENV === "production" ? 10 : 3,
    prepare: false,
  });

if (env.NODE_ENV !== "production") {
  globalThis.__pg__ = queryClient;
}

export const db = drizzle(queryClient, { schema });
export { schema };
