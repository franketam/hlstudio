/**
 * Genera el hash a guardar en ADMIN_PASSWORD_HASH.
 *
 * Uso:
 *   npx tsx scripts/hash-password.ts "tu-password-segura"
 *
 * Imprime la línea entera lista para pegar en .env.local. Los `$` salen
 * escapados como `\$` porque @next/env interpreta `$VAR` como interpolación
 * y rompe el hash si no se escapan.
 */
import { hashPassword } from "../lib/password";

async function main() {
  const password = process.argv[2];
  if (!password) {
    console.error('Uso: npx tsx scripts/hash-password.ts "tu-password"');
    process.exit(1);
  }
  const hash = await hashPassword(password);
  const escaped = hash.replace(/\$/g, "\\$");
  console.log(`ADMIN_PASSWORD_HASH=${escaped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
