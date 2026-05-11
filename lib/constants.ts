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
        "Administrá los servicios que ofrece la barbería, el equipo de barberos y los precios.",
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
        precios: {
          title: "Precios",
          desc: "Matriz de precios por barbero y servicio. Si una celda queda vacía, ese barbero no ofrece ese servicio.",
          cta: "Administrar",
        },
        horarios: {
          title: "Horarios y descansos",
          desc: "Qué días abre la barbería y en qué franjas horarias. Los días no marcados quedan como descanso recurrente.",
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
    precios: {
      title: "Precios",
      eyebrow: "Configuración",
      subtitle:
        "Cargá el precio de cada servicio para cada barbero. Si una celda queda vacía, ese servicio no aparece en la reserva con ese barbero.",
      sinBarberos:
        "Todavía no hay barberos activos. Activá al menos un barbero para cargar precios.",
      sinServicios:
        "Todavía no hay servicios activos. Activá al menos un servicio para cargar precios.",
      headerBarbero: "Barbero",
      placeholderVacio: "—",
      hintCeldaVacia:
        "Sin precio → no aparecerá en la reserva con este barbero.",
      cambiosPendientes: (n: number) =>
        n === 1 ? "1 cambio sin guardar" : `${n} cambios sin guardar`,
      sinCambios: "Sin cambios pendientes",
      guardar: "Guardar cambios",
      guardando: "Guardando...",
      descartar: "Descartar cambios",
      guardadoOk: "Cambios guardados.",
      errorGuardado: "No pudimos guardar los cambios. Probá de nuevo.",
      precioInvalido: "El precio debe ser un número entre 0 y 9.999.999,99.",
    },
    horarios: {
      title: "Horarios y descansos",
      eyebrow: "Configuración",
      subtitle:
        "Definí qué días abre la barbería y en qué franjas horarias. Los días sin marcar como abiertos quedan como descanso recurrente y no aparecen en la reserva.",
      diaCerrado: "Cerrado",
      diaAbierto: "Abierto",
      agregarRango: "Agregar rango",
      eliminarRango: "Eliminar rango",
      apertura: "Apertura",
      cierre: "Cierre",
      sinRangos:
        "Sin franjas cargadas. Agregá al menos una para que el día quede abierto.",
      errorRangoInvalido: "La apertura debe ser anterior al cierre.",
      errorRangoSolapado: "Los rangos no pueden solaparse dentro del mismo día.",
      errorRangoFaltante:
        "Si el día está abierto necesita al menos un rango horario.",
      cambiosPendientes: (n: number) =>
        n === 1 ? "1 día con cambios" : `${n} días con cambios`,
      sinCambios: "Sin cambios pendientes",
      guardar: "Guardar cambios",
      guardando: "Guardando...",
      descartar: "Descartar cambios",
      guardadoOk: "Cambios guardados.",
      errorGuardado: "No pudimos guardar los cambios. Probá de nuevo.",
    },
    estados: {
      activo: "Activo",
      inactivo: "Inactivo",
    },
  },
} as const;

/**
 * Días de la semana en español, índice 0=Domingo .. 6=Sábado
 * (convención JS / Postgres `date_part('dow')`).
 */
export const DIAS_SEMANA_ES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

/**
 * Orden visual del editor: lunes → domingo (convención local, distinto al índice JS).
 */
export const DIAS_SEMANA_ORDEN_LUN_DOM = [1, 2, 3, 4, 5, 6, 0] as const;
