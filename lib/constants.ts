/**
 * Constantes de UI. Centralizadas para no hardcodear strings sueltos.
 */

export const APP_NAME = "HLstudio";
export const APP_TAGLINE = "Barbería · Chivilcoy";
export const APP_SHORT_DESCRIPTION =
  "Cortes, barba y cuidado masculino. Reservá tu turno en menos de un minuto.";

export const COPY = {
  cta: {
    reservarTurno: "Reservar turno",
    proximamente: "Próximamente",
    iniciarSesion: "Iniciar sesión",
    salir: "Cerrar sesión",
  },
  errores: {
    generico: "Algo salió mal. Probá de nuevo en un momento.",
    credencialesInvalidas: "Email o contraseña incorrectos.",
    sesionExpirada: "Tu sesión expiró. Iniciá sesión de nuevo.",
  },
  admin: {
    loginTitle: "Panel HLstudio",
    loginSubtitle: "Ingresá con tu email y contraseña.",
  },
} as const;
