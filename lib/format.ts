import { toZonedTime, format as tzFormat } from "date-fns-tz";
import { addDays, startOfDay } from "date-fns";

const TZ = "America/Argentina/Buenos_Aires";

const PRECIO_FORMATTER = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export function formatPrecioARS(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "";
  return PRECIO_FORMATTER.format(n);
}

export function formatDuracion(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

const DIAS_LARGOS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];
const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES_LARGOS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export function diaSemanaCorto(d: Date): string {
  const local = toZonedTime(d, TZ);
  return DIAS_CORTOS[local.getDay()] ?? "";
}

export function fechaLargaAR(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const local = toZonedTime(date, TZ);
  const dia = DIAS_LARGOS[local.getDay()] ?? "";
  const num = local.getDate();
  const mes = MESES_LARGOS[local.getMonth()] ?? "";
  return `${dia} ${num} de ${mes}`;
}

export function horaCortaAR(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return tzFormat(date, "HH:mm", { timeZone: TZ });
}

/**
 * Devuelve "YYYY-MM-DD" en TZ local. Sirve como input estable para el calendario.
 */
export function ymdLocal(d: Date): string {
  const local = toZonedTime(d, TZ);
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Lista N días a partir de "hoy" en TZ local.
 */
export function proximosNDias(n: number): Array<{ ymd: string; date: Date; numero: number; mesCorto: string; diaCorto: string }> {
  const hoyLocal = startOfDay(toZonedTime(new Date(), TZ));
  const out: Array<{ ymd: string; date: Date; numero: number; mesCorto: string; diaCorto: string }> = [];
  for (let i = 0; i < n; i++) {
    const d = addDays(hoyLocal, i);
    out.push({
      ymd: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      date: d,
      numero: d.getDate(),
      mesCorto:
        ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][d.getMonth()] ?? "",
      diaCorto: DIAS_CORTOS[d.getDay()] ?? "",
    });
  }
  return out;
}
