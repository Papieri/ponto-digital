/**
 * npm run seed:colaboradores
 *
 * Cadastra os colaboradores com as taxas lidas de
 * `amostras/fechamento_15-07-2026_31-07-2026.csv`.
 *
 * FIXTURE DE DESENVOLVIMENTO, não dado de produção: são as taxas vigentes na
 * quinzena de julho/2026, usadas para que a apuração local produza valores em
 * vez de zeros. O cadastro de verdade é tela da Fase 1 e entra depois.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { closeDb, upsertEmployee } from "../src/server/db";

const CSV = path.resolve(
  import.meta.dirname,
  "../amostras/fechamento_15-07-2026_31-07-2026.csv"
);

function numeroBr(texto: string | undefined): string {
  const limpo = (texto ?? "").replace("R$", "").trim();
  if (!limpo) return "0.00";
  return parseFloat(limpo.replace(/\./g, "").replace(",", ".")).toFixed(2);
}

async function main() {
  const bruto = readFileSync(CSV, "utf-8").replace(/^﻿/, "");
  const [cabecalho, ...linhas] = bruto.trim().split(/\r?\n/);
  const colunas = cabecalho!.split(";").map((c) => c.trim());
  const col = (c: string[], nome: string) => c[colunas.indexOf(nome)];

  for (const linha of linhas) {
    const c = linha.split(";");
    const emp = await upsertEmployee({
      code: parseInt(col(c, "Código")!, 10),
      name: col(c, "Nome")!.trim(),
      department: "PRODUCAO",
      hourlyRate: numeroBr(col(c, "Valor/Hora Base")),
      dailyRate: numeroBr(col(c, "Valor/Dia Base")),
      transportAllowance: numeroBr(col(c, "Passagem/Dia")),
      active: true,
    });
    console.log(
      `${String(emp.code).padStart(3)} ${emp.name.padEnd(16)} ` +
        `hora ${emp.hourlyRate.padStart(7)}  dia ${emp.dailyRate.padStart(7)}  ` +
        `passagem ${emp.transportAllowance.padStart(6)}`
    );
  }
  console.log(`\n${linhas.length} colaboradores cadastrados.`);
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
