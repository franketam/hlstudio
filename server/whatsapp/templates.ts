import { fechaLargaAR, formatPrecioARS, horaCortaAR } from "@/lib/format";

/**
 * Templates de WhatsApp para HLstudio.
 *
 * Voz sobria, emojis funcionales mínimos (solo donde aportan claridad escaneable).
 * Sin markdown pesado: WhatsApp soporta *bold*, _italic_, ~strike~, `code`.
 *
 * Cada template devuelve un solo string que va al campo `text` del mensaje.
 *
 * Placeholder de dirección: "HLstudio — Chivilcoy". TODO en CLAUDE.md para
 * reemplazar por la dirección exacta una vez confirmada con el cliente.
 */

export const HL_DIRECCION_PLACEHOLDER = "HLstudio — Chivilcoy";

// -------------------------------------------------------------------------
// 1. Confirmación al cliente
// -------------------------------------------------------------------------

export type ConfirmacionClienteWaData = {
  clienteNombre: string;
  barberoNombre: string;
  servicioNombre: string;
  inicio: Date;
  duracionMin: number;
  precioTotal: string | number;
  cancelUrl: string;
};

export function renderConfirmacionClienteWa(
  data: ConfirmacionClienteWaData
): string {
  const fecha = fechaLargaAR(data.inicio);
  const hora = horaCortaAR(data.inicio);
  const precio = formatPrecioARS(data.precioTotal);

  return [
    `Hola ${data.clienteNombre}, tu turno en *HLstudio* quedó confirmado.`,
    ``,
    `📅 ${fecha} · ${hora} hs`,
    `✂️ ${data.servicioNombre} (${data.duracionMin} min)`,
    `👤 Barbero: ${data.barberoNombre}`,
    `💵 ${precio} — pago en el local`,
    ``,
    `📍 ${HL_DIRECCION_PLACEHOLDER}`,
    ``,
    `¿Necesitás cancelar? Podés hacerlo online hasta 3 horas antes:`,
    data.cancelUrl,
    ``,
    `Te esperamos.`,
  ].join("\n");
}

// -------------------------------------------------------------------------
// 2. Confirmación al barbero (nueva reserva)
// -------------------------------------------------------------------------

export type ConfirmacionBarberoWaData = {
  barberoNombre: string;
  clienteNombre: string;
  clienteTelefono: string;
  servicioNombre: string;
  inicio: Date;
  duracionMin: number;
  precioTotal: string | number;
};

export function renderConfirmacionBarberoWa(
  data: ConfirmacionBarberoWaData
): string {
  const fecha = fechaLargaAR(data.inicio);
  const hora = horaCortaAR(data.inicio);
  const precio = formatPrecioARS(data.precioTotal);

  return [
    `Hola ${data.barberoNombre}, te entró una *nueva reserva*.`,
    ``,
    `📅 ${fecha} · ${hora} hs`,
    `✂️ ${data.servicioNombre} (${data.duracionMin} min)`,
    `💵 ${precio}`,
    ``,
    `👤 ${data.clienteNombre}`,
    `📱 ${data.clienteTelefono}`,
  ].join("\n");
}

// -------------------------------------------------------------------------
// 3. Recordatorio T-24h / T-3h al cliente
// -------------------------------------------------------------------------

export type RecordatorioClienteWaData = {
  tipo: "24h" | "3h";
  clienteNombre: string;
  barberoNombre: string;
  servicioNombre: string;
  inicio: Date;
  duracionMin: number;
  cancelUrl: string;
};

export function renderRecordatorioClienteWa(
  data: RecordatorioClienteWaData
): string {
  const fecha = fechaLargaAR(data.inicio);
  const hora = horaCortaAR(data.inicio);

  if (data.tipo === "24h") {
    return [
      `Hola ${data.clienteNombre}, te recordamos que *mañana* tenés tu turno en HLstudio.`,
      ``,
      `📅 ${fecha} · ${hora} hs`,
      `✂️ ${data.servicioNombre} (${data.duracionMin} min)`,
      `👤 Barbero: ${data.barberoNombre}`,
      ``,
      `📍 ${HL_DIRECCION_PLACEHOLDER}`,
      ``,
      `Si no podés venir, cancelá online hasta 3 horas antes:`,
      data.cancelUrl,
    ].join("\n");
  }

  // 3h: sin link de cancelación (el corte online es justo T-3h)
  return [
    `Hola ${data.clienteNombre}, tu turno con ${data.barberoNombre} es en *3 horas* aproximadamente.`,
    ``,
    `📅 ${fecha} · ${hora} hs`,
    `✂️ ${data.servicioNombre} (${data.duracionMin} min)`,
    ``,
    `📍 ${HL_DIRECCION_PLACEHOLDER}`,
    ``,
    `Si no podés venir, comunicate con el barbero — la cancelación online cierra 3 horas antes del turno.`,
  ].join("\n");
}

// -------------------------------------------------------------------------
// 4. Cancelación: el admin canceló el turno (aviso al cliente)
// -------------------------------------------------------------------------

export type CancelacionClienteWaData = {
  clienteNombre: string;
  barberoNombre: string;
  servicioNombre: string;
  inicio: Date;
  reservarUrl: string;
};

export function renderCancelacionClienteWa(
  data: CancelacionClienteWaData
): string {
  const fecha = fechaLargaAR(data.inicio);
  const hora = horaCortaAR(data.inicio);

  return [
    `Hola ${data.clienteNombre}, tu turno en *HLstudio* fue cancelado.`,
    ``,
    `📅 ${fecha} · ${hora} hs`,
    `✂️ ${data.servicioNombre}`,
    `👤 Barbero: ${data.barberoNombre}`,
    ``,
    `Si querés, podés reservar otro horario acá:`,
    data.reservarUrl,
    ``,
    `Disculpá las molestias.`,
  ].join("\n");
}

// -------------------------------------------------------------------------
// 5. Cancelación: aviso al barbero
// -------------------------------------------------------------------------

export type CancelacionBarberoWaData = {
  barberoNombre: string;
  clienteNombre: string;
  clienteTelefono: string;
  servicioNombre: string;
  inicio: Date;
};

export function renderCancelacionBarberoWa(
  data: CancelacionBarberoWaData
): string {
  const fecha = fechaLargaAR(data.inicio);
  const hora = horaCortaAR(data.inicio);

  return [
    `Se *canceló* un turno.`,
    ``,
    `📅 ${fecha} · ${hora} hs`,
    `✂️ ${data.servicioNombre}`,
    ``,
    `👤 ${data.clienteNombre}`,
    `📱 ${data.clienteTelefono}`,
  ].join("\n");
}
