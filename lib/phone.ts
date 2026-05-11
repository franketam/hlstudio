/**
 * Normalización de teléfono argentino a E.164.
 *
 * Decisión MVP: aceptamos formato libre y hacemos best-effort de normalizar a +54 9 XXXXXXXXXX.
 * - Si el input ya viene con + (E.164 de cualquier país) lo respetamos.
 * - Si parece argentino (10/11 dígitos locales, con o sin 9, con o sin 0/15), normalizamos a +549XXXXXXXXXX.
 * - Si no podemos parsear con confianza, devolvemos null y el caller decide qué hacer
 *   (en MVP usamos el string original como key de identidad, aceptando algo de ruido).
 *
 * No usamos libphonenumber: 1 país, costo en bundle no se justifica para MVP.
 */

const SOLO_DIGITOS = /\D+/g;

export function normalizarTelefonoAR(input: string): string | null {
  if (!input) return null;
  const raw = input.trim();

  // Si arranca con + asumimos que ya está en E.164. Limpio espacios/guiones.
  if (raw.startsWith("+")) {
    const digits = raw.slice(1).replace(SOLO_DIGITOS, "");
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  // Caso AR: extraemos solo dígitos.
  let d = raw.replace(SOLO_DIGITOS, "");

  // Sacar prefijo internacional sin +: 0054, 54
  if (d.startsWith("0054")) d = d.slice(4);
  else if (d.startsWith("54") && (d.length === 12 || d.length === 13)) d = d.slice(2);

  // 0 inicial (interurbano): 011 4444-5555 → 11 4444 5555
  if (d.startsWith("0")) d = d.slice(1);

  // 15 después del area code (móvil legacy): 11 15 4444-5555
  // Heurística: si empieza con 11 + 15, sacamos el 15.
  // Más general: si tras el area code (2-4 dígitos) viene un 15, lo quitamos.
  // Implemento la versión simple AMBA + heurística:
  if (d.length === 12 && d.startsWith("11") && d.charAt(2) === "1" && d.charAt(3) === "5") {
    // 11 15 XXXXXXXX → 11 XXXXXXXX
    d = d.slice(0, 2) + d.slice(4);
  }

  // Caso celular AR: tras normalizar deberíamos tener 10 dígitos (area + número).
  // E.164 exige el 9 después del 54 para móviles.
  if (d.length === 10) {
    return `+549${d}`;
  }

  // Si vino "9XXXXXXXXXX" (alguien antepuso 9 ya), respetamos.
  if (d.length === 11 && d.startsWith("9")) {
    return `+54${d}`;
  }

  // No nos animamos a normalizar.
  return null;
}
