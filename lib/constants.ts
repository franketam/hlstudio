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
  reservar: {
    // Modal de reserva rechazada.
    //
    // Deliberadamente genérico: no dice qué validación falló ni qué campo la
    // provocó. El detalle le llega al dueño por WhatsApp. Ver
    // ERROR_RESERVA_RECHAZADA en server/actions/booking.ts.
    errorRechazo: {
      titulo: "No pudimos confirmar el turno",
      ayuda:
        "Si el problema sigue, escribinos por WhatsApp o pasá por el local y te lo agendamos nosotros.",
      cerrar: "Volver al formulario",
    },
  },
  admin: {
    loginTitle: "Panel HLstudio",
    loginSubtitle: "Ingresá con tu email y contraseña.",
    nav: {
      panel: "Panel",
      agenda: "Agenda",
      clientes: "Clientes",
      configuracion: "Configuración",
      whatsapp: "WhatsApp",
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
        bloqueos: {
          title: "Bloqueos de agenda",
          desc: "Vacaciones, ausencias o feriados puntuales. Bloquean los slots para un barbero o para todo el local.",
          cta: "Administrar",
        },
        bloqueosRecurrentes: {
          title: "Bloqueos recurrentes",
          desc: "Franjas fijas que un barbero no atiende cada semana (ej. todos los martes a la tarde). Se repiten indefinidamente.",
          cta: "Administrar",
        },
        bloqueosAcceso: {
          title: "Bloqueos de reservas",
          desc: "Teléfonos, emails e IPs que no pueden reservar por la web. Vos les seguís pudiendo cargar turnos a mano.",
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
          "Recibe aviso cuando le reservan un turno. Dejá en blanco para no notificar por email.",
        telefono: "WhatsApp del barbero",
        telefonoPlaceholder: "11 5050 5050",
        telefonoHint:
          "Si está cargado, los avisos se envían por WhatsApp (reemplaza el email). Formato libre, lo normalizamos.",
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
    bloqueos: {
      title: "Bloqueos de agenda",
      eyebrow: "Configuración",
      subtitle:
        "Marcá las ausencias puntuales o vacaciones. Los slots afectados desaparecen automáticamente del flujo de reserva.",
      nuevo: "+ Nuevo bloqueo",
      cancelarNuevo: "Cancelar",
      vacio: "No hay bloqueos vigentes ni próximos.",
      eliminar: "Eliminar",
      eliminando: "Eliminando...",
      confirmarEliminar: "¿Eliminar este bloqueo? Los slots volverán a aparecer.",
      crear: "Crear bloqueo",
      creando: "Creando...",
      alcance: "Alcance",
      alcanceBarbero: "Un barbero",
      alcanceLocal: "Todo el local",
      barberoLabel: "Barbero",
      barberoPlaceholder: "Elegí un barbero",
      tipo: "Duración",
      tipoUnDia: "Un día",
      tipoVariosDias: "Varios días",
      fecha: "Fecha",
      desde: "Desde",
      hasta: "Hasta",
      motivo: "Motivo (opcional)",
      motivoPlaceholder: "Vacaciones, enfermedad, casamiento...",
      errorFechasInvertidas: "La fecha 'hasta' debe ser igual o posterior a 'desde'.",
      errorFechaPasada: "No podés bloquear más de un año hacia atrás.",
      errorBarberoFaltante: "Elegí un barbero o seleccioná 'Todo el local'.",
      errorGenerico: "No pudimos guardar el bloqueo. Probá de nuevo.",
      errorEliminar: "No pudimos eliminar el bloqueo. Probá de nuevo.",
      alcanceTodoElLocal: "Todo el local",
      motivoVacio: "Sin motivo",
    },
    bloqueosRecurrentes: {
      title: "Bloqueos recurrentes",
      eyebrow: "Configuración",
      subtitle:
        "Franjas que un barbero no atiende todas las semanas (ej. todos los martes de 14:00 a 18:00). Se repiten indefinidamente hasta que las elimines.",
      nuevo: "+ Nuevo bloqueo recurrente",
      cancelarNuevo: "Cancelar",
      vacio: "Todavía no hay bloqueos recurrentes cargados.",
      eliminar: "Eliminar",
      eliminando: "Eliminando...",
      confirmarEliminar:
        "¿Eliminar este bloqueo recurrente? El barbero volverá a estar disponible en esa franja.",
      crear: "Crear bloqueo",
      creando: "Creando...",
      barberoLabel: "Barbero",
      barberoPlaceholder: "Elegí un barbero",
      diaLabel: "Día de la semana",
      diaCompleto: "Bloquear el día completo",
      desde: "Desde",
      hasta: "Hasta",
      motivo: "Motivo (opcional)",
      motivoPlaceholder: "Estudia, trabaja en otro lado, franco...",
      motivoVacio: "Sin motivo",
      inactivo: "Inactivo",
      activar: "Activar",
      desactivar: "Desactivar",
      actualizando: "Actualizando...",
      errorToggle: "No pudimos actualizar el bloqueo. Probá de nuevo.",
      diaCompletoLabel: "Día completo",
      errorBarberoFaltante: "Elegí un barbero.",
      errorDiaFaltante: "Elegí un día de la semana.",
      errorHorasInvertidas: "La hora 'hasta' debe ser posterior a 'desde'.",
      errorHoraFaltante: "Completá ambas horas.",
      errorGenerico: "No pudimos guardar el bloqueo. Probá de nuevo.",
      errorEliminar: "No pudimos eliminar el bloqueo. Probá de nuevo.",
      sinBarberos:
        "Primero cargá al menos un barbero activo en Configuración → Barberos.",
      diasSemana: [
        "Domingo",
        "Lunes",
        "Martes",
        "Miércoles",
        "Jueves",
        "Viernes",
        "Sábado",
      ] as const,
    },
    estados: {
      activo: "Activo",
      inactivo: "Inactivo",
    },
    clientes: {
      title: "Clientes",
      eyebrow: "Panel",
      subtitle:
        "Buscá por nombre o teléfono para ver el historial de turnos, la frecuencia y dejar notas internas.",
      buscarPlaceholder: "Buscar por nombre o teléfono...",
      buscarLabel: "Buscar cliente",
      vacioBusqueda: "No encontramos clientes con esa búsqueda.",
      vacioInicial:
        "Todavía no hay clientes con turnos cargados. Cuando reserven o cargues un walk-in, aparecen acá.",
      topReciente: "Clientes más recientes",
      resultadosBusqueda: (n: number) =>
        n === 1 ? "1 resultado" : `${n} resultados`,
      verFicha: "Ver ficha",
      sinEmail: "Sin email",
      sinUltimaVisita: "Sin visitas",
      totalTurnos: "Turnos totales",
      ultimaVisita: "Última visita",
      gastoTotal: "Gasto acumulado",
      frecuencia: "Frecuencia",
      frecuenciaUnica: "1ra visita",
      frecuenciaDias: (n: number) => (n <= 1 ? "Viene casi a diario" : `Viene cada ~${n} días`),
      clienteDesde: "Cliente desde",
      datosContacto: "Datos de contacto",
      notas: {
        title: "Notas internas",
        subtitle:
          "Recordatorios para vos. El cliente no las ve. Máx. 2000 caracteres.",
        placeholder: "Le gusta el corte bien corto. Llega siempre 10 min antes.",
        guardar: "Guardar notas",
        guardando: "Guardando...",
        guardadoOk: "Notas guardadas.",
        errorGenerico: "No pudimos guardar las notas. Probá de nuevo.",
      },
      historial: {
        title: "Historial de turnos",
        vacio: "Este cliente todavía no tiene turnos cargados.",
        columnaFecha: "Fecha",
        columnaBarbero: "Barbero",
        columnaServicio: "Servicio",
        columnaPrecio: "Precio",
        columnaEstado: "Estado",
      },
      estadoBadge: {
        confirmado: "Confirmado",
        completado: "Completado",
        cancelado_cliente: "Canceló el cliente",
        cancelado_admin: "Canceló la barbería",
        no_show: "No vino",
      },
      volverAListado: "← Volver al listado",
      noEncontrado: "Cliente no encontrado.",
    },
    nuevoTurno: {
      title: "Nuevo turno",
      eyebrow: "Agenda",
      subtitle:
        "Cargá un turno manual: walk-in retroactivo o reserva tomada por WhatsApp / teléfono.",
      cta: "+ Nuevo turno",
      volverAgenda: "← Volver a la agenda",
      barbero: "Barbero",
      barberoPlaceholder: "Elegí un barbero",
      servicio: "Servicio",
      servicioPlaceholder: "Elegí un servicio",
      servicioSinPrecio:
        "Este barbero todavía no tiene precios cargados. Configurá precios para poder reservar.",
      fecha: "Fecha",
      hora: "Hora",
      horaPlaceholder: "Elegí un horario",
      cargandoSlots: "Cargando horarios disponibles...",
      sinSlots: "No hay horarios disponibles para esta fecha.",
      elegiBarberoServicio:
        "Elegí barbero, servicio y fecha para ver los horarios.",
      cliente: "Cliente",
      clienteTelefono: "Teléfono",
      clienteTelefonoPlaceholder: "11 1234 5678",
      clienteTelefonoHint:
        "Si el cliente ya vino antes, completamos automáticamente nombre y email.",
      clienteEncontrado: "Cliente existente — datos cargados automáticamente.",
      clienteNombre: "Nombre",
      clienteNombrePlaceholder: "Nombre completo",
      clienteEmail: "Email (opcional)",
      clienteEmailPlaceholder: "cliente@ejemplo.com",
      pagoEnLocal: "Ya pagó en el local",
      pagoEnLocalHint:
        "Marcá si el cliente ya pagó. Si no, queda como pago pendiente.",
      crear: "Crear turno",
      creando: "Creando turno...",
      cancelar: "Cancelar",
      okCreado: "Turno creado.",
      errorGenerico: "No pudimos crear el turno. Probá de nuevo.",
      errorSlotOcupado:
        "Ese horario acaba de ser tomado. Refrescá los horarios disponibles.",
      errorFechaPasada:
        "No podés cargar turnos con más de 30 días de antigüedad.",
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
