/**
 * Regressão de fuso horário na camada de banco.
 *
 * O driver `postgres` converte, por padrão, `timestamp without time zone`
 * (OID 1114) em `Date` usando o fuso local do processo. Rodando em
 * America/Sao_Paulo, a batida 06:35:35 vira um Date cujo getUTCHours() é 9 —
 * o bug de "+3h" descrito no CLAUDE.md, agora vindo do driver em vez do ORM.
 *
 * `getDb()` sobrescreve o parser desse OID para devolver a string crua. Este
 * teste existe para que ninguém remova essa sobrescrita sem quebrar o build.
 *
 * Precisa de banco: sem DATABASE_URL o bloco é ignorado.
 */
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "./db";
import { sql } from "drizzle-orm";

const temBanco = Boolean(process.env.DATABASE_URL);

describe.skipIf(!temBanco)("db — timestamp sem timezone", () => {
  afterAll(async () => {
    await closeDb();
  });

  it("devolve a string crua, sem virar Date", async () => {
    const linhas = await getDb().execute<{ t: unknown }>(
      sql`select '2026-08-17 06:35:35'::timestamp as t`
    );
    const t = linhas[0]!.t;
    expect(typeof t).toBe("string");
    expect(t).toBe("2026-08-17 06:35:35");
  });

  it("preserva o valor na ida e na volta", async () => {
    const original = "2026-08-24 23:59:59";
    const linhas = await getDb().execute<{ t: unknown }>(
      sql`select ${original}::timestamp as t`
    );
    expect(linhas[0]!.t).toBe(original);
  });
});
