/**
 * E2E end-to-end de reserva contra producción (hlstudio.com.ar).
 *
 * IMPORTANTE: este test crea un turno REAL en la base de producción.
 * No hay teardown — el turno queda como evidencia del run.
 *
 * Datos del cliente sintético:
 *   nombre   = "E2E Smoke"
 *   teléfono = +5491166554433 (no real)
 *   email    = venturebytedigital@gmail.com (dueño del proyecto)
 *
 * Uso:
 *   npx playwright test e2e/booking-prod.spec.ts
 *   BASE=https://staging.hlstudio.com.ar npx playwright test e2e/booking-prod.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

const BASE = (process.env.BASE ?? "https://hlstudio.com.ar").replace(/\/$/, "");
const BARBERO_PREFERIDO = "Hugo"; // matchea "Hugo L." del seed
const SERVICIO_PREFERIDO = "Corte"; // matchea "Corte" (no "Corte y barba")
const CLIENTE = {
  nombre: "E2E Smoke",
  telefono: "+5491166554433",
  email: "venturebytedigital@gmail.com",
};

test.describe.configure({ mode: "serial" });

test("flow completo de reserva — paso 1 al 5 + landing en /turno/[token]", async ({ page }) => {
  test.setTimeout(90_000);

  // --- Paso 1: barbero ---
  await page.goto(`${BASE}/reservar`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/reservar$/);
  await expect(page.getByRole("heading", { name: /Elegí con quién/i })).toBeVisible();

  const barberoLink = page.locator(`a[href^="/reservar/servicio"]`, { hasText: BARBERO_PREFERIDO }).first();
  await expect(barberoLink, "Hugo debería estar en la lista de barberos").toBeVisible();
  await barberoLink.click();

  // --- Paso 2: servicio ---
  await page.waitForURL(/\/reservar\/servicio/);
  await expect(page.getByRole("heading", { name: /Elegí el servicio/i })).toBeVisible();

  // Elijo "Corte" — busco link cuyo texto matchee exactamente "Corte" (no "Corte y barba")
  const servicioLink = page.locator(`a[href^="/reservar/dia"]`).filter({
    has: page.locator("p.font-display", { hasText: new RegExp(`^${SERVICIO_PREFERIDO}$`) }),
  }).first();
  await expect(servicioLink, "Servicio 'Corte' debería estar disponible").toBeVisible();
  await servicioLink.click();

  // --- Paso 3: día y hora ---
  await page.waitForURL(/\/reservar\/dia/);
  await expect(page.getByRole("heading", { name: /Elegí día y hora/i })).toBeVisible();

  // El server-side ya selecciona el primer día con slots. Elegimos el primer slot disponible.
  const primerSlot = page.locator(`a[href^="/reservar/datos"]`).first();
  await expect(primerSlot, "Debería haber al menos un slot disponible en los próximos 14 días").toBeVisible({ timeout: 10_000 });

  const slotText = (await primerSlot.textContent())?.trim() ?? "?";
  console.log(`[e2e] slot elegido: ${slotText}`);
  await primerSlot.click();

  // --- Paso 4: datos del cliente ---
  await page.waitForURL(/\/reservar\/datos/);
  await expect(page.getByRole("heading", { name: /Tus datos/i })).toBeVisible();

  await page.getByLabel("Nombre y apellido").fill(CLIENTE.nombre);
  await page.getByLabel("Teléfono").fill(CLIENTE.telefono);
  await page.getByLabel("Email").fill(CLIENTE.email);

  await page.getByRole("button", { name: /Confirmar turno/i }).click();

  // --- Paso 5: landing del turno creado ---
  await page.waitForURL(/\/turno\/[^/]+/, { timeout: 30_000 });
  const turnoUrl = page.url();
  console.log(`[e2e] turno creado: ${turnoUrl}`);

  // Validaciones del contenido de la página de turno.
  // La UI saluda solo con el primer nombre (split por espacio), por eso
  // chequeamos contra `nombre.split(" ")[0]` y no contra el nombre completo.
  const bodyText = await page.locator("body").textContent();
  const primerNombre = CLIENTE.nombre.split(" ")[0];
  expect(bodyText, "Página /turno debe mencionar al cliente").toContain(primerNombre);
  expect(bodyText, "Página /turno debe mencionar al barbero").toContain(BARBERO_PREFERIDO);
  expect(bodyText, "Página /turno debe mencionar el servicio").toContain(SERVICIO_PREFERIDO);

  // El slot elegido en paso 3 debe coincidir con la hora mostrada acá.
  // (Regresión: alpine sin tzdata mostraba +3h respecto al slot.)
  expect(bodyText, `Hora mostrada debe coincidir con slot elegido (${slotText})`).toContain(slotText);

  // Debe tener el botón de cancelar (no clickeamos — el turno queda)
  await expect(page.getByRole("button", { name: /Cancelar/i }).or(page.getByRole("link", { name: /Cancelar/i }))).toBeVisible();

  // Banner de "turno creado" porque viene con ?nuevo=1
  expect(turnoUrl).toContain("nuevo=1");
});

test("admin login: rechaza credenciales inválidas", async ({ page }) => {
  await page.goto(`${BASE}/admin/login`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading")).toBeVisible();

  // Esperamos los inputs del LoginForm
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passInput = page.locator('input[type="password"]').first();
  await emailInput.fill("nope@example.com");
  await passInput.fill("password-incorrecto");
  await page.getByRole("button", { name: /Ingresar|Iniciar/i }).click();

  // Debería mostrar error y NO redirigir a /admin
  await page.waitForTimeout(2_000);
  await expect(page).toHaveURL(/\/admin\/login/);
});
