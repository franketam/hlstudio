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
    guardar: "Guardar",
    guardando: "Guardando...",
    cancelar: "Cancelar",
    crear: "Crear",
    creando: "Creando...",
    editar: "Editar",
    activar: "Activar",
    desactivar: "Desactivar",
    volver: "Volver",
  },
  errores: {
    generico: "Algo salió mal. Probá de nuevo en un momento.",
    credencialesInvalidas: "Email o contraseña incorrectos.",
    sesionExpirada: "Tu sesión expiró. Iniciá sesión de nuevo.",
    noEncontrado: "No encontramos lo que buscabas.",
  },
  admin: {
    loginTitle: "Panel HLstudio",
    loginSubtitle: "Ingresá con tu email y contraseña.",
    nav: {
      panel: "Panel",
      agenda: "Agenda",
      configuracion: "Configuración",
    },
    config: {
      title: "Configuración",
      eyebrow: "Panel",
      subtitle:
        "Administrá los servicios que ofrece la barbería y los barberos del equipo.",
      cards: {
        servicios: {
          title: "Servicios",
          desc: "Nombre, duración y descripción. Los precios se cargan por barbero.",
          cta: "Administrar",
        },
        barberos: {
          title: "Barberos",
          desc: "Equipo visible en la reserva. Foto, descripción y email de aviso.",
          cta: "Administrar",
        },
      },
    },
    servicios: {
      title: "Servicios",
      eyebrow: "Configuración",
      nuevo: "Nuevo servicio",
      vacio: "Todavía no hay servicios cargados.",
      vacioCta: "Crear el primero",
      form: {
        tituloNuevo: "Nuevo servicio",
        tituloEditar: "Editar servicio",
        nombre: "Nombre",
        nombrePlaceholder: "Corte de pelo",
        duracion: "Duración (minutos)",
        duracionHint: "Cuánto tiempo bloquea en la agenda. Entre 5 y 480 minutos.",
        descripcion: "Descripción",
        descripcionPlaceholder: "Detalle opcional que ve el cliente al reservar.",
        orden: "Orden",
        ordenHint:
          "Posición en el listado. Menor número aparece primero (0 = primero).",
      },
    },
    barberos: {
      title: "Barberos",
      eyebrow: "Configuración",
      nuevo: "Nuevo barbero",
      vacio: "Todavía no hay barberos cargados.",
      vacioCta: "Crear el primero",
      form: {
        tituloNuevo: "Nuevo barbero",
        tituloEditar: "Editar barbero",
        nombre: "Nombre",
        nombrePlaceholder: "Hugo",
        fotoUrl: "Foto (URL)",
        fotoUrlHint:
          "URL pública de la foto. Por ahora no subimos archivos desde el panel.",
        descripcion: "Descripción",
        descripcionPlaceholder:
          "Una línea sobre el barbero. Aparece en el paso 1 de la reserva.",
        email: "Email del barbero",
        emailHint:
          "Recibe aviso cuando le reservan un turno. Dejá en blanco para no notificar.",
        orden: "Orden",
        ordenHint:
          "Posición en el listado. Menor número aparece primero (0 = primero).",
      },
    },
    estados: {
      activo: "Activo",
      inactivo: "Inactivo",
    },
  },
} as const;
