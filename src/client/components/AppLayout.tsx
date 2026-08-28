import { useEffect, useState } from "react";
import { AlertTriangle, Clock, FileStack, Upload, Users } from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

const navegacao = [
  { href: "/", rotulo: "Lotes", icone: FileStack },
  { href: "/colaboradores", rotulo: "Colaboradores", icone: Users },
  { href: "/importar", rotulo: "Importar Ponto", icone: Upload },
];

/**
 * Compara a versão gravada nesta tela no momento do build com a versão que o
 * servidor está rodando. Divergiram: ou faltou `npm run build` depois de
 * atualizar, ou sobrou um servidor antigo no ar. Os dois enganam feio, porque
 * o programa continua funcionando — só que mostrando a versão anterior.
 */
function useVersao() {
  const cliente = __VERSAO_CLIENTE__;
  const [servidor, setServidor] = useState<{ commit: string; data: string } | null>(null);

  useEffect(() => {
    fetch("/api/saude")
      .then((r) => r.json())
      .then((d) => setServidor(d.versao ?? null))
      .catch(() => setServidor(null));
  }, []);

  const podeComparar =
    servidor !== null &&
    servidor.commit !== "desconhecida" &&
    cliente.commit !== "desconhecida";

  return {
    cliente,
    servidor,
    desatualizada: podeComparar && servidor.commit !== cliente.commit,
  };
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [local] = useLocation();
  const { cliente, servidor, desatualizada } = useVersao();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 flex-col bg-[oklch(0.20_0.025_255)] sm:flex">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Clock className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight text-white">Ponto Digital</p>
            <p className="text-xs text-white/50">Papieri</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navegacao.map(({ href, rotulo, icone: Icone }) => {
            const ativo = local === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  ativo ? "bg-primary text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                <Icone className="h-4 w-4 shrink-0" />
                {rotulo}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-5 py-3 text-xs leading-relaxed text-white/40">
          <p>Uso interno · sem login</p>
          <p className="mt-1" title="Versão destas telas">
            versão {cliente.commit}
            {cliente.data && ` · ${cliente.data}`}
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {desatualizada && (
          <div className="flex items-start gap-2.5 border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-sm text-amber-900 lg:px-7">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <strong>Esta tela está desatualizada.</strong> Ela foi construída na
              versão {cliente.commit}, mas o programa está rodando a{" "}
              {servidor?.commit}. Feche o programa, rode{" "}
              <code className="rounded bg-amber-100 px-1">npm run build</code> e abra
              de novo.
            </p>
          </div>
        )}
        <main className="min-w-0 flex-1 p-5 lg:p-7">{children}</main>
      </div>
    </div>
  );
}
