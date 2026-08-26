import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DiasEmAbertoError,
  MOTIVO_EXPORT_TRUNCADO,
  PeriodoInvalidoError,
  aplicarCorrecaoExportTruncado,
  decidirCountsAsWorkedDay,
  diasEmAberto,
  resolverPeriodo,
  ultimoDiaDoArquivo,
  verificarFechamento,
} from "./correcoes";
import { groupByEmployeeAndDay, parseTxtContent } from "./timesheetParser";

const AMOSTRA = path.resolve(
  import.meta.dirname,
  "../../amostras/Registo_de_comparec_.txt"
);
const grupos = groupByEmployeeAndDay(
  parseTxtContent(readFileSync(AMOSTRA, "utf-8"))
);

// ─── 6.2 ─────────────────────────────────────────────────────────────────────

describe("6.2 — período confirmável", () => {
  const detectado = {
    periodStart: "2026-08-17 00:00:00",
    periodEnd: "2026-08-24 23:59:59",
  };

  it("sem período informado, usa o detectado e NÃO marca como confirmado", () => {
    expect(resolverPeriodo(detectado)).toEqual({
      ...detectado,
      periodConfirmed: false,
    });
  });

  it("período informado prevalece e marca o lote como confirmado", () => {
    const informado = {
      periodStart: "2026-08-16 00:00:00",
      periodEnd: "2026-08-31 23:59:59",
    };
    expect(resolverPeriodo(detectado, informado)).toEqual({
      ...informado,
      periodConfirmed: true,
    });
  });

  it("recusa formato fora do padrão da pilha", () => {
    expect(() =>
      resolverPeriodo(detectado, {
        periodStart: "16/08/2026",
        periodEnd: "2026-08-31 23:59:59",
      })
    ).toThrow(PeriodoInvalidoError);
  });

  it("recusa início depois do fim", () => {
    expect(() =>
      resolverPeriodo(detectado, {
        periodStart: "2026-08-31 00:00:00",
        periodEnd: "2026-08-16 23:59:59",
      })
    ).toThrow(PeriodoInvalidoError);
  });
});

// ─── 6.3 ─────────────────────────────────────────────────────────────────────

describe("6.3 — último dia do export", () => {
  it("identifica o último dia do arquivo de amostra", () => {
    expect(ultimoDiaDoArquivo(grupos)).toBe("2026-08-24");
  });

  it("devolve null para lista vazia", () => {
    expect(ultimoDiaDoArquivo([])).toBeNull();
  });

  it("reclassifica as batidas soltas do último dia como export truncado", () => {
    const dias = aplicarCorrecaoExportTruncado(grupos);
    const ultimoComAlarme = dias.filter(
      (d) => d.workDate === "2026-08-24" && d.exportTruncado
    );

    // Elaine, Raquel e Ketlen: uma batida só, entrada sem saída
    expect(ultimoComAlarme.map((d) => d.employeeCode).sort((a, b) => a - b)).toEqual([3, 4, 22]);
    for (const d of ultimoComAlarme) {
      expect(d.records.length).toBe(1);
      expect(d.hasIssue).toBe(false);
      expect(d.issueDescription).toBe(MOTIVO_EXPORT_TRUNCADO);
    }
  });

  it("não mexe em dia com problema ANTES do último", () => {
    const dias = aplicarCorrecaoExportTruncado(grupos);
    const raquel21 = dias.find(
      (d) => d.employeeCode === 4 && d.workDate === "2026-08-21"
    )!;
    expect(raquel21.records.length).toBe(3);
    expect(raquel21.hasIssue).toBe(true);
    expect(raquel21.exportTruncado).toBe(false);
    expect(raquel21.issueDescription).toContain("ímpar");
  });

  it("não mexe em dia sem alarme", () => {
    const dias = aplicarCorrecaoExportTruncado(grupos);
    for (const d of dias.filter((d) => !d.exportTruncado)) {
      const original = grupos.find(
        (g) => g.employeeCode === d.employeeCode && g.workDate === d.workDate
      )!;
      expect(d.hasIssue).toBe(original.hasIssue);
      expect(d.issueDescription).toBe(original.issueDescription);
    }
  });

  it("não altera horas nem dias apurados", () => {
    const dias = aplicarCorrecaoExportTruncado(grupos);
    expect(dias).toHaveLength(grupos.length);
    const somaAntes = grupos.reduce((s, g) => s + g.totalMinutes, 0);
    const somaDepois = dias.reduce((s, d) => s + d.totalMinutes, 0);
    expect(somaDepois).toBe(somaAntes);
  });
});

// ─── 6.4 ─────────────────────────────────────────────────────────────────────

describe("6.4 — fechamento com dias em aberto", () => {
  const dias = aplicarCorrecaoExportTruncado(grupos);

  it("na amostra, sobra um único dia em aberto: Raquel em 21/08", () => {
    const abertos = diasEmAberto(dias);
    expect(abertos).toHaveLength(1);
    expect(abertos[0]).toMatchObject({
      employeeCode: 4,
      workDate: "2026-08-21",
      recordCount: 3,
    });
  });

  it("o dia truncado do fim do arquivo não bloqueia o fechamento", () => {
    expect(diasEmAberto(dias).some((d) => d.workDate === "2026-08-24")).toBe(false);
  });

  it("barra o fechamento sem confirmação", () => {
    expect(() => verificarFechamento(dias)).toThrow(DiasEmAbertoError);
  });

  it("a exceção carrega os dias que precisam de atenção", () => {
    try {
      verificarFechamento(dias);
      expect.unreachable("deveria ter lançado");
    } catch (erro) {
      expect(erro).toBeInstanceOf(DiasEmAbertoError);
      expect((erro as DiasEmAbertoError).dias).toHaveLength(1);
      expect((erro as DiasEmAbertoError).message).toContain("Raquel");
    }
  });

  it("deixa passar com confirmação explícita", () => {
    expect(() => verificarFechamento(dias, { confirmado: true })).not.toThrow();
    expect(verificarFechamento(dias, { confirmado: true })).toHaveLength(1);
  });

  it("não exige confirmação quando não há dia em aberto", () => {
    const semAbertos = dias.filter((d) => d.records.length % 2 === 0);
    expect(() => verificarFechamento(semAbertos)).not.toThrow();
  });
});

// ─── 6.1 ─────────────────────────────────────────────────────────────────────

describe("6.1 — sem regra aplicada", () => {
  it("mantém o comportamento atual: todo dia apurado conta como trabalhado", () => {
    // Trava para que ninguém decida a 6.1 sem querer. Quando a regra for
    // definida, este teste muda junto — de propósito.
    const dias = aplicarCorrecaoExportTruncado(grupos);
    for (const d of dias) {
      expect(decidirCountsAsWorkedDay(d)).toBe(true);
    }
    const semHoras = dias.filter((d) => d.totalMinutes === 0);
    expect(semHoras).toHaveLength(3); // Elaine, Raquel e Ketlen em 24/08
    for (const d of semHoras) {
      expect(decidirCountsAsWorkedDay(d)).toBe(true);
    }
  });
});
