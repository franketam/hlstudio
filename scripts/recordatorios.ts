/**
 * Barrido de recordatorios. Hoy solo corre T-3h.
 *
 * El recordatorio del día antes (T-24h) fue DESACTIVADO a pedido del cliente
 * (jul-2026): el bot ya no avisa el día anterior, únicamente ~3h antes del turno.
 * La maquinaria del T-24h (template, ventana, tipo) queda en el código por si se
 * quiere reactivar; para hacerlo, volver a incluir "24h" en `tipos` en `main()`.
 *
 * Uso:
 *   node scripts/recordatorios.mjs                     # corre solo T-3h
 *   node scripts/recordatorios.mjs --tipo=3h           # solo 3h (acepta --tipo=2h como alias legado)
 *   node scripts/recordatorios.mjs --tipo=24h          # NO-OP: T-24h desactivado, no envía nada
 *   node scripts/recordatorios.mjs --dry-run           # detecta candidatos pero NO envía ni marca
 *
 * En local también funciona con `tsx`:
 *   npx tsx scripts/recordatorios.ts --tipo=3h --dry-run
 *
 * Output: JSON-line logs a stdout. Coolify los captura y quedan en su panel.
 *
 * Idempotencia: cada par (turno_id, tipo) tiene unique constraint en
 * `notificaciones_enviadas`. El claim atómico (`INSERT ... ON CONFLICT DO NOTHING`)
 * garantiza que si dos invocaciones corren en paralelo, sólo una manda el email.
 *
 * Convención de exit codes:
 *   0 — corrió bien (cero errores transitorios)
 *   1 — hubo errores transitorios (vale la pena que el cron re-ejecute pronto,
 *       aunque igual lo va a hacer en el próximo tick)
 *   2 — error fatal de arranque (env, DB, etc.)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import {
  findCandidatos,
  procesarCandidato,
  type ProcesarResultado,
} from "@/server/email/send-recordatorio";
import type { RecordatorioTipo } from "@/server/email/templates/recordatorio-cliente";

// Cargar .env.local manualmente (corre fuera de Next).
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && m[1] && !process.env[m[1]]) {
      process.env[m[1]] = m[2];
    }
  }
}

type Args = {
  tipo: RecordatorioTipo | "all";
  dryRun: boolean;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { tipo: "all", dryRun: false };
  for (const a of argv.slice(2)) {
    if (a === "--dry-run") {
      out.dryRun = true;
    } else if (a.startsWith("--tipo=")) {
      const v = a.slice("--tipo=".length);
      if (v === "3h") {
        out.tipo = v;
      } else if (v === "2h") {
        // Alias legado: el recordatorio corto pasó de T-2h a T-3h (jul-2026).
        // Se acepta para no romper crons ya configurados con --tipo=2h.
        out.tipo = "3h";
      } else if (v === "24h") {
        // El recordatorio del día antes (T-24h) fue desactivado a pedido del
        // cliente (jul-2026). Si un cron viejo sigue invocando --tipo=24h,
        // no hace nada y sale limpio (sin enviar) en vez de romper.
        log("warn", "recordatorio T-24h desactivado (pedido cliente): no se envia nada", { arg: a });
        process.exit(0);
      } else {
        log("error", "argumento invalido", { arg: a });
        process.exit(2);
      }
    } else {
      log("error", "argumento desconocido", { arg: a });
      process.exit(2);
    }
  }
  return out;
}

function log(
  level: "info" | "warn" | "error",
  msg: string,
  extra: Record<string, unknown> = {}
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...extra,
  });
  // stdout para info, stderr para warn/error → más fácil de tail en Coolify.
  if (level === "info") {
    console.log(line);
  } else {
    console.error(line);
  }
}

async function correrTipo(
  db: ReturnType<typeof drizzle<typeof schema>>,
  tipo: RecordatorioTipo,
  args: Args,
  appUrl: string
): Promise<{
  processed: number;
  sent: number;
  skippedNoEmail: number;
  claimLost: number;
  errorsPermanentes: number;
  errorsTransitorios: number;
  errorsInternos: number;
}> {
  const now = new Date();
  log("info", "buscando candidatos", { tipo, now: now.toISOString() });

  const candidatos = await findCandidatos(db, tipo, now);
  log("info", "candidatos encontrados", { tipo, count: candidatos.length });

  const counts = {
    processed: 0,
    sent: 0,
    skippedNoEmail: 0,
    claimLost: 0,
    errorsPermanentes: 0,
    errorsTransitorios: 0,
    errorsInternos: 0,
  };

  for (const cand of candidatos) {
    counts.processed++;
    let res: ProcesarResultado;
    try {
      res = await procesarCandidato(db, cand, tipo, {
        dryRun: args.dryRun,
        appUrl,
      });
    } catch (err) {
      // procesarCandidato ya captura sus errores, pero por las dudas.
      counts.errorsInternos++;
      log("error", "excepcion al procesar candidato", {
        turnoId: cand.turnoId,
        tipo,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (res.ok) {
      counts.sent++;
      log("info", args.dryRun ? "dry-run: enviaria" : "enviado", {
        turnoId: res.turnoId,
        tipo,
        canal: res.canal,
        providerId: res.providerId,
        cliente: cand.clienteEmail,
        inicio: cand.inicio.toISOString(),
      });
    } else {
      switch (res.code) {
        case "skipped_no_email":
        case "skipped_sin_destinatario":
          counts.skippedNoEmail++;
          log("warn", "skip: cliente sin destinatario", {
            turnoId: res.turnoId,
            tipo,
            canal: res.canal,
            inicio: cand.inicio.toISOString(),
          });
          break;
        case "claim_lost":
          counts.claimLost++;
          log("info", "skip: claim perdido (lo agarro otro proceso)", {
            turnoId: res.turnoId,
            tipo,
            canal: res.canal,
          });
          break;
        case "send_failed_permanente":
          counts.errorsPermanentes++;
          log("warn", "envio fallo permanente (no reintenta)", {
            turnoId: res.turnoId,
            tipo,
            canal: res.canal,
            detail: res.detail,
          });
          break;
        case "send_failed_transitorio":
          counts.errorsTransitorios++;
          log("error", "envio fallo transitorio (se reintenta proximo barrido)", {
            turnoId: res.turnoId,
            tipo,
            canal: res.canal,
            detail: res.detail,
          });
          break;
        case "internal_error":
          counts.errorsInternos++;
          log("error", "error interno", {
            turnoId: res.turnoId,
            tipo,
            canal: res.canal,
            detail: res.detail,
          });
          break;
      }
    }
  }

  log("info", "resumen tipo", { tipo, ...counts });
  return counts;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv);

  const url = process.env.DATABASE_URL;
  if (!url) {
    log("error", "DATABASE_URL no esta seteada");
    return 2;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!process.env.RESEND_API_KEY && !args.dryRun) {
    log("warn", "RESEND_API_KEY vacia: los envios devolveran no_api_key y se trataran como transitorios");
  }

  const sql = postgres(url, { max: 2 });
  const db = drizzle(sql, { schema });

  let exitCode = 0;
  // T-24h desactivado (pedido cliente jul-2026): el barrido por default solo
  // corre T-3h. Para reactivar el recordatorio del día antes, agregar "24h" acá.
  const tipos: RecordatorioTipo[] =
    args.tipo === "all" ? ["3h"] : [args.tipo];

  log("info", "inicio barrido", {
    tipos,
    dryRun: args.dryRun,
    appUrl,
  });

  const totales = {
    processed: 0,
    sent: 0,
    skippedNoEmail: 0,
    claimLost: 0,
    errorsPermanentes: 0,
    errorsTransitorios: 0,
    errorsInternos: 0,
  };

  try {
    for (const tipo of tipos) {
      const c = await correrTipo(db, tipo, args, appUrl);
      totales.processed += c.processed;
      totales.sent += c.sent;
      totales.skippedNoEmail += c.skippedNoEmail;
      totales.claimLost += c.claimLost;
      totales.errorsPermanentes += c.errorsPermanentes;
      totales.errorsTransitorios += c.errorsTransitorios;
      totales.errorsInternos += c.errorsInternos;
    }
  } catch (err) {
    log("error", "excepcion fatal", {
      error: err instanceof Error ? err.message : String(err),
    });
    exitCode = 2;
  } finally {
    await sql.end();
  }

  log("info", "fin barrido", totales);

  if (exitCode === 0 && (totales.errorsTransitorios > 0 || totales.errorsInternos > 0)) {
    exitCode = 1;
  }

  return exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    log("error", "main rejected", {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(2);
  });
