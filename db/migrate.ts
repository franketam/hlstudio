/**
 * Runner de migraciones. Uso:
 *   npx tsx db/migrate.ts
 *
 * Aplica los SQL files que están en ./drizzle/.
 * Pensado para correr local y en CI / Coolify post-deploy.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

// Cargar .env.local manualmente — este script corre fuera de Next.
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && m[1] && !process.env[m[1]]) {
      process.env[m[1]] = m[2];
    }
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL no está seteada.");
  }

  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql);

  console.log("[migrate] aplicando migraciones desde ./drizzle ...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[migrate] OK");

  await sql.end();
}

main().catch((err) => {
  console.error("[migrate] FAILED", err);
  process.exit(1);
});
