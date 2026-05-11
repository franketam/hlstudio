/**
 * Smoke test contra producción (hlstudio.com.ar por defecto).
 *
 * No es destructivo: solo hace GETs y valida códigos + contenido HTML.
 * No crea turnos ni manda emails. Para flow real end-to-end mirá Playwright
 * (scripts/e2e-prod.mjs — opcional).
 *
 * Uso:
 *   node scripts/smoke-prod.mjs
 *   node scripts/smoke-prod.mjs https://staging.hlstudio.com.ar
 */

const BASE = (process.argv[2] || "https://hlstudio.com.ar").replace(/\/$/, "");

let pass = 0;
let fail = 0;
const failures = [];

const C = {
  ok: "\x1b[32m✓\x1b[0m",
  no: "\x1b[31m✗\x1b[0m",
  dim: (s) => `\x1b[90m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function check(label, condition, detail = "") {
  if (condition) {
    pass++;
    console.log(`  ${C.ok} ${label}${detail ? " " + C.dim(detail) : ""}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  ${C.no} ${label}${detail ? " " + C.dim(detail) : ""}`);
  }
}

async function get(path, { redirect = "manual" } = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { redirect, headers: { "user-agent": "hlstudio-smoke/1.0" } });
  const body = res.status < 300 ? await res.text() : "";
  return { url, status: res.status, body, location: res.headers.get("location") };
}

console.log(C.bold(`\nSmoke test → ${BASE}\n`));

// 1. Health
console.log(C.bold("[1] Health endpoint"));
{
  const r = await get("/api/health", { redirect: "follow" });
  check("/api/health responde 200", r.status === 200, `status=${r.status}`);
  let json = null;
  try { json = JSON.parse(r.body); } catch { /* */ }
  check("/api/health devuelve JSON con ok:true", json?.ok === true, json ? JSON.stringify(json) : "no JSON");
}

// 2. Landing
console.log(C.bold("\n[2] Landing pública"));
{
  const r = await get("/", { redirect: "follow" });
  check("/ responde 200", r.status === 200, `status=${r.status}`);
  check("/ menciona Hugo (barbero seed)", r.body.includes("Hugo"));
  check("/ menciona Leonel (barbero seed)", r.body.includes("Leonel"));
  check("/ tiene CTA a /reservar", /href="\/reservar/.test(r.body));
}

// 3. Flow de reserva (paso 1: barberos)
console.log(C.bold("\n[3] Reserva — paso 1 (barberos)"));
{
  const r = await get("/reservar", { redirect: "follow" });
  check("/reservar responde 200", r.status === 200, `status=${r.status}`);
  check("/reservar carga lista de barberos (no vacío)", !r.body.includes("Por ahora no hay barberos activos"));
  check("/reservar tiene a Hugo", r.body.includes("Hugo"));
  check("/reservar tiene a Leonel", r.body.includes("Leonel"));
  check("/reservar tiene link a paso 2 (?barbero=)", /href="\/reservar\/servicio\?barbero=/.test(r.body));
}

// 4. Pasos posteriores sin query → redirect a paso 1
console.log(C.bold("\n[4] Pasos protegidos del flow (sin query → redirect)"));
for (const p of ["/reservar/servicio", "/reservar/dia", "/reservar/datos"]) {
  const r = await get(p);
  check(`GET ${p} redirige a paso anterior`, r.status === 307 || r.status === 308, `status=${r.status} → ${r.location ?? ""}`);
}

// 5. Admin
console.log(C.bold("\n[5] Admin"));
{
  const r = await get("/admin/login", { redirect: "follow" });
  check("/admin/login responde 200", r.status === 200, `status=${r.status}`);
  check("/admin/login tiene form de login", /<form/i.test(r.body) && /password/i.test(r.body));
}
for (const p of ["/admin", "/admin/agenda"]) {
  const r = await get(p);
  check(`GET ${p} sin sesión redirige`, r.status === 307 || r.status === 308, `status=${r.status} → ${r.location ?? ""}`);
  check(`GET ${p} redirige a /admin/login`, r.location?.includes("/admin/login"), `location=${r.location ?? ""}`);
}

// 6. Token de cancelación inválido — debe responder con página de error gentil, no 500
console.log(C.bold("\n[6] /turno/[token] con token inválido"));
{
  const r = await get("/turno/token-invalido.123.fake", { redirect: "follow" });
  check("/turno/<bad-token> no devuelve 500", r.status !== 500, `status=${r.status}`);
}

// Resumen
console.log("");
console.log(C.bold(`Resultado: ${pass} passed, ${fail} failed`));
if (fail > 0) {
  console.log("\nFalló:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
