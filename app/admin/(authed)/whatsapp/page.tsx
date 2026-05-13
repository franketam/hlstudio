import { WhatsAppPanel } from "./WhatsAppPanel";

export const metadata = {
  title: "WhatsApp — HLstudio",
};

export const dynamic = "force-dynamic";

export default function WhatsAppAdminPage() {
  return (
    <div className="container max-w-2xl py-8">
      <div className="mb-5">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Panel
        </p>
        <h1 className="display-tight mt-2 text-3xl sm:text-4xl">WhatsApp</h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Estado del bot interno. Acá se parea la cuenta de WhatsApp escaneando
          el QR desde el celular. Una vez pareado, los avisos a clientes y
          barberos (con teléfono cargado) se envían por WhatsApp en vez de email.
        </p>
      </div>
      <WhatsAppPanel />
    </div>
  );
}
