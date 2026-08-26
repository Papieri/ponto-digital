/**
 * Cálculo dos valores do fechamento.
 *
 * As regras estão na seção 4 da especificação e no resumo do CLAUDE.md:
 *
 *   Total por Hora  = horas decimais x Valor/hora
 *   Total por Dia   = dias trabalhados x Valor/dia    <- REFERÊNCIA, não entra
 *   Total Passagem  = dias trabalhados x Passagem/dia
 *   Valor Total     = Total por Hora + Total Passagem
 *   VALOR A PAGAR   = ARREDONDAR PARA CIMA (Valor Total + Acréscimos - Descontos)
 *
 * Conferido linha a linha contra `amostras/fechamento_15-07-2026_31-07-2026.csv`,
 * que é saída real do sistema antigo — ver `calculo.test.ts`. As seis linhas
 * fecham, inclusive o arredondamento.
 *
 * "Total por Dia" é referência e NÃO entra no pagamento. Isso não é escolha de
 * implementação: no fechamento real, somá-lo praticamente dobraria todos os
 * valores (a Elaine receberia 3.887,28 em vez de 1.937,28).
 *
 * Funções puras, sem dependência de banco — mesma convenção do parser.
 */

/** Arredonda ao centavo. Usado antes de qualquer comparação ou arredondamento. */
export function arredondarCentavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Arredonda para cima, ao real inteiro. Sempre a favor do colaborador.
 *
 * O arredondamento ao centavo antes do `ceil` não é cosmético: em ponto
 * flutuante, 1938 pode chegar aqui como 1938.0000000001 e virar 1939.
 */
export function arredondarParaCima(valor: number): number {
  return Math.ceil(arredondarCentavos(valor));
}

/** Taxas do colaborador, congeladas no lote no momento do cálculo. */
export interface TaxasColaborador {
  /** Valor/hora — individual por pessoa, não derivar da diária */
  hourlyRate: number;
  /** Valor/dia — usado só como referência no relatório */
  dailyRate: number;
  /** Passagem/dia — pode ser zero */
  transportAllowance: number;
}

export interface EntradaCalculo {
  totalMinutes: number;
  workedDays: number;
  taxas: TaxasColaborador;
  /** Acréscimos do período. Não atravessam quinzenas. */
  additionsTotal?: number;
  /** Descontos do período. Não atravessam quinzenas. */
  deductionsTotal?: number;
}

export interface ValoresCalculados {
  totalByHour: number;
  /** Referência. Não entra no Valor Total nem no VALOR A PAGAR. */
  totalByDay: number;
  transportTotal: number;
  totalValue: number;
  additionsTotal: number;
  deductionsTotal: number;
  amountToPay: number;
}

/** Aplica as regras de cálculo a um colaborador dentro de um lote. */
export function calcularValores(entrada: EntradaCalculo): ValoresCalculados {
  const { totalMinutes, workedDays, taxas } = entrada;
  const additionsTotal = arredondarCentavos(entrada.additionsTotal ?? 0);
  const deductionsTotal = arredondarCentavos(entrada.deductionsTotal ?? 0);

  const horasDecimais = totalMinutes / 60;

  const totalByHour = arredondarCentavos(horasDecimais * taxas.hourlyRate);
  const totalByDay = arredondarCentavos(workedDays * taxas.dailyRate);
  const transportTotal = arredondarCentavos(workedDays * taxas.transportAllowance);

  // Valor Total soma as colunas já arredondadas, como a planilha do fechamento.
  const totalValue = arredondarCentavos(totalByHour + transportTotal);

  const amountToPay = arredondarParaCima(
    totalValue + additionsTotal - deductionsTotal
  );

  return {
    totalByHour,
    totalByDay,
    transportTotal,
    totalValue,
    additionsTotal,
    deductionsTotal,
    amountToPay,
  };
}

/** Status do colaborador no período: 0 = ok · 1 a 2 = aviso · 3 ou mais = crítico. */
export function statusDoPeriodo(
  diasComProblema: number
): "ok" | "warning" | "critical" {
  return diasComProblema >= 3 ? "critical" : diasComProblema >= 1 ? "warning" : "ok";
}

/** Formata para as colunas `numeric(10,2)` do schema. */
export function paraNumeric(valor: number): string {
  return arredondarCentavos(valor).toFixed(2);
}
