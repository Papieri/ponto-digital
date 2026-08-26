import { Clock, FileStack, Upload, Users } from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

const navegacao = [
  { href: "/", rotulo: "Lotes", icone: FileStack },
  { href: "/colaboradores", rotulo: "Colaboradores", icone: Users },
  { href: "/importar", rotulo: "Importar Ponto", icone: Upload },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [local] = useLocation();

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

        <p className="border-t border-white/10 px-5 py-3 text-xs leading-relaxed text-white/40">
          Uso interno · sem login
        </p>
      </aside>

      <main className="min-w-0 flex-1 p-5 lg:p-7">{children}</main>
    </div>
  );
}
