/**
 * Correção 6.5 — "Recalcular valores".
 *
 * O que precisa ser provado não é a aritmética (isso é `calculo.test.ts`), e sim
 * a promessa da correção: alterar o cadastro passa a refletir no lote, e o
 * recálculo NÃO apaga as correções manuais de batida — que era o motivo de
 * excluir-e-reimportar ser inaceitável.
 *
 * Precisa de banco: sem DATABASE_URL o bloco é ignorado.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeDb,
  deleteImportBatch,
  getDailySummariesByBatch,
  getPayrollPeriodsByBatch,
  getTimeRecordsByBatch,
  updateDailySummary,
  upsertEmployee,
} from "./db";
import { importarConteudoTxt, recalcularValores } from "./importarPonto";

const temBanco = Boolean(process.env.DATABASE_URL);
const AMOSTRA = path.resolve(
  import.meta.dirname,
  "../../amostras/Registo_de_comparec_.txt"
);

describe.skipIf(!temBanco)("6.5 — recalcular valores", () => {
  let batchId: number;

  beforeAll(async () => {
    await upsertEmployee({
      code: 3,
      name: "Elaine",
      department: "PRODUCAO",
      hourlyRate: "16.66",
      dailyRate: "150.00",
      transportAllowance: "0.00",
      active: true,
    });
    const r = await importarConteudoTxt(
      "amostra-recalculo.txt",
      readFileSync(AMOSTRA, "utf-8")
    );
    batchId = r.batchId;
  });

  afterAll(async () => {
    if (batchId) await deleteImportBatch(batchId);
    await closeDb();
  });

  it("alterar a taxa do cadastro passa a refletir no lote", async () => {
    const antes = (await getPayrollPeriodsByBatch(batchId)).find(
      (p) => p.employeeCode === 3
    )!;
    expect(parseFloat(antes.hourlyRate)).toBe(16.66);
    const valorAntes = parseFloat(antes.totalByHour);

    // Dobra o valor/hora no cadastro
    await upsertEmployee({
      code: 3,
      name: "Elaine",
      department: "PRODUCAO",
      hourlyRate: "33.32",
      dailyRate: "150.00",
      transportAllowance: "0.00",
      active: true,
    });

    // Sem recalcular, o lote continua congelado — esse é o bug da 6.5
    const congelado = (await getPayrollPeriodsByBatch(batchId)).find(
      (p) => p.employeeCode === 3
    )!;
    expect(parseFloat(congelado.totalByHour)).toBe(valorAntes);

    await recalcularValores(batchId);

    const depois = (await getPayrollPeriodsByBatch(batchId)).find(
      (p) => p.employeeCode === 3
    )!;
    expect(parseFloat(depois.hourlyRate)).toBe(33.32);
    expect(parseFloat(depois.totalByHour)).toBeCloseTo(valorAntes * 2, 1);

    // devolve o cadastro ao valor original para não vazar entre testes
    await upsertEmployee({
      code: 3,
      name: "Elaine",
      department: "PRODUCAO",
      hourlyRate: "16.66",
      dailyRate: "150.00",
      transportAllowance: "0.00",
      active: true,
    });
    await recalcularValores(batchId);
  });

  it("não apaga batidas nem resumos diários", async () => {
    const batidasAntes = (await getTimeRecordsByBatch(batchId)).length;
    const resumosAntes = (await getDailySummariesByBatch(batchId)).length;

    await recalcularValores(batchId);

    expect((await getTimeRecordsByBatch(batchId)).length).toBe(batidasAntes);
    expect((await getDailySummariesByBatch(batchId)).length).toBe(resumosAntes);
  });

  it("preserva a correção manual de batida e a usa na conta", async () => {
    // Simula o operador fechando o dia em aberto da Raquel em 21/08:
    // 3 batidas viram 4, o dia deixa de ter problema e ganha minutos.
    const resumos = await getDailySummariesByBatch(batchId);
    const diaEmAberto = resumos.find(
      (r) => r.employeeCode === 4 && r.workDate.startsWith("2026-08-21")
    )!;
    expect(diaEmAberto.hasIssue).toBe(true);
    expect(diaEmAberto.recordCount).toBe(3);

    const minutosCorrigidos = diaEmAberto.totalMinutes + 240;
    await updateDailySummary(diaEmAberto.id, {
      recordCount: 4,
      totalMinutes: minutosCorrigidos,
      hasIssue: false,
      issueDescription: null,
    });

    await recalcularValores(batchId);

    // A correção continua no banco depois do recálculo
    const depoisResumo = (await getDailySummariesByBatch(batchId)).find(
      (r) => r.id === diaEmAberto.id
    )!;
    expect(depoisResumo.totalMinutes).toBe(minutosCorrigidos);
    expect(depoisResumo.hasIssue).toBe(false);
    expect(depoisResumo.recordCount).toBe(4);

    // ...e o fechamento passou a refletir a correção
    const raquel = (await getPayrollPeriodsByBatch(batchId)).find(
      (p) => p.employeeCode === 4
    )!;
    expect(raquel.missingDays).toBe(0);
    expect(raquel.status).toBe("ok");
    const somaResumos = (await getDailySummariesByBatch(batchId))
      .filter((r) => r.employeeCode === 4)
      .reduce((s, r) => s + r.totalMinutes, 0);
    expect(raquel.totalMinutes).toBe(somaResumos);
  });

  it("é idempotente: rodar duas vezes dá o mesmo resultado", async () => {
    await recalcularValores(batchId);
    const primeira = await getPayrollPeriodsByBatch(batchId);
    await recalcularValores(batchId);
    const segunda = await getPayrollPeriodsByBatch(batchId);

    expect(segunda.map((p) => [p.employeeCode, p.totalValue, p.amountToPay])).toEqual(
      primeira.map((p) => [p.employeeCode, p.totalValue, p.amountToPay])
    );
  });
});
