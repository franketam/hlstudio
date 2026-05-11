import { fechaLargaAR, formatPrecioARS, horaCortaAR } from "@/lib/format";
import type { RenderedEmail } from "./confirmacion-cliente";

export type RecordatorioTipo = "24h" | "2h";

export type RecordatorioClienteData = {
  tipo: RecordatorioTipo;
  clienteNombre: string;
  barberoNombre: string;
  servicioNombre: string;
  inicio: Date;
  duracionMin: number;
  precioTotal: string | number;
  cancelUrl: string;
};

const COPY_BY_TIPO: Record<
  RecordatorioTipo,
  {
    eyebrow: string;
    h1: string;
    subjectPrefix: string;
    leadHtml: (clienteNombre: string, barbero: string) => string;
    leadText: (clienteNombre: string, barbero: string) => string;
  }
> = {
  "24h": {
    eyebrow: "Recordatorio",
    h1: "Te esperamos mañana.",
    subjectPrefix: "Tu turno es mañana",
    leadHtml: (cliente, barbero) =>
      `Hola ${cliente}, te recordamos que mañana tenés tu turno con ${barbero}.`,
    leadText: (cliente, barbero) =>
      `Hola ${cliente},\n\nTe recordamos que mañana tenés tu turno con ${barbero} en HLstudio.`,
  },
  "2h": {
    eyebrow: "Recordatorio",
    h1: "Tu turno es en 2 horas.",
    subjectPrefix: "Tu turno es en 2 horas",
    leadHtml: (cliente, barbero) =>
      `Hola ${cliente}, en aproximadamente 2 horas te esperamos con ${barbero}.`,
    leadText: (cliente, barbero) =>
      `Hola ${cliente},\n\nEn aproximadamente 2 horas te esperamos en HLstudio con ${barbero}.`,
  },
};

/**
 * Template del recordatorio T-24h / T-2h. Comparte la estética del email de
 * confirmación: ancho 600, paleta blanco/negro, sin imágenes externas.
 *
 * Diferencias vs confirmación:
 *  - Eyebrow "Recordatorio" en vez de "HLstudio".
 *  - H1 contextual ("Te esperamos mañana." o "Tu turno es en 2 horas.").
 *  - Bloque de cancelación condicional: a T-24h se ofrece (queda >3h),
 *    a T-2h se omite porque el cliente ya pasó la ventana de cancelación
 *    autoservicio (corte a T-3h).
 */
export function renderRecordatorioCliente(
  data: RecordatorioClienteData
): RenderedEmail {
  const copy = COPY_BY_TIPO[data.tipo];
  const fecha = fechaLargaAR(data.inicio);
  const hora = horaCortaAR(data.inicio);
  const precio = formatPrecioARS(data.precioTotal);

  const subject = `${copy.subjectPrefix} — ${fecha}, ${hora} hs`;

  const showCancel = data.tipo === "24h";

  const textLines = [
    copy.leadText(data.clienteNombre, data.barberoNombre),
    ``,
    `Cuándo: ${fecha} a las ${hora} hs`,
    `Barbero: ${data.barberoNombre}`,
    `Servicio: ${data.servicioNombre} (${data.duracionMin} min)`,
    `Precio: ${precio} — Pago en el local.`,
    ``,
  ];
  if (showCancel) {
    textLines.push(
      `Si no podés venir, cancelá desde acá (hasta 3 horas antes):`,
      data.cancelUrl,
      ``
    );
  } else {
    textLines.push(
      `Si no podés venir, comunicate con el barbero — ya no se puede cancelar online.`,
      ``
    );
  }
  textLines.push(`Te esperamos en Chivilcoy.`, `HLstudio.`);
  const text = textLines.join("\n");

  const cancelBlockHtml = showCancel
    ? `<tr>
            <td style="padding:24px 32px 32px 32px;">
              <p style="margin:0 0 14px 0;font-size:14px;line-height:1.5;color:#2a2a26;">
                ¿No podés venir? Podés cancelar online hasta <strong>3 horas antes</strong> del turno:
              </p>
              <p style="margin:0;">
                <a href="${escapeHtml(data.cancelUrl)}" style="display:inline-block;padding:12px 22px;background:#0a0a0a;color:#ffffff;text-decoration:none;font-size:14px;letter-spacing:0.04em;border-radius:2px;">
                  Gestionar mi turno
                </a>
              </p>
              <p style="margin:14px 0 0 0;font-size:12px;line-height:1.5;color:#8a8a86;word-break:break-all;">
                ${escapeHtml(data.cancelUrl)}
              </p>
            </td>
          </tr>`
    : `<tr>
            <td style="padding:24px 32px 32px 32px;">
              <p style="margin:0;font-size:14px;line-height:1.5;color:#2a2a26;">
                Si no podés venir, comunicate con el barbero — pasada la ventana de 3 horas ya no se puede cancelar online.
              </p>
            </td>
          </tr>`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0a0a0a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f2;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e6e6e3;">
          <tr>
            <td style="padding:32px 32px 24px 32px;border-bottom:1px solid #ececea;">
              <p style="margin:0;font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:#8a8a86;">HLstudio · ${escapeHtml(copy.eyebrow)}</p>
              <h1 style="margin:8px 0 0 0;font-size:28px;line-height:1.15;font-weight:300;letter-spacing:-0.02em;color:#0a0a0a;">
                ${escapeHtml(copy.h1)}
              </h1>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 32px 8px 32px;">
              <p style="margin:0 0 20px 0;font-size:15px;line-height:1.55;color:#2a2a26;">
                ${escapeHtml(copy.leadHtml(data.clienteNombre, data.barberoNombre))}
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #ececea;">
                ${row("Cuándo", `${escapeHtml(fecha)} · ${escapeHtml(hora)} hs`)}
                ${row("Barbero", escapeHtml(data.barberoNombre))}
                ${row("Servicio", `${escapeHtml(data.servicioNombre)} · ${data.duracionMin} min`)}
                ${row("Precio", `${escapeHtml(precio)} <span style="color:#8a8a86;font-size:13px;">· pago en el local</span>`)}
              </table>
            </td>
          </tr>

          ${cancelBlockHtml}

          <tr>
            <td style="padding:20px 32px 28px 32px;border-top:1px solid #ececea;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#8a8a86;">
                HLstudio · Chivilcoy, Buenos Aires<br/>
                Martes a sábado · 10–13 / 15–20
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

function row(label: string, valueHtml: string): string {
  return `<tr>
  <td style="padding:14px 0;border-bottom:1px solid #ececea;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#8a8a86;width:35%;vertical-align:top;">${escapeHtml(label)}</td>
  <td style="padding:14px 0;border-bottom:1px solid #ececea;font-size:15px;color:#0a0a0a;vertical-align:top;">${valueHtml}</td>
</tr>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
