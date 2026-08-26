import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * REGRA DE FUSO — não alterar sem ler o CLAUDE.md.
 *
 * O servidor devolve horários como 'YYYY-MM-DD HH:MM:SS', sem fuso, que devem
 * ser lidos como UTC. Sem o `Z` explícito, o navegador interpreta no fuso da
 * máquina e desloca tudo — foi a origem de três bugs de "+3h" no original.
 */
export function paraDataUtc(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null;
  if (valor instanceof Date) return valor;
  const s = valor.replace(" ", "T");
  const temFuso = s.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(s);
  return new Date(temFuso ? s : s + "Z");
}

/** Sempre exibido em UTC, pelo mesmo motivo. */
export function formatarData(valor: string | Date | null | undefined): string {
  const d = paraDataUtc(valor);
  return d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";
}

export function formatarDataHora(valor: string | Date | null | undefined): string {
  const d = paraDataUtc(valor);
  if (!d) return "—";
  return d.toLocaleString("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatarMinutos(minutos: number | null | undefined): string {
  const m = minutos ?? 0;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function formatarReais(valor: string | number | null | undefined): string {
  const n = typeof valor === "string" ? parseFloat(valor) : (valor ?? 0);
  return (Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
