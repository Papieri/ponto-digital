/**
 * Edição manual das batidas de um dia.
 *
 * É o que permite fechar um dia em aberto (correção 6.4) sem recorrer ao SQL:
 * o operador acrescenta a batida que faltou, ou remove a duplicada, e o
 * fechamento se refaz.
 *
 * O recálculo do dia usa `recalcFromTimestamps`, do parser portado — as mesmas
 * regras de pareamento da importação, sem duplicar lógica.
 */
import { recalcFromTimestamps, toMysqlUtcString } from "./timesheetParser";
import { MOTIVO_EXPORT_TRUNCADO } from "./correcoes";
import { recalcularValores } from "./importarPonto";
import {
  addTimeRecord,
  deleteDailySummary,
  deleteTimeRecord,
  getDailySummariesByBatch,
  getDailySummaryByEmployeeAndDate,
  getTimeRecordById,
  getTimeRecordsByEmployeeAndDate,
  insertDailySummary,
  updateDailySummary,
} from "./db";

/** Último dia apurado do lote — usado para manter a correção 6.3 após a edição. */
async function ultimoDiaDoLote(batchId: number): Promise<string | null> {
  const resumos = await getDailySummariesByBatch(batchId);
  let ultimo: string | null = null;
  for (const r of resumos) {
    const dia = r.workDate.slice(0, 10);
    if (ultimo === null || dia > ultimo) ultimo = dia;
  }
  return ultimo;
}

export interface ResultadoDia {
  workDate: string;
  recordCount: number;
  totalMinutes: number;
  hasIssue: boolean;
  issueDescription: string | null;
  exportTruncado: boolean;
}

/**
 * Recalcula um dia a partir das batidas que estão no banco e atualiza o
 * fechamento do colaborador.
 *
 * Se o dia ficar sem nenhuma batida, o resumo diário é removido — senão o
 * colaborador continuaria com um dia trabalhado fantasma.
 */
export async function recalcularDia(
  batchId: number,
  employeeCode: number,
  workDate: string
): Promise<ResultadoDia> {
  const batidas = await getTimeRecordsByEmployeeAndDate(batchId, employeeCode, workDate);
  const resumo = await getDailySummaryByEmployeeAndDate(batchId, employeeCode, workDate);

  if (batidas.length === 0) {
    if (resumo) await deleteDailySummary(resumo.id);
    await recalcularValores(batchId);
    return {
      workDate,
      recordCount: 0,
      totalMinutes: 0,
      hasIssue: false,
      issueDescription: null,
      exportTruncado: false,
    };
  }

  const calculo = recalcFromTimestamps(batidas.map((b) => b.recordedAt));

  // 6.3 continua valendo depois da edição: se o dia é o último do arquivo e
  // segue incompleto, é export truncado, não batida faltando.
  const ehUltimoDia = workDate === (await ultimoDiaDoLote(batchId));
  const exportTruncado = ehUltimoDia && calculo.hasIssue;

  const dados = {
    recordCount: batidas.length,
    firstIn: calculo.firstIn,
    lastOut: calculo.lastOut,
    totalMinutes: calculo.totalMinutes,
    hasIssue: exportTruncado ? false : calculo.hasIssue,
    issueDescription: exportTruncado
      ? MOTIVO_EXPORT_TRUNCADO
      : calculo.issueDescription || null,
  };

  if (resumo) {
    await updateDailySummary(resumo.id, dados);
  } else {
    // O dia pode não existir se todas as batidas dele tinham sido removidas.
    await insertDailySummary({
      batchId,
      employeeCode,
      workDate: `${workDate} 12:00:00`,
      countsAsWorkedDay: true, // 6.1 sem regra: mesmo comportamento da importação
      ...dados,
    });
  }

  await recalcularValores(batchId);

  return {
    workDate,
    recordCount: batidas.length,
    totalMinutes: calculo.totalMinutes,
    hasIssue: dados.hasIssue,
    issueDescription: dados.issueDescription,
    exportTruncado,
  };
}

/** Acrescenta uma batida manual e refaz as contas do dia. */
export async function acrescentarBatida(entrada: {
  batchId: number;
  employeeCode: number;
  employeeName: string;
  department: string;
  /** 'YYYY-MM-DD' */
  workDate: string;
  /** 'HH:MM' ou 'HH:MM:SS', tratado como UTC, sem conversão de fuso */
  horario: string;
}) {
  const partes = entrada.horario.split(":");
  const hora = Number(partes[0]);
  const minuto = Number(partes[1]);
  const segundo = Number(partes[2] ?? 0);
  if (!Number.isInteger(hora) || !Number.isInteger(minuto) || hora > 23 || minuto > 59) {
    throw new Error(`Horário inválido: ${entrada.horario}`);
  }

  const [ano, mes, dia] = entrada.workDate.split("-").map(Number);
  const recordedAt = toMysqlUtcString(
    new Date(Date.UTC(ano!, mes! - 1, dia!, hora, minuto, segundo))
  );

  await addTimeRecord({
    batchId: entrada.batchId,
    employeeCode: entrada.employeeCode,
    employeeName: entrada.employeeName,
    department: entrada.department,
    recordedAt,
    machineNo: "MANUAL",
    isManual: true,
  });

  return recalcularDia(entrada.batchId, entrada.employeeCode, entrada.workDate);
}

/** Remove uma batida e refaz as contas do dia. */
export async function removerBatida(recordId: number) {
  const batida = await getTimeRecordById(recordId);
  if (!batida) throw new Error("Batida não encontrada.");

  const workDate = batida.recordedAt.slice(0, 10);
  await deleteTimeRecord(recordId);

  return recalcularDia(batida.batchId, batida.employeeCode, workDate);
}
