/**
 * Pipeline de importação — portado de `import.process` em
 * `referencia/codigo-fonte/routers.ts`, sem tRPC, sem storage e sem notificação.
 *
 * A apuração de horas é exatamente a do original. As correções da seção 6 da
 * especificação entram como camada aditiva (`correcoes.ts`), e o cálculo dos
 * valores está em `calculo.ts`.
 *
 * Correções aplicadas aqui: 6.2 (período confirmável), 6.3 (último dia do
 * export), 6.4 (fechamento barrado com dias em aberto), 6.5 (recálculo — ver
 * `recalcularValores`).
 *
 * NÃO aplicada: 6.1. `countsAsWorkedDay` é gravado a partir de
 * `decidirCountsAsWorkedDay`, que devolve o comportamento atual sem regra
 * nenhuma. Ver o comentário lá.
 */
import {
  detectPeriod,
  groupByEmployeeAndDay,
  parseTxtContent,
  toMysqlUtcString,
  type ParsedRecord,
} from "./timesheetParser";
import {
  aplicarCorrecaoExportTruncado,
  decidirCountsAsWorkedDay,
  diasEmAberto,
  resolverPeriodo,
  type DiaApurado,
  type DiaEmAberto,
  type Periodo,
} from "./correcoes";
import { calcularValores, paraNumeric, statusDoPeriodo } from "./calculo";
import {
  createImportBatch,
  getAllEmployees,
  getDailySummariesByBatch,
  getPeriodAdjustmentsByBatch,
  insertDailySummaries,
  insertPayrollPeriods,
  insertTimeRecords,
  updateImportBatch,
  updatePayrollPeriodForEmployee,
} from "./db";

export interface TotaisColaborador {
  employeeCode: number;
  employeeName: string;
  workedDays: number;
  totalMinutes: number;
  missingDays: number;
}

/**
 * Consolida os dias apurados em totais por colaborador.
 *
 * `workedDays` conta todo dia com registro — comportamento atual, preservado.
 * A correção 6.1 muda exatamente isto quando a regra for definida, através de
 * `decidirCountsAsWorkedDay`.
 *
 * `missingDays` conta só os dias que o operador precisa resolver: o dia
 * truncado do fim do arquivo ficou de fora pela 6.3.
 */
export function totalizarPorColaborador(
  dias: DiaApurado[]
): Map<number, TotaisColaborador> {
  const totais = new Map<number, TotaisColaborador>();

  for (const d of dias) {
    const atual = totais.get(d.employeeCode) ?? {
      employeeCode: d.employeeCode,
      employeeName: d.employeeName,
      workedDays: 0,
      totalMinutes: 0,
      missingDays: 0,
    };
    if (decidirCountsAsWorkedDay(d)) atual.workedDays += 1;
    atual.totalMinutes += d.totalMinutes;
    if (d.hasIssue) atual.missingDays += 1;
    totais.set(d.employeeCode, atual);
  }

  return totais;
}

/** Soma os ajustes do lote por colaborador. Sem lançamentos, tudo zero. */
async function somarAjustes(batchId: number) {
  const ajustes = await getPeriodAdjustmentsByBatch(batchId);
  const porCodigo = new Map<number, { acrescimos: number; descontos: number }>();
  for (const a of ajustes) {
    const atual = porCodigo.get(a.employeeCode) ?? { acrescimos: 0, descontos: 0 };
    const valor = parseFloat(a.amount);
    if (a.type === "acrescimo") atual.acrescimos += valor;
    else atual.descontos += valor;
    porCodigo.set(a.employeeCode, atual);
  }
  return porCodigo;
}

/** Taxas do cadastro, por código. Quem não está cadastrado fica zerado. */
async function lerTaxasDoCadastro() {
  const cadastro = await getAllEmployees();
  return new Map(
    cadastro.map((e) => [
      e.code,
      {
        hourlyRate: parseFloat(e.hourlyRate),
        dailyRate: parseFloat(e.dailyRate),
        transportAllowance: parseFloat(e.transportAllowance ?? "0"),
      },
    ])
  );
}

export interface OpcoesImportacao {
  /** Correção 6.2: período informado pelo operador, sobrepondo o detectado. */
  periodo?: Periodo;
}

export interface ResultadoImportacao {
  batchId: number;
  totalRecords: number;
  processedEmployees: number;
  periodStart: string;
  periodEnd: string;
  periodConfirmed: boolean;
  /** Correção 6.4: dias que barram o fechamento enquanto não forem resolvidos. */
  diasEmAberto: DiaEmAberto[];
  registros: ParsedRecord[];
  dias: DiaApurado[];
}

/** Importa o conteúdo de um TXT do relógio para o banco. */
export async function importarConteudoTxt(
  filename: string,
  textContent: string,
  opcoes: OpcoesImportacao = {}
): Promise<ResultadoImportacao> {
  const records = parseTxtContent(textContent);
  if (records.length === 0) {
    throw new Error("Nenhum registro válido encontrado no arquivo.");
  }

  // 6.2 — o detectado é sugestão; o informado prevalece e confirma o lote.
  const periodo = resolverPeriodo(detectPeriod(records), opcoes.periodo);

  const batch = await createImportBatch({
    filename,
    periodStart: periodo.periodStart,
    periodEnd: periodo.periodEnd,
    periodConfirmed: periodo.periodConfirmed,
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

  // 6.3 — o último dia do arquivo deixa de ser alarme de batida faltando.
  const dias = aplicarCorrecaoExportTruncado(groupByEmployeeAndDay(records));

  await insertDailySummaries(
    dias.map((d) => ({
      batchId: batch.id,
      employeeCode: d.employeeCode,
      // meio-dia UTC, como no original: identifica o dia sem risco de virar data
      workDate: d.workDate + " 12:00:00",
      recordCount: d.records.length,
      firstIn: d.firstIn ? toMysqlUtcString(d.firstIn) : null,
      lastOut: d.lastOut ? toMysqlUtcString(d.lastOut) : null,
      totalMinutes: d.totalMinutes,
      // 6.1 sem regra: grava o comportamento atual, explicitamente
      countsAsWorkedDay: decidirCountsAsWorkedDay(d),
      hasIssue: d.hasIssue,
      issueDescription: d.issueDescription || null,
    }))
  );

  const totais = totalizarPorColaborador(dias);
  const taxas = await lerTaxasDoCadastro();
  const ajustes = await somarAjustes(batch.id);

  await insertPayrollPeriods(
    Array.from(totais.values()).map((t) => {
      const taxa = taxas.get(t.employeeCode) ?? {
        hourlyRate: 0,
        dailyRate: 0,
        transportAllowance: 0,
      };
      const ajuste = ajustes.get(t.employeeCode) ?? { acrescimos: 0, descontos: 0 };
      const v = calcularValores({
        totalMinutes: t.totalMinutes,
        workedDays: t.workedDays,
        taxas: taxa,
        additionsTotal: ajuste.acrescimos,
        deductionsTotal: ajuste.descontos,
      });

      return {
        batchId: batch.id,
        employeeCode: t.employeeCode,
        employeeName: t.employeeName,
        periodStart: periodo.periodStart,
        periodEnd: periodo.periodEnd,
        workedDays: t.workedDays,
        totalMinutes: t.totalMinutes,
        hourlyRate: paraNumeric(taxa.hourlyRate),
        dailyRate: paraNumeric(taxa.dailyRate),
        transportAllowance: paraNumeric(taxa.transportAllowance),
        totalByHour: paraNumeric(v.totalByHour),
        totalByDay: paraNumeric(v.totalByDay),
        transportTotal: paraNumeric(v.transportTotal),
        totalValue: paraNumeric(v.totalValue),
        additionsTotal: paraNumeric(v.additionsTotal),
        deductionsTotal: paraNumeric(v.deductionsTotal),
        amountToPay: paraNumeric(v.amountToPay),
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
    periodStart: periodo.periodStart,
    periodEnd: periodo.periodEnd,
    periodConfirmed: periodo.periodConfirmed,
    diasEmAberto: diasEmAberto(dias),
    registros: records,
    dias,
  };
}

// ─── 6.5 · Recalcular valores ────────────────────────────────────────────────

export interface ResultadoRecalculo {
  batchId: number;
  colaboradoresAtualizados: number;
}

/**
 * Correção 6.5 — "Recalcular valores".
 *
 * As taxas são congeladas na importação. Alterar o cadastro depois não mudava o
 * relatório, e a única saída era excluir e reimportar o lote — o que apagava
 * junto todas as correções manuais de batida já feitas.
 *
 * Esta função relê o cadastro e refaz as contas a partir dos RESUMOS DIÁRIOS
 * já gravados, que é onde vivem as correções manuais. Ela não toca em
 * `time_records` nem em `daily_summaries`: só reescreve o fechamento em
 * `payroll_periods`. Rodar duas vezes seguidas dá o mesmo resultado.
 */
export async function recalcularValores(
  batchId: number
): Promise<ResultadoRecalculo> {
  const resumos = await getDailySummariesByBatch(batchId);
  if (resumos.length === 0) {
    return { batchId, colaboradoresAtualizados: 0 };
  }

  const taxas = await lerTaxasDoCadastro();
  const ajustes = await somarAjustes(batchId);

  // Reconsolida a partir do que está no banco, correções manuais incluídas.
  const totais = new Map<number, { workedDays: number; totalMinutes: number; missingDays: number }>();
  for (const r of resumos) {
    const atual = totais.get(r.employeeCode) ?? {
      workedDays: 0,
      totalMinutes: 0,
      missingDays: 0,
    };
    // 6.1 sem regra: respeita o que foi gravado por dia, sem reinterpretar.
    if (r.countsAsWorkedDay) atual.workedDays += 1;
    atual.totalMinutes += r.totalMinutes;
    if (r.hasIssue) atual.missingDays += 1;
    totais.set(r.employeeCode, atual);
  }

  for (const [employeeCode, t] of totais) {
    const taxa = taxas.get(employeeCode) ?? {
      hourlyRate: 0,
      dailyRate: 0,
      transportAllowance: 0,
    };
    const ajuste = ajustes.get(employeeCode) ?? { acrescimos: 0, descontos: 0 };
    const v = calcularValores({
      totalMinutes: t.totalMinutes,
      workedDays: t.workedDays,
      taxas: taxa,
      additionsTotal: ajuste.acrescimos,
      deductionsTotal: ajuste.descontos,
    });

    await updatePayrollPeriodForEmployee(batchId, employeeCode, {
      workedDays: t.workedDays,
      totalMinutes: t.totalMinutes,
      hourlyRate: paraNumeric(taxa.hourlyRate),
      dailyRate: paraNumeric(taxa.dailyRate),
      transportAllowance: paraNumeric(taxa.transportAllowance),
      totalByHour: paraNumeric(v.totalByHour),
      totalByDay: paraNumeric(v.totalByDay),
      transportTotal: paraNumeric(v.transportTotal),
      totalValue: paraNumeric(v.totalValue),
      additionsTotal: paraNumeric(v.additionsTotal),
      deductionsTotal: paraNumeric(v.deductionsTotal),
      amountToPay: paraNumeric(v.amountToPay),
      missingDays: t.missingDays,
      status: statusDoPeriodo(t.missingDays),
      calculatedAt: new Date(),
    });
  }

  return { batchId, colaboradoresAtualizados: totais.size };
}
