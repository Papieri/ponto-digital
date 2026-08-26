/**
 * Pipeline de importação — portado de `import.process` em
 * `referencia/codigo-fonte/routers.ts`, sem tRPC, sem storage e sem notificação.
 *
 * A apuração é exatamente a do original: parse → agrupamento por
 * funcionário/dia → totais do período. Nenhuma regra de cálculo foi tocada.
 *
 * Não implementado de propósito neste marco (ver CLAUDE.md, "Correções
 * obrigatórias"): `countsAsWorkedDay` (6.1, regra ainda não definida),
 * `periodConfirmed` (6.2), tratamento do último dia truncado (6.3),
 * batidas ímpares (6.4) e recálculo de valores (6.5). As colunas existem no
 * schema e ficam no default.
 */
import {
  detectPeriod,
  groupByEmployeeAndDay,
  parseTxtContent,
  toMysqlUtcString,
  type ParsedRecord,
} from "./timesheetParser";
import {
  createImportBatch,
  getAllEmployees,
  insertDailySummaries,
  insertPayrollPeriods,
  insertTimeRecords,
  updateImportBatch,
} from "./db";

export interface TotaisColaborador {
  employeeCode: number;
  employeeName: string;
  workedDays: number;
  totalMinutes: number;
  missingDays: number;
}

/** Status do colaborador no período: 0 = ok · 1 a 2 = aviso · 3+ = crítico. */
export function statusDoPeriodo(
  missingDays: number
): "ok" | "warning" | "critical" {
  return missingDays >= 3 ? "critical" : missingDays >= 1 ? "warning" : "ok";
}

/**
 * Consolida os grupos dia a dia em totais por colaborador.
 * Regra atual (ver correção 6.1): todo dia com registro conta como dia
 * trabalhado, tenha ou não horas apuradas.
 */
export function totalizarPorColaborador(
  dayGroups: ReturnType<typeof groupByEmployeeAndDay>
): Map<number, TotaisColaborador> {
  const totais = new Map<number, TotaisColaborador>();

  for (const g of dayGroups) {
    const atual = totais.get(g.employeeCode) ?? {
      employeeCode: g.employeeCode,
      employeeName: g.employeeName,
      workedDays: 0,
      totalMinutes: 0,
      missingDays: 0,
    };
    atual.workedDays += 1;
    atual.totalMinutes += g.totalMinutes;
    if (g.hasIssue) atual.missingDays += 1;
    totais.set(g.employeeCode, atual);
  }

  return totais;
}

export interface ResultadoImportacao {
  batchId: number;
  totalRecords: number;
  processedEmployees: number;
  periodStart: string;
  periodEnd: string;
  registros: ParsedRecord[];
}

/** Importa o conteúdo de um TXT do relógio para o banco. */
export async function importarConteudoTxt(
  filename: string,
  textContent: string
): Promise<ResultadoImportacao> {
  const records = parseTxtContent(textContent);
  if (records.length === 0) {
    throw new Error("Nenhum registro válido encontrado no arquivo.");
  }

  const { periodStart, periodEnd } = detectPeriod(records);

  const batch = await createImportBatch({
    filename,
    periodStart,
    periodEnd,
    totalRecords: records.length,
    processedEmployees: 0,
    status: "processing",
  });

  // Batidas — gravadas como string UTC, sem conversão de fuso em ponto nenhum.
  await insertTimeRecords(
    records.map((r) => ({
      batchId: batch.id,
      employeeCode: r.employeeCode,
      employeeName: r.employeeName,
      department: r.department,
      recordedAt: toMysqlUtcString(r.recordedAt),
      machineNo: r.machineNo,
    }))
  );

  const dayGroups = groupByEmployeeAndDay(records);

  await insertDailySummaries(
    dayGroups.map((g) => ({
      batchId: batch.id,
      employeeCode: g.employeeCode,
      // meio-dia UTC, como no original: identifica o dia sem risco de virar data
      workDate: g.workDate + " 12:00:00",
      recordCount: g.records.length,
      firstIn: g.firstIn ? toMysqlUtcString(g.firstIn) : null,
      lastOut: g.lastOut ? toMysqlUtcString(g.lastOut) : null,
      totalMinutes: g.totalMinutes,
      hasIssue: g.hasIssue,
      issueDescription: g.issueDescription || null,
    }))
  );

  const totais = totalizarPorColaborador(dayGroups);

  // Taxas congeladas no momento da importação, lidas do cadastro.
  const cadastro = new Map((await getAllEmployees()).map((e) => [e.code, e]));

  await insertPayrollPeriods(
    Array.from(totais.values()).map((t) => {
      const emp = cadastro.get(t.employeeCode);
      const hourlyRate = emp ? parseFloat(emp.hourlyRate) : 0;
      const dailyRate = emp ? parseFloat(emp.dailyRate) : 0;
      const transport = emp ? parseFloat(emp.transportAllowance ?? "0") : 0;

      const totalByHour = (t.totalMinutes / 60) * hourlyRate;
      const totalByDay = t.workedDays * dailyRate;
      const transportTotal = t.workedDays * transport;

      return {
        batchId: batch.id,
        employeeCode: t.employeeCode,
        employeeName: t.employeeName,
        periodStart,
        periodEnd,
        workedDays: t.workedDays,
        totalMinutes: t.totalMinutes,
        hourlyRate: hourlyRate.toFixed(2),
        dailyRate: dailyRate.toFixed(2),
        transportAllowance: transport.toFixed(2),
        totalByHour: totalByHour.toFixed(2),
        totalByDay: totalByDay.toFixed(2),
        transportTotal: transportTotal.toFixed(2),
        missingDays: t.missingDays,
        status: statusDoPeriodo(t.missingDays),
      };
    })
  );

  await updateImportBatch(batch.id, {
    status: "completed",
    processedEmployees: totais.size,
  });

  return {
    batchId: batch.id,
    totalRecords: records.length,
    processedEmployees: totais.size,
    periodStart,
    periodEnd,
    registros: records,
  };
}
