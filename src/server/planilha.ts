/**
 * Exportação do fechamento em Excel (.xlsx).
 *
 * Duas abas: o resumo por colaborador, na ordem de colunas da seção 8 da
 * especificação, e o detalhe diário. A formatação de moeda é do próprio Excel,
 * então os valores continuam sendo número — dá para somar e conferir na
 * planilha, o que o CSV não permite sem conversão.
 *
 * Os horários saem em UTC, sem conversão de fuso, como no resto da pilha.
 */
import ExcelJS from "exceljs";
import { formatMinutes } from "./timesheetParser";
import {
  getDailySummariesByBatch,
  getImportBatchById,
  getPayrollPeriodsByBatch,
} from "./db";

const MOEDA = 'R$ #,##0.00';

/** 'YYYY-MM-DD HH:MM:SS' → 'DD/MM/AAAA', sempre em UTC. */
function dataBr(valor: string | null | undefined): string {
  if (!valor) return "";
  const [ano, mes, dia] = valor.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

/** 'YYYY-MM-DD HH:MM:SS' → 'HH:MM', sempre em UTC. */
function horaUtc(valor: string | null | undefined): string {
  return valor ? valor.slice(11, 16) : "";
}

const rotuloStatus = (s: string) =>
  s === "ok" ? "OK" : s === "warning" ? "Aviso" : "Crítico";

export async function gerarPlanilhaFechamento(batchId: number): Promise<{
  nomeArquivo: string;
  conteudo: Buffer;
}> {
  const lote = await getImportBatchById(batchId);
  if (!lote) throw new Error(`Lote ${batchId} não encontrado.`);

  const periodos = await getPayrollPeriodsByBatch(batchId);
  const resumosDiarios = await getDailySummariesByBatch(batchId);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Ponto Digital — Papieri";
  wb.created = new Date();

  // ─── Aba 1: resumo do fechamento ───────────────────────────────────────────
  const resumo = wb.addWorksheet("Fechamento");

  resumo.mergeCells("A1:P1");
  const titulo = resumo.getCell("A1");
  titulo.value = `Fechamento de ${dataBr(lote.periodStart)} a ${dataBr(lote.periodEnd)}`;
  titulo.font = { size: 14, bold: true };
  resumo.getRow(1).height = 22;

  resumo.mergeCells("A2:P2");
  const sub = resumo.getCell("A2");
  sub.value =
    `Arquivo: ${lote.filename}  ·  ${lote.totalRecords} registros  ·  ` +
    `Total por Dia é referência e NÃO entra no valor a pagar`;
  sub.font = { size: 9, color: { argb: "FF666666" } };

  const colunas = [
    { chave: "code", titulo: "Código", largura: 8 },
    { chave: "name", titulo: "Nome", largura: 22 },
    { chave: "days", titulo: "Dias Trabalhados", largura: 10 },
    { chave: "hours", titulo: "Total Horas", largura: 11 },
    { chave: "hourlyRate", titulo: "Valor/Hora Base", largura: 13, moeda: true },
    { chave: "totalByHour", titulo: "Total por Hora", largura: 13, moeda: true },
    { chave: "dailyRate", titulo: "Valor/Dia Base", largura: 13, moeda: true },
    { chave: "totalByDay", titulo: "Total por Dia (ref.)", largura: 15, moeda: true },
    { chave: "transport", titulo: "Passagem/Dia", largura: 12, moeda: true },
    { chave: "transportTotal", titulo: "Total Passagem", largura: 13, moeda: true },
    { chave: "totalValue", titulo: "Valor Total", largura: 13, moeda: true },
    { chave: "additions", titulo: "Acréscimos", largura: 12, moeda: true },
    { chave: "deductions", titulo: "Descontos", largura: 12, moeda: true },
    { chave: "amountToPay", titulo: "VALOR A PAGAR", largura: 15, moeda: true },
    { chave: "missing", titulo: "Dias c/ Problema", largura: 10 },
    { chave: "status", titulo: "Status", largura: 10 },
  ];

  const linhaCabecalho = resumo.addRow(colunas.map((c) => c.titulo));
  linhaCabecalho.font = { bold: true, color: { argb: "FFFFFFFF" } };
  linhaCabecalho.alignment = { vertical: "middle", wrapText: true };
  linhaCabecalho.height = 30;
  linhaCabecalho.eachCell((celula) => {
    celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F6FE4" } };
  });
  colunas.forEach((c, i) => {
    resumo.getColumn(i + 1).width = c.largura;
  });

  for (const p of periodos) {
    const linha = resumo.addRow([
      p.employeeCode,
      p.employeeName,
      p.workedDays,
      formatMinutes(p.totalMinutes),
      Number(p.hourlyRate),
      Number(p.totalByHour),
      Number(p.dailyRate),
      Number(p.totalByDay),
      Number(p.transportAllowance),
      Number(p.transportTotal),
      Number(p.totalValue),
      Number(p.additionsTotal),
      Number(p.deductionsTotal),
      Number(p.amountToPay),
      p.missingDays,
      rotuloStatus(p.status),
    ]);
    if (p.status === "critical") {
      linha.eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE8E8" } };
      });
    } else if (p.status === "warning") {
      linha.eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF6E0" } };
      });
    }
  }

  const primeira = 4;
  const ultima = primeira + periodos.length - 1;
  if (periodos.length > 0) {
    const totais = resumo.addRow([
      "",
      "TOTAIS",
      { formula: `SUM(C${primeira}:C${ultima})` },
      "",
      "",
      { formula: `SUM(F${primeira}:F${ultima})` },
      "",
      { formula: `SUM(H${primeira}:H${ultima})` },
      "",
      { formula: `SUM(J${primeira}:J${ultima})` },
      { formula: `SUM(K${primeira}:K${ultima})` },
      { formula: `SUM(L${primeira}:L${ultima})` },
      { formula: `SUM(M${primeira}:M${ultima})` },
      { formula: `SUM(N${primeira}:N${ultima})` },
      "",
      "",
    ]);
    totais.font = { bold: true };
    totais.eachCell((c) => {
      c.border = { top: { style: "double" } };
    });
  }

  // Moeda em todas as colunas de dinheiro, linha de totais incluída.
  colunas.forEach((c, i) => {
    if (!c.moeda) return;
    const coluna = resumo.getColumn(i + 1);
    coluna.numFmt = MOEDA;
    coluna.alignment = { horizontal: "right" };
  });
  resumo.getColumn(4).alignment = { horizontal: "center" };
  resumo.getColumn(3).alignment = { horizontal: "center" };
  resumo.views = [{ state: "frozen", ySplit: 3 }];

  // ─── Aba 2: detalhe diário ─────────────────────────────────────────────────
  const detalhe = wb.addWorksheet("Detalhe Diário");
  const nomePorCodigo = new Map(periodos.map((p) => [p.employeeCode, p.employeeName]));

  const cabDetalhe = detalhe.addRow([
    "Código", "Nome", "Data", "Batidas", "Primeira Entrada",
    "Última Saída", "Total Horas", "Problema", "Observação",
  ]);
  cabDetalhe.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cabDetalhe.eachCell((celula) => {
    celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F6FE4" } };
  });
  [8, 22, 12, 8, 15, 13, 11, 10, 52].forEach((largura, i) => {
    detalhe.getColumn(i + 1).width = largura;
  });

  for (const d of resumosDiarios) {
    const linha = detalhe.addRow([
      d.employeeCode,
      nomePorCodigo.get(d.employeeCode) ?? "",
      dataBr(d.workDate),
      d.recordCount,
      horaUtc(d.firstIn),
      horaUtc(d.lastOut),
      formatMinutes(d.totalMinutes),
      d.hasIssue ? "SIM" : "NÃO",
      d.issueDescription ?? "",
    ]);
    if (d.hasIssue) {
      linha.eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF6E0" } };
      });
    }
  }
  detalhe.views = [{ state: "frozen", ySplit: 1 }];

  const periodo = `${dataBr(lote.periodStart)}_${dataBr(lote.periodEnd)}`.replace(/\//g, "-");
  const buffer = await wb.xlsx.writeBuffer();

  return {
    nomeArquivo: `fechamento_${periodo}.xlsx`,
    conteudo: Buffer.from(buffer),
  };
}
