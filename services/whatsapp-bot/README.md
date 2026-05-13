# HLstudio — WhatsApp bot

Servicio Node/Express con [Baileys](https://github.com/WhiskeySockets/Baileys)
para enviar notificaciones por WhatsApp desde la app principal HLstudio.

## Endpoints

- `GET /health` — sin auth, devuelve `{ ok: true }`. Para healthcheck de Coolify.
- `GET /status` — `{ state: 'starting'|'qr'|'ready'|'logged_out'|'error', pairedNumber, lastError }`.
- `GET /qr` — devuelve el QR vigente como dataURL `{ qr: "data:image/png;base64,..." }`. 404 si no hay QR pendiente.
- `POST /send` — body `{ to: "<E.164 sin +>", text: "..." }`. Devuelve `{ ok, messageId? }`.

Todos los endpoints (excepto `/health`) requieren `Authorization: Bearer <WHATSAPP_BOT_TOKEN>`
si el bot tiene token configurado.

## Variables de entorno

- `PORT` — default `3001`.
- `AUTH_DIR` — directorio donde Baileys persiste las credenciales (default `./.auth` en dev, `/data/auth` en docker).
- `WHATSAPP_BOT_TOKEN` — bearer compartido con la app principal. Opcional en dev.
- `LOG_LEVEL` — pino level (`debug`, `info`, `warn`, `error`). Default `info`.

## Pareo (primera vez)

1. Levantar el servicio.
2. Desde el panel admin, ir a `/admin/whatsapp` — muestra el QR.
3. Escanear con el celular (WhatsApp → Configuración → Dispositivos vinculados).
4. Estado pasa a `ready` automáticamente.

## Auto-clean en logout

Si WhatsApp expulsa la sesión (`DisconnectReason.loggedOut`), el bot:
1. Borra el `AUTH_DIR`.
2. Reconecta y muestra un QR nuevo.
3. El admin re-parea desde el panel.

## Local dev

```bash
cd services/whatsapp-bot
npm install
npm run dev
```

El bot escucha en `localhost:3001`. La app principal apunta con `WHATSAPP_BOT_URL=http://localhost:3001` en `.env.local`.
