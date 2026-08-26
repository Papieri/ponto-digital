/**
 * Inicialização do tRPC.
 *
 * O original vinha de `server/_core/trpc.ts`, da plataforma Manus, e não veio
 * no backup. Este é o equivalente escrito do zero.
 *
 * SEM AUTENTICAÇÃO POR ENQUANTO. A especificação prevê autenticação própria
 * (e-mail e senha, hash, sessão em cookie httpOnly) e o schema já tem a tabela
 * `users`. Enquanto isso não existe, `protectedProcedure` é igual a
 * `publicProcedure` e o servidor só deve rodar em localhost.
 */
import { initTRPC } from "@trpc/server";
import type * as trpcExpress from "@trpc/server/adapters/express";

export function createContext({ req, res }: trpcExpress.CreateExpressContextOptions) {
  return { req, res };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Reservado para quando a autenticação existir. Hoje não protege nada — o
 * nome fica para os routers já marcarem o que deve ser protegido.
 */
export const protectedProcedure = t.procedure;
