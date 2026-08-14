/**
 * Lectura de user-agent. Módulo puro y sin imports a propósito: lo usa el
 * server para loguear y lo puede usar el panel admin para mostrar el origen de
 * un turno, sin arrastrar `server-only`.
 *
 * ADVERTENCIA: el user-agent lo declara el cliente y se falsifica escribiendo
 * una línea. Sirve para agrupar y para detectar al que ni siquiera se molesta
 * en disimular, NO como prueba de nada.
 */

/** Firmas de clientes no-navegador. Ninguna persona reserva con esto. */
const FIRMAS_AUTOMATIZADAS = [
  "curl/",
  "wget/",
  "python-requests",
  "python-urllib",
  "go-http-client",
  "java/",
  "okhttp",
  "axios/",
  "node-fetch",
  "undici",
  "postmanruntime",
  "headlesschrome",
  "phantomjs",
  "puppeteer",
  "playwright",
  "scrapy",
  "bot",
  "spider",
  "crawler",
];

export function pareceAutomatizado(ua: string | null): boolean {
  if (!ua) return true; // Un navegador real siempre manda user-agent.
  const s = ua.toLowerCase();
  return FIRMAS_AUTOMATIZADAS.some((f) => s.includes(f));
}

/**
 * Etiqueta corta: "<navegador> <versión mayor> · <sistema>".
 *
 * Heurística deliberadamente chica, sin dependencias. No cubre todos los casos
 * ni lo pretende — si no matchea nada conocido devuelve "Desconocido" y el UA
 * crudo queda guardado igual en `turnos.creado_user_agent`.
 */
export function describirUserAgent(ua: string | null): string {
  if (!ua) return "sin user-agent";

  const navegador = detectarNavegador(ua);
  const sistema = detectarSistema(ua);
  return sistema ? `${navegador} · ${sistema}` : navegador;
}

function detectarNavegador(ua: string): string {
  // Navegadores embebidos primero: la app de Instagram/Facebook manda además el
  // UA de Chrome/Safari, y para una barbería es tráfico habitual (el link de la
  // bio). Saber que vino de ahí es más útil que "Chrome".
  if (/\bInstagram\b/i.test(ua)) return "Instagram (in-app)";
  if (/\bFBAN\/|\bFBAV\//i.test(ua)) return "Facebook (in-app)";
  if (/\bWhatsApp\b/i.test(ua)) return "WhatsApp (in-app)";

  const conVersion = (nombre: string, re: RegExp): string | null => {
    const m = ua.match(re);
    return m?.[1] ? `${nombre} ${m[1].split(".")[0]}` : null;
  };

  // El orden importa: Edge y Opera se hacen pasar por Chrome, Samsung Internet
  // también, y Chrome se hace pasar por Safari.
  return (
    conVersion("Edge", /Edg(?:e|A|iOS)?\/([\d.]+)/) ??
    conVersion("Opera", /OPR\/([\d.]+)/) ??
    conVersion("Samsung Internet", /SamsungBrowser\/([\d.]+)/) ??
    conVersion("Firefox", /(?:Firefox|FxiOS)\/([\d.]+)/) ??
    conVersion("Chrome", /(?:Chrome|CriOS)\/([\d.]+)/) ??
    // Safari reporta su versión en `Version/`, no en `Safari/`.
    conVersion("Safari", /Version\/([\d.]+).*Safari/) ??
    "Desconocido"
  );
}

function detectarSistema(ua: string): string | null {
  // iPadOS se declara como Macintosh; el toque táctil lo delata solo en JS, así
  // que desde el server un iPad moderno puede figurar como macOS. Aceptado.
  if (/\bAndroid\b/i.test(ua)) return "Android";
  if (/\biPhone\b/i.test(ua)) return "iPhone";
  if (/\biPad\b/i.test(ua)) return "iPad";
  if (/\bWindows NT\b/i.test(ua)) return "Windows";
  if (/\bMac OS X\b|\bMacintosh\b/i.test(ua)) return "macOS";
  if (/\bLinux\b/i.test(ua)) return "Linux";
  return null;
}
