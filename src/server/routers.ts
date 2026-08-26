/**
 * Routers tRPC — portados de `referencia/codigo-fonte/routers.ts`.
 *
 * Mudanças em relação ao original: sem OAuth da plataforma, sem notificação ao
 * dono, e o storage passa pela interface (`storage/`) em vez do proxy do Manus.
 * A apuração e o cálculo não mudam — vêm de `importarPonto.ts` e `calculo.ts`.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "./trpc";
import {
  deleteEmployee,
  deleteImportBatch,
  getAllEmployees,
  getAllImportBatches,
  getDailySummariesByBatch,
  getEmployeeByCode,
  getImportBatchById,
  getPayrollPeriodsByBatch,
  getPayrollPeriodSummary,
  getTimeRecordsByBatch,
  updateImportBatch,
  upsertEmployee,
} from "./db";
import { importarConteudoTxt, recalcularValores } from "./importarPonto";
import { DiasEmAbertoError, PeriodoInvalidoError } from "./correcoes";
import { StorageDiscoLocal } from "./storage";

const storage = new StorageDiscoLocal();

/** 'YYYY-MM-DD HH:MM:SS', o formato UTC usado em toda a pilha. */
const timestampUtc = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, "Use 'YYYY-MM-DD HH:MM:SS'");

/** Valor monetário como string, do jeito que o Postgres `numeric` espera. */
const valorMonetario = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Use um valor como 16.66")
  .default("0.00");

// ─── Colaboradores ───────────────────────────────────────────────────────────

const employeeRouter = router({
  list: publicProcedure.query(() => getAllEmployees()),

  getByCode: publicProcedure
    .input(z.object({ code: z.number().int() }))
    .query(({ input }) => getEmployeeByCode(input.code)),

  upsert: protectedProcedure
    .input(
      z.object({
        code: z.number().int().positive(),
        name: z.string().min(1),
        department: z.string().default("PRODUCAO"),
        hourlyRate: valorMonetario,
        dailyRate: valorMonetario,
        transportAllowance: valorMonetario,
        active: z.boolean().default(true),
      })
    )
    .mutation(({ input }) => upsertEmployee(input)),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => deleteEmployee(input.id)),
});

// ─── Importação ──────────────────────────────────────────────────────────────

/**
 * O relógio de ponto exporta ora em UTF-8, ora em ANSI (latin1). O original
 * assumia latin1 e teria embaralhado acentos num arquivo UTF-8. Aqui o
 * conteúdo chega em base64 e a decodificação é decidida no servidor: tenta
 * UTF-8 estrito e, se o arquivo não for UTF-8 válido, cai para latin1.
 */
function decodificarTxt(base64: string): string {
  const bytes = Buffer.from(base64, "base64");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("latin1").decode(bytes);
  }
}

const importRouter = router({
  list: publicProcedure.query(() => getAllImportBatches()),

  getById: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .query(({ input }) => getImportBatchById(input.id)),

  process: protectedProcedure
    .input(
      z.object({
        filename: z.string().min(1),
        /** Conteúdo do TXT em base64 — ver `decodificarTxt`. */
        contentBase64: z.string().min(1),
        /** Correção 6.2: período confirmado ou ajustado pelo operador. */
        periodo: z
          .object({ periodStart: timestampUtc, periodEnd: timestampUtc })
          .optional(),
      })
    )
    .mutation(async ({ input }) => {
      const texto = decodificarTxt(input.contentBase64);

      let resultado;
      try {
        resultado = await importarConteudoTxt(input.filename, texto, {
          periodo: input.periodo,
        });
      } catch (erro) {
        if (erro instanceof PeriodoInvalidoError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: erro.message });
        }
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: erro instanceof Error ? erro.message : "Falha ao processar o arquivo.",
        });
      }

      // Guarda o arquivo original. Falhar aqui não invalida a apuração.
      try {
        const chave = `importacoes/${resultado.batchId}-${input.filename}`;
        await storage.salvar(chave, Buffer.from(texto, "utf-8"));
        await updateImportBatch(resultado.batchId, { storageKey: chave });
      } catch (erro) {
        console.warn("[Import] arquivo não pôde ser guardado:", erro);
      }

      const periodos = await getPayrollPeriodsByBatch(resultado.batchId);

      return {
        batchId: resultado.batchId,
        totalRecords: resultado.totalRecords,
        processedEmployees: resultado.processedEmployees,
        periodStart: resultado.periodStart,
        periodEnd: resultado.periodEnd,
        periodConfirmed: resultado.periodConfirmed,
        criticalCount: periodos.filter((p) => p.status === "critical").length,
        warningCount: periodos.filter((p) => p.status === "warning").length,
        /** Correção 6.4 */
        diasEmAberto: resultado.diasEmAberto,
        /** Correção 6.3 */
        diasTruncados: resultado.dias
          .filter((d) => d.exportTruncado)
          .map((d) => ({
            employeeCode: d.employeeCode,
            employeeName: d.employeeName,
            workDate: d.workDate,
            recordCount: d.records.length,
          })),
        /** Colaboradores do arquivo que não estão no cadastro — apuram valor zero. */
        semCadastro: await (async () => {
          const cadastrados = new Set((await getAllEmployees()).map((e) => e.code));
          return periodos
            .filter((p) => !cadastrados.has(p.employeeCode))
            .map((p) => ({ code: p.employeeCode, name: p.employeeName }));
        })(),
      };
    }),

  getRecords: publicProcedure
    .input(z.object({ batchId: z.number().int() }))
    .query(({ input }) => getTimeRecordsByBatch(input.batchId)),

  getDailySummaries: publicProcedure
    .input(z.object({ batchId: z.number().int() }))
    .query(({ input }) => getDailySummariesByBatch(input.batchId)),

  getPayrollPeriods: publicProcedure
    .input(z.object({ batchId: z.number().int() }))
    .query(({ input }) => getPayrollPeriodsByBatch(input.batchId)),

  getPayrollSummary: publicProcedure
    .input(z.object({ batchId: z.number().int() }))
    .query(({ input }) => getPayrollPeriodSummary(input.batchId)),

  /** Correção 6.5 — relê o cadastro e refaz as contas sem apagar correções. */
  recalcular: protectedProcedure
    .input(z.object({ batchId: z.number().int() }))
    .mutation(({ input }) => recalcularValores(input.batchId)),

  /** Correção 6.4 — o fechamento exige confirmação se houver dia em aberto. */
  fechar: protectedProcedure
    .input(
      z.object({
        batchId: z.number().int(),
        confirmarDiasEmAberto: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const resumos = await getDailySummariesByBatch(input.batchId);
      const emAberto = resumos
        .filter((r) => r.recordCount % 2 !== 0 && r.hasIssue)
        .map((r) => ({
          employeeCode: r.employeeCode,
          workDate: r.workDate.slice(0, 10),
          recordCount: r.recordCount,
        }));

      if (emAberto.length > 0 && !input.confirmarDiasEmAberto) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: new DiasEmAbertoError(
            emAberto.map((d) => ({
              ...d,
              employeeName: String(d.employeeCode),
              issueDescription: "Número ímpar de registros",
            }))
          ).message,
        });
      }

      await updateImportBatch(input.batchId, { status: "completed" });
      return { batchId: input.batchId, diasEmAbertoConfirmados: emAberto.length };
    }),

  delete: protectedProcedure
    .input(z.object({ batchId: z.number().int() }))
    .mutation(async ({ input }) => {
      const lote = await getImportBatchById(input.batchId);
      if (lote?.storageKey) {
        try {
          await storage.apagar(lote.storageKey);
        } catch (erro) {
          console.warn("[Import] arquivo não pôde ser apagado:", erro);
        }
      }
      await deleteImportBatch(input.batchId);
      return { success: true };
    }),
});

export const appRouter = router({
  employee: employeeRouter,
  import: importRouter,
});

export type AppRouter = typeof appRouter;
