import { Fraunces, Geist } from "next/font/google";

/**
 * Fuentes self-hosted via next/font (Google → bundleadas en build).
 * No hay request a Google en runtime.
 *
 * - Fraunces: serif moderno display, alto contraste. Para titulares y marca.
 * - Geist: sans neutra. Para body y UI.
 */
export const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fraunces",
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

export const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
});
