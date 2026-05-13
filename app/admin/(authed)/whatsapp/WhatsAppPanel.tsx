"use client";

import { useEffect, useState } from "react";

type BotState = "starting" | "qr" | "ready" | "logged_out" | "error";

type BotStatus = {
  state: BotState;
  pairedNumber: string | null;
  lastError: string | null;
};

type StatusResp =
  | { ok: true; status: BotStatus }
  | { ok: false; error: string };

type QrResp = { ok: true; qr: string | null } | { ok: false; error: string };

const POLL_MS = 3_000;

const COPY_STATE: Record<BotState, { label: string; tone: "info" | "ok" | "warn" | "err" }> = {
  starting: { label: "Iniciando…", tone: "info" },
  qr: { label: "Esperando pareo (escaneá el QR)", tone: "warn" },
  ready: { label: "Pareado y operativo", tone: "ok" },
  logged_out: {
    label: "Sesión expulsada — re-pareá escaneando el QR de nuevo",
    tone: "err",
  },
  error: { label: "Error (reintentando…)", tone: "err" },
};

export function WhatsAppPanel() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function tick(): Promise<void> {
      try {
        const sRes = await fetch("/api/whatsapp/status", { cache: "no-store" });
        const sJson = (await sRes.json()) as StatusResp;
        if (!alive) return;
        if (sJson.ok) {
          setStatus(sJson.status);
          setStatusErr(null);
        } else {
          setStatus(null);
          setStatusErr(sJson.error);
        }
      } catch (err) {
        if (!alive) return;
        setStatus(null);
        setStatusErr(err instanceof Error ? err.message : String(err));
      }

      try {
        const qRes = await fetch("/api/whatsapp/qr", { cache: "no-store" });
        const qJson = (await qRes.json()) as QrResp;
        if (!alive) return;
        if (qJson.ok) {
          setQr(qJson.qr);
        } else {
          setQr(null);
        }
      } catch {
        if (!alive) return;
        setQr(null);
      }
    }

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="space-y-6">
      <StatusBlock status={status} err={statusErr} />
      {qr ? <QrBlock qrDataUrl={qr} /> : null}
      <HelpBlock />
    </div>
  );
}

function StatusBlock({
  status,
  err,
}: {
  status: BotStatus | null;
  err: string | null;
}): React.ReactElement {
  if (err) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4">
        <p className="text-sm font-medium text-destructive">Bot no accesible</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {err}. Si recién deployaste, esperá unos segundos y refrescá. Si
          persiste, revisá los logs del servicio whatsapp-bot.
        </p>
      </div>
    );
  }
  if (!status) {
    return (
      <div className="rounded-md border border-border bg-background p-4">
        <p className="text-sm text-muted-foreground">Consultando estado…</p>
      </div>
    );
  }

  const info = COPY_STATE[status.state];
  const toneClass =
    info.tone === "ok"
      ? "border-emerald-600/40 bg-emerald-50/40 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
      : info.tone === "warn"
        ? "border-amber-600/40 bg-amber-50/40 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
        : info.tone === "err"
          ? "border-destructive/40 bg-destructive/5 text-destructive"
          : "border-border bg-background text-foreground";

  return (
    <div className={`rounded-md border p-4 ${toneClass}`}>
      <p className="text-xs uppercase tracking-[0.25em]">Estado</p>
      <p className="mt-1 text-base font-medium">{info.label}</p>
      {status.pairedNumber ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Cuenta pareada: <code>+{status.pairedNumber}</code>
        </p>
      ) : null}
      {status.lastError ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Detalle: {status.lastError}
        </p>
      ) : null}
    </div>
  );
}

function QrBlock({ qrDataUrl }: { qrDataUrl: string }): React.ReactElement {
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
        Pareo
      </p>
      <p className="mt-1 text-sm text-foreground">
        Abrí WhatsApp en el celular → Configuración → Dispositivos vinculados →
        Vincular un dispositivo. Escaneá este QR:
      </p>
      <div className="mt-4 flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          alt="QR para parear WhatsApp"
          className="h-64 w-64 rounded-sm border border-border bg-white"
        />
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        El QR se refresca automáticamente cada pocos segundos.
      </p>
    </div>
  );
}

function HelpBlock(): React.ReactElement {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
        ¿Cómo funciona?
      </p>
      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        <li>
          Cuando un barbero tiene cargado un <strong>teléfono</strong>, las
          notificaciones se le mandan por WhatsApp (reemplaza el email).
        </li>
        <li>
          Si el barbero no tiene teléfono cargado, sigue recibiendo email como
          antes (sin cambios).
        </li>
        <li>
          Si WhatsApp expulsa la sesión (logout remoto), el bot limpia las
          credenciales y vuelve a mostrar QR — re-pareá desde acá.
        </li>
      </ul>
    </div>
  );
}
