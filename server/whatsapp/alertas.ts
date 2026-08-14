import "server-only";

import { sendWhatsAppSelf } from "@/server/whatsapp/client";
import { renderReservaRechazadaWa } from "@/server/whatsapp/templates";

/**
 * Avisos internos al dueño por WhatsApp (al número pareado por QR).
 *
 * Existe por una decisión de producto: cuando una reserva se rechaza por
 * validación del teléfono, al que intentó reservar se le muestra un error
 * genérico —decirle cuál falló es explicarle qué evadir— pero el dueño sí
 * tiene que enterarse de que está pasando.
 */

export type MotivoRechazo =
  | "sin_whatsapp"
  | "telefono_invalido"
  | "bloqueado";

const TEXTO_MOTIVO: Record<MotivoRechazo, string> = {
  sin_whatsapp: "el número no tiene cuenta de WhatsApp",
  telefono_invalido: "el número no se pudo interpretar (formato inválido)",
  bloqueado: "está en la lista de bloqueados (volvió a intentar)",
};

/**
 * Ventana mínima entre avisos.
 *
 * Sin esto, el aviso se vuelve el ataque: una oleada de 200 intentos serían 200
 * mensajes en el teléfono del dueño, que es peor que no avisarle nada. Los
 * intentos de la ventana se cuentan y viajan como resumen en el aviso siguiente.
 */
const COOLDOWN_MS = 10 * 60 * 1000;

// Estado en memoria, por proceso. Misma limitación que `lib/rate-limit.ts`: en
// multi-réplica cada instancia lleva su propio contador, con lo cual el techo
// real es un aviso cada 10 min POR réplica. Aceptable — el objetivo es no
// inundar, no un conteo exacto.
let ultimoAvisoAt = 0;
let suprimidosDesdeUltimoAviso = 0;

export type ReservaRechazadaInfo = {
  telefonoIngresado: string;
  nombreIngresado: string;
  motivo: MotivoRechazo;
};

/**
 * Avisa al dueño de un intento de reserva rechazado. Fire-and-forget: nunca
 * tira, nunca bloquea la respuesta al cliente, y si el bot está caído solo
 * queda el log.
 */
export function alertarReservaRechazada(info: ReservaRechazadaInfo): void {
  const ahora = Date.now();

  // La decisión y la actualización del estado son síncronas y van ANTES de
  // cualquier await: si entran dos intentos en el mismo tick, el segundo ve el
  // cooldown ya tomado y suma al contador en vez de mandar otro mensaje.
  if (ahora - ultimoAvisoAt < COOLDOWN_MS) {
    suprimidosDesdeUltimoAviso += 1;
    return;
  }
  ultimoAvisoAt = ahora;
  const suprimidos = suprimidosDesdeUltimoAviso;
  suprimidosDesdeUltimoAviso = 0;

  const texto = renderReservaRechazadaWa({
    telefonoIngresado: info.telefonoIngresado,
    nombreIngresado: info.nombreIngresado,
    motivo: TEXTO_MOTIVO[info.motivo],
    suprimidos,
  });

  void sendWhatsAppSelf(texto)
    .then((r) => {
      if (r.ok) {
        // Loguear también el éxito, con el id: al número del dueño le llegan
        // además las confirmaciones de barbero, y sin este renglón no hay forma
        // de saber cuál de todos los mensajes salientes fue una alerta.
        console.info(
          `[security] alerta_dueño_enviada motivo=${info.motivo} suprimidos=${suprimidos} providerId=${r.providerId ?? "-"}`
        );
      } else {
        console.warn(
          `[security] alerta_dueño_fallo motivo=${info.motivo} detalle=${r.detail ?? "-"}`
        );
      }
    })
    .catch((err) => {
      // `sendWhatsAppSelf` ya captura lo suyo; esto es el cinturón por si algo
      // se escapa. Una alerta que falla no puede romper nada.
      console.warn(`[security] alerta_dueño_excepcion err=${String(err)}`);
    });
}
