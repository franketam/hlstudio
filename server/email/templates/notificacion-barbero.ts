import { fechaLargaAR, formatPrecioARS, horaCortaAR } from "@/lib/format";
import type { RenderedEmail } from "./confirmacion-cliente";

export type NotificacionBarberoData = {
  barberoNombre: string;
  clienteNombre: string;
  clienteTelefono: string;
  clienteEmail: string;
  servicioNombre: string;
  inicio: Date;
  duracionMin: number;
  precioTotal: string | number;
  adminUrl: string;
};

export function renderNotificacionBarbero(
  data: NotificacionBarberoData
): RenderedEmail {
  const fecha = fechaLargaAR(data.inicio);
  const hora = horaCortaAR(data.inicio);
  const precio = formatPrecioARS(data.precioTotal);

  const subject = `Nueva reserva — ${fecha}, ${hora} hs`;

  const text = [
    `Hola ${data.barberoNombre},`,
    ``,
    `Te entró una nueva reserva.`,
    ``,
    `Cuándo: ${fecha} a las ${hora} hs`,
    `Servicio: ${data.servicioNombre} (${data.duracionMin} min)`,
    `Precio: ${precio}`,
    ``,
    `Cliente:`,
    `  ${data.clienteNombre}`,
    `  ${data.clienteTelefono}`,
    `  ${data.clienteEmail}`,
    ``,
    `Ver agenda: ${data.adminUrl}`,
    ``,
    `HLstudio.`,
  ].join("\n");

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
              <p style="margin:0;font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:#8a8a86;">HLstudio · Panel</p>
              <h1 style="margin:8px 0 0 0;font-size:26px;line-height:1.15;font-weight:300;letter-spacing:-0.02em;color:#0a0a0a;">
                Nueva reserva.
              </h1>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 32px 8px 32px;">
              <p style="margin:0 0 18px 0;font-size:15px;line-height:1.55;color:#2a2a26;">
                Hola ${escapeHtml(data.barberoNombre)}, te entró un turno nuevo.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #ececea;">
                ${row("Cuándo", `${escapeHtml(fecha)} · ${escapeHtml(hora)} hs`)}
                ${row("Servicio", `${escapeHtml(data.servicioNombre)} · ${data.duracionMin} min`)}
                ${row("Precio", escapeHtml(precio))}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:8px 32px 8px 32px;">
              <p style="margin:18px 0 10px 0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#8a8a86;">
                Cliente
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #ececea;">
                ${row("Nombre", escapeHtml(data.clienteNombre))}
                ${row("Teléfono", `<a href="tel:${escapeHtml(data.clienteTelefono)}" style="color:#0a0a0a;text-decoration:underline;">${escapeHtml(data.clienteTelefono)}</a>`)}
                ${row("Email", `<a href="mailto:${escapeHtml(data.clienteEmail)}" style="color:#0a0a0a;text-decoration:underline;">${escapeHtml(data.clienteEmail)}</a>`)}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 32px 32px 32px;">
              <p style="margin:0;">
                <a href="${escapeHtml(data.adminUrl)}" style="display:inline-block;padding:12px 22px;background:#0a0a0a;color:#ffffff;text-decoration:none;font-size:14px;letter-spacing:0.04em;border-radius:2px;">
                  Ver agenda del día
                </a>
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
