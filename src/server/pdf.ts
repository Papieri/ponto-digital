/**
 * Relatório de fechamento em PDF.
 *
 * Gerado no servidor, e não pela impressão do navegador, para o documento sair
 * igual em qualquer máquina — a impressão do navegador muda de margem entre
 * computadores e ainda carimba cabeçalho e rodapé próprios.
 *
 * Tipografia: Helvetica na interface, Times nos números. É o mesmo par da tela
 * (DM Sans + Newsreader) com as fontes internas do PDF, que não precisam ser
 * embutidas — as do app vêm só em woff2, formato que o PDF não lê.
 *
 * Horários e datas em UTC, sem conversão de fuso, como no resto da pilha.
 */
import PDFDocument from "pdfkit";
import { formatMinutes } from "./timesheetParser";
import {
  getImportBatchById,
  getPayrollPeriodsByBatch,
} from "./db";

const AZUL = "#2f6fe4";
const VERDE = "#047857";
const TINTA = "#141a24";
const APAGADO = "#5b6675";
const LINHA = "#dfe4ec";
const FUNDO_AVISO = "#fef6e0";
const FUNDO_CRITICO = "#fdeaea";

const SANS = "Helvetica";
const SANS_FORTE = "Helvetica-Bold";
const SERIF = "Times-Roman";
const SERIF_FORTE = "Times-Bold";

/** 'YYYY-MM-DD HH:MM:SS' → 'DD/MM/AAAA', sempre UTC. */
function dataBr(valor: string | null | undefined): string {
  if (!valor) return "";
  const [ano, mes, dia] = valor.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

function reais(valor: string | number): string {
  const n = typeof valor === "string" ? parseFloat(valor) : valor;
  return (Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const rotuloStatus = (s: string) =>
  s === "ok" ? "OK" : s === "warning" ? "Aviso" : "Crítico";

interface Coluna {
  titulo: string;
  largura: number;
  alinhamento: "left" | "right" | "center";
  serifada?: boolean;
}

const COLUNAS: Coluna[] = [
  { titulo: "Cód.", largura: 34, alinhamento: "center", serifada: true },
  { titulo: "Nome", largura: 120, alinhamento: "left" },
  { titulo: "Dias", largura: 34, alinhamento: "center", serifada: true },
  { titulo: "Horas", largura: 50, alinhamento: "center", serifada: true },
  { titulo: "Vlr/Hora", largura: 62, alinhamento: "right", serifada: true },
  { titulo: "Total/Hora", largura: 74, alinhamento: "right", serifada: true },
  { titulo: "Total/Dia (ref.)", largura: 74, alinhamento: "right", serifada: true },
  { titulo: "Passagem", largura: 66, alinhamento: "right", serifada: true },
  { titulo: "Valor Total", largura: 76, alinhamento: "right", serifada: true },
  { titulo: "A PAGAR", largura: 78, alinhamento: "right", serifada: true },
  { titulo: "Probl.", largura: 40, alinhamento: "center", serifada: true },
  { titulo: "Status", largura: 52, alinhamento: "center" },
];

export async function gerarPdfFechamento(batchId: number): Promise<{
  nomeArquivo: string;
  conteudo: Buffer;
}> {
  const lote = await getImportBatchById(batchId);
  if (!lote) throw new Error(`Lote ${batchId} não encontrado.`);
  const periodos = await getPayrollPeriodsByBatch(batchId);

  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    // Necessário para voltar nas páginas e numerar o rodapé no fim.
    bufferPages: true,
    margins: { top: 36, bottom: 44, left: 36, right: 36 },
    info: {
      Title: `Fechamento ${dataBr(lote.periodStart)} a ${dataBr(lote.periodEnd)}`,
      Author: "Ponto Digital — Papieri",
    },
  });

  const pedacos: Buffer[] = [];
  doc.on("data", (p: Buffer) => pedacos.push(p));
  const pronto = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(pedacos)));
  });

  const esquerda = doc.page.margins.left;
  const util = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // ─── Cabeçalho ─────────────────────────────────────────────────────────────
  doc.font(SANS_FORTE).fontSize(19).fillColor(TINTA)
    .text("Relatório de Fechamento", esquerda, doc.page.margins.top);

  doc.font(SANS).fontSize(9.5).fillColor(APAGADO)
    .text(
      `Período de ${dataBr(lote.periodStart)} a ${dataBr(lote.periodEnd)}` +
        `   ·   Arquivo: ${lote.filename}` +
        `   ·   ${lote.totalRecords} registros` +
        (lote.periodConfirmed ? "" : "   ·   período não confirmado"),
      esquerda,
      doc.y + 3
    );

  // ─── Cartões totalizadores ─────────────────────────────────────────────────
  const totais = periodos.reduce(
    (a, p) => ({
      dias: a.dias + p.workedDays,
      minutos: a.minutos + p.totalMinutes,
      hora: a.hora + parseFloat(p.totalByHour),
      dia: a.dia + parseFloat(p.totalByDay),
      passagem: a.passagem + parseFloat(p.transportTotal),
      valor: a.valor + parseFloat(p.totalValue),
      pagar: a.pagar + parseFloat(p.amountToPay),
      problemas: a.problemas + p.missingDays,
    }),
    { dias: 0, minutos: 0, hora: 0, dia: 0, passagem: 0, valor: 0, pagar: 0, problemas: 0 }
  );

  const cartoes = [
    { rotulo: "Colaboradores", valor: String(periodos.length) },
    { rotulo: "Dias trabalhados", valor: String(totais.dias) },
    { rotulo: "Total de horas", valor: formatMinutes(totais.minutos) },
    { rotulo: "Valor total", valor: `R$ ${reais(totais.valor)}` },
    { rotulo: "VALOR A PAGAR", valor: `R$ ${reais(totais.pagar)}`, destaque: true },
  ];

  const vaoCartao = 9;
  const largCartao = (util - vaoCartao * (cartoes.length - 1)) / cartoes.length;
  const topoCartoes = doc.y + 14;
  const altCartao = 52;

  cartoes.forEach((c, i) => {
    const x = esquerda + i * (largCartao + vaoCartao);
    doc.roundedRect(x, topoCartoes, largCartao, altCartao, 6)
      .lineWidth(c.destaque ? 1.2 : 0.8)
      .strokeColor(c.destaque ? VERDE : LINHA)
      .stroke();

    doc.font(SANS).fontSize(7.5).fillColor(APAGADO)
      .text(c.rotulo.toUpperCase(), x + 10, topoCartoes + 10, {
        width: largCartao - 20,
        characterSpacing: 0.4,
      });

    doc.font(SERIF_FORTE).fontSize(15).fillColor(c.destaque ? VERDE : TINTA)
      .text(c.valor, x + 10, topoCartoes + 24, {
        width: largCartao - 20,
        lineBreak: false,
      });
  });

  // ─── Tabela ────────────────────────────────────────────────────────────────
  const altLinha = 19;
  const altCabecalho = 20;
  let y = topoCartoes + altCartao + 20;

  const posicoes: number[] = [];
  COLUNAS.reduce((x, col) => {
    posicoes.push(x);
    return x + col.largura;
  }, esquerda);

  const celula = (
    texto: string,
    col: number,
    yLinha: number,
    fonte: string,
    tamanho: number,
    cor: string
  ) => {
    const c = COLUNAS[col]!;
    const recuo = c.alinhamento === "left" ? 6 : c.alinhamento === "right" ? 6 : 3;
    doc.font(fonte).fontSize(tamanho).fillColor(cor).text(texto, posicoes[col]! + (c.alinhamento === "right" ? 0 : recuo), yLinha, {
      width: c.largura - (c.alinhamento === "right" ? recuo : recuo * 2) + (c.alinhamento === "right" ? 0 : 0),
      align: c.alinhamento,
      lineBreak: false,
      ellipsis: true,
    });
  };

  const desenharCabecalho = () => {
    doc.rect(esquerda, y, util, altCabecalho).fillColor(AZUL).fill();
    COLUNAS.forEach((c, i) => {
      celula(c.titulo, i, y + 6.5, SANS_FORTE, 7.5, "#ffffff");
    });
    y += altCabecalho;
  };

  desenharCabecalho();

  for (const p of periodos) {
    if (y + altLinha > doc.page.height - doc.page.margins.bottom - 40) {
      doc.addPage();
      y = doc.page.margins.top;
      desenharCabecalho();
    }

    if (p.status !== "ok") {
      doc.rect(esquerda, y, util, altLinha)
        .fillColor(p.status === "critical" ? FUNDO_CRITICO : FUNDO_AVISO)
        .fill();
    }

    const meio = y + 5.5;
    const valores: Array<[string, string, string]> = [
      [String(p.employeeCode), SERIF, TINTA],
      [p.employeeName, SANS, TINTA],
      [String(p.workedDays), SERIF, TINTA],
      [formatMinutes(p.totalMinutes), SERIF, TINTA],
      [reais(p.hourlyRate), SERIF, APAGADO],
      [reais(p.totalByHour), SERIF, TINTA],
      [reais(p.totalByDay), SERIF, APAGADO],
      [parseFloat(p.transportTotal) > 0 ? reais(p.transportTotal) : "—", SERIF, TINTA],
      [reais(p.totalValue), SERIF, TINTA],
      [reais(p.amountToPay), SERIF_FORTE, VERDE],
      [p.missingDays > 0 ? String(p.missingDays) : "—", SERIF, p.missingDays > 0 ? "#b42318" : APAGADO],
      [rotuloStatus(p.status), SANS, p.status === "ok" ? APAGADO : TINTA],
    ];
    valores.forEach(([texto, fonte, cor], i) => celula(texto, i, meio, fonte, 8.5, cor));

    y += altLinha;
    doc.moveTo(esquerda, y).lineTo(esquerda + util, y)
      .lineWidth(0.4).strokeColor(LINHA).stroke();
  }

  // ─── Totais ────────────────────────────────────────────────────────────────
  doc.moveTo(esquerda, y + 0.6).lineTo(esquerda + util, y + 0.6)
    .lineWidth(1.1).strokeColor(TINTA).stroke();

  const meioTotais = y + 6;
  celula("TOTAIS", 1, meioTotais, SANS_FORTE, 8.5, APAGADO);
  celula(String(totais.dias), 2, meioTotais, SERIF_FORTE, 8.5, TINTA);
  celula(formatMinutes(totais.minutos), 3, meioTotais, SERIF_FORTE, 8.5, TINTA);
  celula(reais(totais.hora), 5, meioTotais, SERIF_FORTE, 8.5, TINTA);
  celula(reais(totais.dia), 6, meioTotais, SERIF_FORTE, 8.5, APAGADO);
  celula(reais(totais.passagem), 7, meioTotais, SERIF_FORTE, 8.5, TINTA);
  celula(reais(totais.valor), 8, meioTotais, SERIF_FORTE, 8.5, TINTA);
  celula(reais(totais.pagar), 9, meioTotais, SERIF_FORTE, 8.5, VERDE);
  y += altLinha + 4;

  // ─── Nota de rodapé ────────────────────────────────────────────────────────
  doc.font(SANS).fontSize(7.5).fillColor(APAGADO).text(
    "Valores em reais (R$).  Total/Dia é referência e não entra no valor a pagar. O VALOR A PAGAR é arredondado para cima, ao real inteiro, sempre a favor do colaborador." +
      (totais.problemas > 0
        ? `  ${totais.problemas} dia(s) com problema no período — confira o detalhe diário antes de pagar.`
        : ""),
    esquerda,
    y + 6,
    { width: util }
  );

  // ─── Rodapé em todas as páginas ────────────────────────────────────────────
  // Escrever abaixo da margem inferior faz o pdfkit abrir página nova. Zeramos
  // a margem enquanto desenhamos o rodapé, e devolvemos depois.
  const emitido = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const faixa = doc.bufferedPageRange();
  for (let i = faixa.start; i < faixa.start + faixa.count; i++) {
    doc.switchToPage(i);
    const margemOriginal = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const yRodape = doc.page.height - 30;

    doc.font(SANS).fontSize(7).fillColor(APAGADO).text(
      `Ponto Digital — Papieri   ·   emitido em ${emitido}`,
      esquerda,
      yRodape,
      { width: util, align: "left", lineBreak: false }
    );
    doc.text(`Página ${i + 1} de ${faixa.count}`, esquerda, yRodape, {
      width: util,
      align: "right",
      lineBreak: false,
    });

    doc.page.margins.bottom = margemOriginal;
  }
  doc.flushPages();

  doc.end();
  const conteudo = await pronto;

  const periodo = `${dataBr(lote.periodStart)}_${dataBr(lote.periodEnd)}`.replace(/\//g, "-");
  return { nomeArquivo: `fechamento_${periodo}.pdf`, conteudo };
}
