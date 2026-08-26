import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Clock,
  FileText,
  LogIn,
  LogOut,
  Menu,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "./ui/button";

const navItems = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/employees", label: "Funcionários", icon: Users },
  { href: "/import", label: "Importar Ponto", icon: Upload },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col w-64 transition-transform duration-300",
          "lg:translate-x-0 lg:static lg:flex",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ backgroundColor: "oklch(0.18 0.025 255)" }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-6 py-5 border-b"
          style={{ borderColor: "oklch(0.28 0.03 255)" }}
        >
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600">
            <Clock className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-tight">
              Ponto Digital
            </p>
            <p className="text-xs" style={{ color: "oklch(0.65 0.04 255)" }}>
              Gestão de Horas
            </p>
          </div>
          <button
            className="ml-auto lg:hidden text-white/60 hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = location === href;
            return (
              <Link key={href} href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                )}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div
          className="px-4 py-4 border-t"
          style={{ borderColor: "oklch(0.28 0.03 255)" }}
        >
          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white text-xs font-semibold flex-shrink-0">
                {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">
                  {user?.name ?? "Usuário"}
                </p>
                <p className="text-xs truncate" style={{ color: "oklch(0.65 0.04 255)" }}>
                  {user?.email ?? ""}
                </p>
              </div>
              <button
                onClick={() => logout()}
                className="text-white/50 hover:text-white transition-colors"
                title="Sair"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <a href={getLoginUrl()}>
              <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                <LogIn className="w-4 h-4 mr-2" />
                Entrar
              </Button>
            </a>
          )}
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-4 px-4 py-3 bg-white border-b border-border lg:px-6">
          <button
            className="lg:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="w-4 h-4" />
            <span>Sistema de Ponto Eletrônico</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
