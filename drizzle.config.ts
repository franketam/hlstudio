import { defineConfig } from "drizzle-kit";
import * as fs from "node:fs";
import * as path from "node:path";

// drizzle-kit corre fuera de Next, así que cargamos .env.local manualmente si existe.
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && m[1] && !process.env[m[1]]) {
      process.env[m[1]] = m[2];
    }
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL no está seteada. Copiá .env.example a .env.local y configurala."
  );
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
