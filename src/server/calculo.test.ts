/**
 * As regras de cálculo são conferidas contra o fechamento REAL do sistema
 * antigo (`amostras/fechamento_15-07-2026_31-07-2026.csv`), não contra números
 * transcritos à mão. Se a amostra mudar, o teste acompanha.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  arredondarParaCima,
  calcularValores,
  statusDoPeriodo,
} from "./calculo";

const CSV = path.resolve(
  import.meta.dirname,
  "../../amostras/fechamento_15-07-2026_31-07-2026.csv"
);

/** "1.937,28", " R$ 1.938,00 " e "" viram número. */
function numeroBr(texto: string | undefined): number {
  const limpo = (texto ?? "").replace("R$", "").trim();
  if (!limpo) return 0;
  return parseFloat(limpo.replace(/\./g, "").replace(",", "."));
}

/** "116:17:00" vira minutos. */
function paraMinutos(hhmmss: string): number {
  const [h = "0", m = "0"] = hhmmss.trim().split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

interface LinhaFechamento {
  nome: string;
  workedDays: number;
  totalMinutes: number;
  hourlyRate: number;
  dailyRate: number;
  transportAllowance: number;
  totalByHour: number;
  totalByDay: number;
  transportTotal: number;
  totalValue: number;
  deductionsTotal: number;
  amountToPay: number;
}

function lerFechamento(): LinhaFechamento[] {
  const bruto = readFileSync(CSV, "utf-8").replace(/^﻿/, "");
  const [cabecalho, ...linhas] = bruto.trim().split(/\r?\n/);
  const colunas = cabecalho!.split(";").map((c) => c.trim());
  const idx = (nome: string) => {
    const i = colunas.indexOf(nome);
    if (i < 0) throw new Error(`Coluna ausente no CSV de amostra: ${nome}`);
    return i;
  };

  return linhas.map((linha) => {
    const c = linha.split(";");
    return {
      nome: c[idx("Nome")]!.trim(),
      workedDays: parseInt(c[idx("Dias Trabalhados")]!, 10),
      totalMinutes: paraMinutos(c[idx("Total Horas")]!),
      hourlyRate: numeroBr(c[idx("Valor/Hora Base")]),
      dailyRate: numeroBr(c[idx("Valor/Dia Base")]),
      transportAllowance: numeroBr(c[idx("Passagem/Dia")]),
      totalByHour: numeroBr(c[idx("Total por Hora")]),
      totalByDay: numeroBr(c[idx("Total por Dia")]),
      transportTotal: numeroBr(c[idx("Total Passagem")]),
      totalValue: numeroBr(c[idx("Valor Total")]),
      deductionsTotal: numeroBr(c[idx("Descontos")]),
      amountToPay: numeroBr(c[idx("VALOR A PAGAR")]),
    };
  });
}

const fechamento = lerFechamento();

describe("calcularValores — contra o fechamento real de 15/07 a 31/07/2026", () => {
  it("a amostra tem as seis colaboradoras", () => {
    expect(fechamento).toHaveLength(6);
  });

  it.each(fechamento)(
    "reproduz a linha de $nome",
    (linha) => {
      const v = calcularValores({
        totalMinutes: linha.totalMinutes,
        workedDays: linha.workedDays,
        taxas: {
          hourlyRate: linha.hourlyRate,
          dailyRate: linha.dailyRate,
          transportAllowance: linha.transportAllowance,
        },
        deductionsTotal: linha.deductionsTotal,
      });

      // O CSV traz Total Horas em HH:MM:SS; os segundos descartados podem
      // deslocar o Total por Hora em alguns centavos.
      expect(v.totalByHour).toBeCloseTo(linha.totalByHour, 1);
      expect(v.totalByDay).toBeCloseTo(linha.totalByDay, 2);
      expect(v.transportTotal).toBeCloseTo(linha.transportTotal, 2);
      expect(v.totalValue).toBeCloseTo(linha.totalValue, 1);
      expect(v.amountToPay).toBe(linha.amountToPay);
    }
  );

  it("Total por Dia não entra no Valor Total", () => {
    for (const linha of fechamento) {
      const v = calcularValores({
        totalMinutes: linha.totalMinutes,
        workedDays: linha.workedDays,
        taxas: {
          hourlyRate: linha.hourlyRate,
          dailyRate: linha.dailyRate,
          transportAllowance: linha.transportAllowance,
        },
        deductionsTotal: linha.deductionsTotal,
      });
      // Somar a diária dobraria o valor — é assim que se sabe que é referência.
      expect(v.totalValue).toBeCloseTo(linha.totalValue, 1);
      expect(v.totalValue + v.totalByDay).not.toBeCloseTo(linha.totalValue, 1);
    }
  });
});

describe("arredondarParaCima", () => {
  // Os três casos citados no CLAUDE.md.
  it("1937,28 vira 1938", () => expect(arredondarParaCima(1937.28)).toBe(1938));
  it("1620,08 vira 1621", () => expect(arredondarParaCima(1620.08)).toBe(1621));
  it("1887,33 vira 1888", () => expect(arredondarParaCima(1887.33)).toBe(1888));

  it("não sobe um real quando o valor já é inteiro", () => {
    expect(arredondarParaCima(1938)).toBe(1938);
    expect(arredondarParaCima(0)).toBe(0);
  });

  it("resiste a resíduo de ponto flutuante", () => {
    // 0.1 + 0.2 = 0.30000000000000004; sem arredondar ao centavo, viraria 1939
    expect(arredondarParaCima(1938 + (0.1 + 0.2 - 0.3))).toBe(1938);
  });

  it("arredonda para cima, não para o mais próximo", () => {
    expect(arredondarParaCima(1937.01)).toBe(1938);
    expect(arredondarParaCima(1937.99)).toBe(1938);
  });
});

describe("statusDoPeriodo", () => {
  it("0 dias com problema é ok", () => expect(statusDoPeriodo(0)).toBe("ok"));
  it("1 a 2 é aviso", () => {
    expect(statusDoPeriodo(1)).toBe("warning");
    expect(statusDoPeriodo(2)).toBe("warning");
  });
  it("3 ou mais é crítico", () => {
    expect(statusDoPeriodo(3)).toBe("critical");
    expect(statusDoPeriodo(9)).toBe("critical");
  });
});
