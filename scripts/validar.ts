/**
 * npm run validar <arquivo.txt>
 *
 * Importa um TXT do relógio para o Postgres local e imprime a tabela de
 * apuração por colaborador.
 *
 * O ponto do marco 1 é provar que a apuração sobrevive à troca de MySQL para
 * Postgres, e o risco é o fuso horário quebrar em silêncio. Por isso a tabela
 * NÃO é impressa a partir do parse em memória: ela vem de `payroll_periods`,
 * lida de volta do banco. Em seguida o script refaz a apuração a partir das
 * batidas relidas de `time_records` e compara os dois caminhos. Se o driver ou
 * o banco deslocar qualquer horário, a conferência acusa.
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  closeDb,
  deleteImportBatch,
  getDailySummariesByBatch,
  getPayrollPeriodsByBatch,
  getTimeRecordsByBatch,
} from "../src/server/db";
import { importarConteudoTxt, recalcularValores } from "../src/server/importarPonto";
import {
  formatMinutes,
  groupByEmployeeAndDay,
  toMysqlUtcString,
  type ParsedRecord,
} from "../src/server/timesheetParser";
import { aplicarCorrecaoExportTruncado } from "../src/server/correcoes";

/** Converte a string 'YYYY-MM-DD HH:MM:SS' do banco em Date, tratando como UTC. */
function stringUtcParaDate(s: string): Date {
  return new Date(s.replace(" ", "T") + "Z");
}

function tabela(cabecalho: string[], linhas: string[][]): string {
  const larguras = cabecalho.map((h, i) =>
    Math.max(h.length, ...linhas.map((l) => (l[i] ?? "").length))
  );
  const alinhaDireita = (i: number) => i >= 2;
  const linha = (celulas: string[]) =>
    "| " +
    celulas
      .map((c, i) =>
        alinhaDireita(i)
          ? (c ?? "").padStart(larguras[i]!)
          : (c ?? "").padEnd(larguras[i]!)
      )
      .join(" | ") +
    " |";
  const separador = "|" + larguras.map((w) => "-".repeat(w + 2)).join("|") + "|";
  return [linha(cabecalho), separador, ...linhas.map(linha)].join("\n");
}

async function main() {
  const arquivo = process.argv[2];
  if (!arquivo) {
    console.error("Uso: npm run validar <arquivo.txt>");
    process.exit(1);
  }

  const caminho = path.resolve(arquivo);
  const conteudo = await readFile(caminho, "utf-8");

  const resultado = await importarConteudoTxt(path.basename(caminho), conteudo);

  console.log(`Arquivo   : ${caminho}`);
  console.log(`Lote      : #${resultado.batchId}`);
  console.log(
    `Período   : ${resultado.periodStart} a ${resultado.periodEnd} (UTC)` +
      ` — ${resultado.periodConfirmed ? "confirmado pelo operador" : "sugerido pelo arquivo (6.2)"}`
  );
  console.log(`Registros : ${resultado.totalRecords}`);
  console.log(`Fuso do processo: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  console.log();

  // ── Tabela, lida de volta do banco ─────────────────────────────────────────
  const periodos = await getPayrollPeriodsByBatch(resultado.batchId);
  const brl = (v: string) =>
    parseFloat(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

  console.log(
    tabela(
      [
        "Cód", "Nome", "Dias", "Total", "Dias c/ problema", "Status",
        "Total por Hora", "Total Passagem", "Valor Total", "VALOR A PAGAR",
      ],
      periodos.map((p) => [
        String(p.employeeCode),
        p.employeeName,
        String(p.workedDays),
        formatMinutes(p.totalMinutes),
        String(p.missingDays),
        p.status,
        brl(p.totalByHour),
        brl(p.transportTotal),
        brl(p.totalValue),
        brl(p.amountToPay),
      ])
    )
  );
  console.log();

  // ── 6.4 · dias em aberto ───────────────────────────────────────────────────
  if (resultado.diasEmAberto.length === 0) {
    console.log("Dias em aberto (6.4): nenhum — fechamento liberado.");
  } else {
    console.log(
      `Dias em aberto (6.4): ${resultado.diasEmAberto.length} — fechamento exige confirmação explícita.`
    );
    for (const d of resultado.diasEmAberto) {
      console.log(
        `  ! ${d.employeeName} em ${d.workDate}: ${d.recordCount} batidas — ${d.issueDescription}`
      );
    }
  }

  // ── 6.3 · dias reclassificados como export truncado ────────────────────────
  const truncados = resultado.dias.filter((d) => d.exportTruncado);
  if (truncados.length > 0) {
    console.log(
      `\nÚltimo dia do export (6.3): ${truncados.length} dia(s) reclassificado(s), ` +
        `sem alarme de batida faltando.`
    );
    for (const d of truncados) {
      console.log(`  · ${d.employeeName} em ${d.workDate}: ${d.records.length} batida(s)`);
    }
  }
  console.log();

  // ── 6.5 · recálculo é idempotente e não apaga nada ─────────────────────────
  const antes = periodos.map((p) => ({ ...p }));
  const recalc = await recalcularValores(resultado.batchId);
  const depois = await getPayrollPeriodsByBatch(resultado.batchId);
  const recalcIgual =
    antes.length === depois.length &&
    antes.every((a, i) => {
      const d = depois[i]!;
      return (
        a.employeeCode === d.employeeCode &&
        a.workedDays === d.workedDays &&
        a.totalMinutes === d.totalMinutes &&
        a.totalValue === d.totalValue &&
        a.amountToPay === d.amountToPay
      );
    });
  console.log(
    `Recalcular valores (6.5): ${recalc.colaboradoresAtualizados} colaborador(es), ` +
      `resultado ${recalcIgual ? "idêntico" : "DIFERENTE"} ao da importação.`
  );

  // ── Conferência de ida e volta ─────────────────────────────────────────────
  // 1. As batidas relidas do Postgres são idênticas às que o parser produziu?
  const batidas = await getTimeRecordsByBatch(resultado.batchId);
  const escrito = resultado.registros
    .map((r) => toMysqlUtcString(r.recordedAt))
    .sort();
  const lido = batidas.map((b) => b.recordedAt).sort();
  const batidasIguais =
    escrito.length === lido.length && escrito.every((s, i) => s === lido[i]);

  // 2. Refazendo a apuração a partir do que o banco devolveu, dá o mesmo?
  const reconstituidos: ParsedRecord[] = batidas.map((b) => ({
    employeeCode: b.employeeCode,
    employeeName: b.employeeName,
    department: b.department ?? "PRODUCAO",
    recordedAt: stringUtcParaDate(b.recordedAt),
    machineNo: b.machineNo ?? "1",
  }));
  // As mesmas correções da importação, para comparar igual com igual: sem a
  // 6.3 aqui, os dias truncados voltariam a contar como problema.
  const gruposDoBanco = aplicarCorrecaoExportTruncado(
    groupByEmployeeAndDay(reconstituidos)
  );

  const refeito = new Map<number, { dias: number; minutos: number; problemas: number }>();
  for (const g of gruposDoBanco) {
    const a = refeito.get(g.employeeCode) ?? { dias: 0, minutos: 0, problemas: 0 };
    a.dias += 1;
    a.minutos += g.totalMinutes;
    if (g.hasIssue) a.problemas += 1;
    refeito.set(g.employeeCode, a);
  }

  const divergencias: string[] = [];
  for (const p of periodos) {
    const r = refeito.get(p.employeeCode);
    if (!r) {
      divergencias.push(`código ${p.employeeCode}: ausente na releitura do banco`);
      continue;
    }
    if (r.dias !== p.workedDays)
      divergencias.push(
        `código ${p.employeeCode}: dias ${p.workedDays} gravado x ${r.dias} relido`
      );
    if (r.minutos !== p.totalMinutes)
      divergencias.push(
        `código ${p.employeeCode}: minutos ${p.totalMinutes} gravado x ${r.minutos} relido`
      );
    if (r.problemas !== p.missingDays)
      divergencias.push(
        `código ${p.employeeCode}: dias c/ problema ${p.missingDays} gravado x ${r.problemas} relido`
      );
  }

  const resumos = await getDailySummariesByBatch(resultado.batchId);
  console.log(
    `Batidas gravadas e relidas sem deslocamento: ${batidasIguais ? "sim" : "NÃO"} (${lido.length} registros)`
  );
  console.log(
    `Apuração refeita a partir do banco: ${divergencias.length === 0 ? "idêntica" : "DIVERGENTE"} (${resumos.length} dias apurados)`
  );
  for (const d of divergencias) console.log(`  ! ${d}`);

  // O script é repetível: o lote é descartado ao final. A cascata é do banco.
  if (process.env.MANTER_LOTE !== "1") {
    await deleteImportBatch(resultado.batchId);
  }

  await closeDb();
  if (!batidasIguais || divergencias.length > 0 || !recalcIgual) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
