import type { Metadata, Viewport } from "next";
import { fraunces, geist } from "@/app/fonts";
import { APP_NAME, APP_SHORT_DESCRIPTION } from "@/lib/constants";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} · Barbería`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_SHORT_DESCRIPTION,
  applicationName: APP_NAME,
  authors: [{ name: APP_NAME }],
  openGraph: {
    title: APP_NAME,
    description: APP_SHORT_DESCRIPTION,
    type: "website",
    locale: "es_AR",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es-AR" className={`${fraunces.variable} ${geist.variable}`}>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
