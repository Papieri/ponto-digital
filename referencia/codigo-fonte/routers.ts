import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addTimeRecord,
  createImportBatch,
  deleteEmployee,
  deleteImportBatch,
  deleteTimeRecord,
  getAllEmployees,
  getAllImportBatches,
  getDailySummariesByBatch,
  getDailySummaryByEmployeeAndDate,
  getEmployeeByCode,
  getImportBatchById,
  getPayrollPeriodByEmployee,
  getPayrollPeriodsByBatch,
  getPayrollPeriodSummary,
  getTimeRecordsByBatch,
  getTimeRecordsByEmployeeAndDate,
  insertDailySummaries,
  insertPayrollPeriods,
  insertTimeRecords,
  updateDailySummary,
  updateImportBatch,
  updatePayrollPeriodForEmployee,
  upsertEmployee,
} from "./db";
import { notifyOwner } from "./_core/notification";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  detectPeriod,
  formatMinutes,
  groupByEmployeeAndDay,
  parseTxtContent,
  recalcFromTimestamps,
  toMysqlUtcString,
} from "./timesheetParser";
import { storagePut } from "./storage";

// ─── Employee Router ──────────────────────────────────────────────────────────

const employeeRouter = router({
  list: publicProcedure.query(() => getAllEmployees()),

  upsert: protectedProcedure
    .input(
      z.object({
        code: z.number().int().positive(),
        name: z.string().min(1),
        department: z.string().default("PRODUCAO"),
        hourlyRate: z.string().default("0.00"),
        dailyRate: z.string().default("0.00"),
        transportAllowance: z.string().default("0.00"),
        active: z.boolean().default(true),
      })
    )
    .mutation(({ input }) => upsertEmployee(input)),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => deleteEmployee(input.id)),

  getByCode: publicProcedure
    .input(z.object({ code: z.number().int() }))
    .query(({ input }) => getEmployeeByCode(input.code)),
});

// ─── Import Router ────────────────────────────────────────────────────────────

const importRouter = router({
  list: publicProcedure.query(() => getAllImportBatches()),

  getById: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .query(({ input }) => getImportBatchById(input.id)),

  process: protectedProcedure
    .input(
      z.object({
        filename: z.string(),
        content: z.string(), // Conteúdo do arquivo TXT em base64 ou texto puro
        isBase64: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const textContent = input.isBase64
        ? Buffer.from(input.content, "base64").toString("utf-8")
        : input.content;

      // Parse dos registros
      const records = parseTxtContent(textContent);
      if (records.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Nenhum registro válido encontrado no arquivo.",
        });
      }

      const { periodStart, periodEnd } = detectPeriod(records);

      // Upload para S3
      let s3Key: string | undefined;
      let s3Url: string | undefined;
      try {
        const buffer = Buffer.from(textContent, "utf-8");
        const timestamp = Date.now();
        s3Key = `timesheet-imports/${timestamp}-${input.filename}`;
        const result = await storagePut(s3Key, buffer, "text/plain");
        s3Url = result.url;
      } catch (err) {
        console.warn("[Import] S3 upload failed, continuing without storage:", err);
      }

      // Cria o lote de importação
      const batch = await createImportBatch({
        filename: input.filename,
        s3Key,
        s3Url,
        periodStart,
        periodEnd,
        totalRecords: records.length,
        processedEmployees: 0,
        status: "processing",
        importedBy: ctx.user.id,
      });

      // Insere os registros de ponto - converte Date para string UTC para evitar offset do servidor
      const timeRecordRows = records.map((r) => ({
        batchId: batch.id,
        employeeCode: r.employeeCode,
        employeeName: r.employeeName,
        department: r.department,
        recordedAt: toMysqlUtcString(r.recordedAt),
        machineNo: r.machineNo,
      }));
      await insertTimeRecords(timeRecordRows);

      // Agrupa por funcionário/dia e calcula horas
      const dayGroups = groupByEmployeeAndDay(records);

      // Busca funcionários cadastrados para calcular valores
      const allEmployees = await getAllEmployees();
      const employeeMap = new Map(allEmployees.map((e) => [e.code, e]));

      // Insere resumos diários - usa strings UTC para evitar offset do servidor
      const dailySummaryRows = dayGroups.map((g) => ({
        batchId: batch.id,
        employeeCode: g.employeeCode,
        workDate: g.workDate + " 12:00:00",
        recordCount: g.records.length,
        firstIn: g.firstIn ? toMysqlUtcString(g.firstIn) : null,
        lastOut: g.lastOut ? toMysqlUtcString(g.lastOut) : null,
        totalMinutes: g.totalMinutes,
        hasIssue: g.hasIssue,
        issueDescription: g.issueDescription || null,
      }));
      await insertDailySummaries(dailySummaryRows);

      // Agrupa por funcionário para calcular totais do período
      const employeeTotals = new Map<
        number,
        {
          employeeName: string;
          workedDays: number;
          totalMinutes: number;
          missingDays: number;
        }
      >();

      for (const g of dayGroups) {
        const existing = employeeTotals.get(g.employeeCode) ?? {
          employeeName: g.employeeName,
          workedDays: 0,
          totalMinutes: 0,
          missingDays: 0,
        };
        existing.workedDays += 1;
        existing.totalMinutes += g.totalMinutes;
        if (g.hasIssue) existing.missingDays += 1;
        employeeTotals.set(g.employeeCode, existing);
      }

      // Cria os períodos de folha de pagamento
      const payrollRows = Array.from(employeeTotals.entries()).map(
        ([code, totals]) => {
          const emp = employeeMap.get(code);
          const hourlyRate = emp ? parseFloat(emp.hourlyRate) : 0;
          const dailyRate = emp ? parseFloat(emp.dailyRate) : 0;
          const transport = emp ? parseFloat(emp.transportAllowance ?? "0") : 0;

          const totalHours = totals.totalMinutes / 60;
          const totalByHour = totalHours * hourlyRate;
          const totalByDay = totals.workedDays * dailyRate;
          const transportTotal = totals.workedDays * transport;

          const status =
            totals.missingDays >= 3
              ? "critical"
              : totals.missingDays >= 1
                ? "warning"
                : "ok";

          return {
            batchId: batch.id,
            employeeCode: code,
            employeeName: totals.employeeName,
            periodStart,
            periodEnd,
            workedDays: totals.workedDays,
            totalMinutes: totals.totalMinutes,
            hourlyRate: String(hourlyRate.toFixed(2)),
            dailyRate: String(dailyRate.toFixed(2)),
            transportAllowance: String(transport.toFixed(2)),
            totalByHour: String(totalByHour.toFixed(2)),
            totalByDay: String(totalByDay.toFixed(2)),
            transportTotal: String(transportTotal.toFixed(2)),
            missingDays: totals.missingDays,
            status: status as "ok" | "warning" | "critical",
          };
        }
      );

      await insertPayrollPeriods(payrollRows);

      // Atualiza o lote
      await updateImportBatch(batch.id, {
        status: "completed",
        processedEmployees: employeeTotals.size,
      });

      // Notificações
      const criticalCount = payrollRows.filter((p) => p.status === "critical").length;
      const warningCount = payrollRows.filter((p) => p.status === "warning").length;

      // periodStart/periodEnd são strings 'YYYY-MM-DD HH:MM:SS'
      const fmtDateStr = (s: string) => { const [y,m,d] = s.split(" ")[0]!.split("-"); return `${d}/${m}/${y}`; };
      const periodLabel = `${fmtDateStr(periodStart)} a ${fmtDateStr(periodEnd)}`;

      if (criticalCount > 0 || warningCount > 0) {
        await notifyOwner({
          title: `⚠️ Registros faltantes detectados — ${periodLabel}`,
          content: `Importação processada com alertas:\n• ${criticalCount} funcionário(s) com situação crítica (3+ dias incompletos)\n• ${warningCount} funcionário(s) com avisos (1-2 dias incompletos)\n\nTotal de funcionários processados: ${employeeTotals.size}\nTotal de registros: ${records.length}`,
        });
      } else {
        await notifyOwner({
          title: `✅ Fechamento quinzenal processado — ${periodLabel}`,
          content: `Importação concluída com sucesso.\n• Funcionários: ${employeeTotals.size}\n• Registros: ${records.length}\n• Período: ${periodLabel}`,
        });
      }

      return {
        batchId: batch.id,
        totalRecords: records.length,
        processedEmployees: employeeTotals.size,
        periodStart,
        periodEnd,
        criticalCount,
        warningCount,
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

  // ─── Edição de registros de ponto ─────────────────────────────────────────

  getDayRecords: publicProcedure
    .input(
      z.object({
        batchId: z.number().int(),
        employeeCode: z.number().int(),
        workDate: z.string(), // YYYY-MM-DD
      })
    )
    .query(({ input }) =>
      getTimeRecordsByEmployeeAndDate(
        input.batchId,
        input.employeeCode,
        input.workDate
      )
    ),

  addRecord: protectedProcedure
    .input(
      z.object({
        batchId: z.number().int(),
        employeeCode: z.number().int(),
        employeeName: z.string(),
        department: z.string().default("PRODUCAO"),
        recordedAt: z.string(), // ISO string
        workDate: z.string(), // YYYY-MM-DD for recalc
      })
    )
    .mutation(async ({ input }) => {
      // Converte ISO string para string UTC MySQL sem offset do servidor
      const recordedAt = toMysqlUtcString(new Date(input.recordedAt));
      await addTimeRecord({
        batchId: input.batchId,
        employeeCode: input.employeeCode,
        employeeName: input.employeeName,
        department: input.department,
        recordedAt,
        machineNo: "MANUAL",
        isManual: true,
      });
      return recalcDay(
        input.batchId,
        input.employeeCode,
        input.workDate
      );
    }),

  removeRecord: protectedProcedure
    .input(
      z.object({
        recordId: z.number().int(),
        batchId: z.number().int(),
        employeeCode: z.number().int(),
        workDate: z.string(), // YYYY-MM-DD for recalc
      })
    )
    .mutation(async ({ input }) => {
      await deleteTimeRecord(input.recordId);
      return recalcDay(
        input.batchId,
        input.employeeCode,
        input.workDate
      );
    }),
  deleteBatch: protectedProcedure
    .input(z.object({ batchId: z.number().int() }))
    .mutation(async ({ input }) => {
      await deleteImportBatch(input.batchId);
      return { success: true };
    }),
});

// ─── Helper: recalcula resumo diário + período de folha ───────────────────────

async function recalcDay(
  batchId: number,
  employeeCode: number,
  workDate: string
) {
  // Busca todos os registros do dia
  const records = await getTimeRecordsByEmployeeAndDate(
    batchId,
    employeeCode,
    workDate
  );

  const timestamps = records.map((r) => r.recordedAt);
  const { totalMinutes, hasIssue, issueDescription, firstIn, lastOut } =
    recalcFromTimestamps(timestamps);

  // Atualiza o resumo diário
  const existing = await getDailySummaryByEmployeeAndDate(
    batchId,
    employeeCode,
    workDate
  );

  if (existing) {
    await updateDailySummary(existing.id, {
      recordCount: records.length,
      firstIn: firstIn ?? undefined,
      lastOut: lastOut ?? undefined,
      totalMinutes,
      hasIssue,
      issueDescription: issueDescription || null,
    });
  }

  // Recalcula o período de folha do funcionário
  await recalcPayrollForEmployee(batchId, employeeCode);

  return {
    records,
    totalMinutes,
    hasIssue,
    issueDescription,
    firstIn,
    lastOut,
    recordCount: records.length,
  };
}

async function recalcPayrollForEmployee(
  batchId: number,
  employeeCode: number
) {
  // Busca todos os resumos diários do funcionário neste lote
  const allDailySummaries = await getDailySummariesByBatch(batchId);
  const empDays = allDailySummaries.filter(
    (d) => d.employeeCode === employeeCode
  );

  const workedDays = empDays.length;
  const totalMinutes = empDays.reduce((sum, d) => sum + (d.totalMinutes ?? 0), 0);
  const missingDays = empDays.filter((d) => d.hasIssue).length;

  const status =
    missingDays >= 3 ? "critical" : missingDays >= 1 ? "warning" : "ok";

  // Busca taxas do funcionário
  const allEmployees = await getAllEmployees();
  const emp = allEmployees.find((e) => e.code === employeeCode);
  const hourlyRate = emp ? parseFloat(emp.hourlyRate) : 0;
  const dailyRate = emp ? parseFloat(emp.dailyRate) : 0;
  const transport = emp ? parseFloat(emp.transportAllowance ?? "0") : 0;

  const totalHours = totalMinutes / 60;
  const totalByHour = totalHours * hourlyRate;
  const totalByDay = workedDays * dailyRate;
  const transportTotal = workedDays * transport;

  await updatePayrollPeriodForEmployee(batchId, employeeCode, {
    workedDays,
    totalMinutes,
    totalByHour: String(totalByHour.toFixed(2)),
    totalByDay: String(totalByDay.toFixed(2)),
    transportTotal: String(transportTotal.toFixed(2)),
    missingDays,
    status: status as "ok" | "warning" | "critical",
  });

  return { workedDays, totalMinutes, missingDays, status };
}

const _importRouter = importRouter; // keep reference for appRouter
export { _importRouter as importRouterRef };

// ─── App Router ───────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  employee: employeeRouter,
  import: importRouter,
});

export type AppRouter = typeof appRouter;
