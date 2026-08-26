/**
 * Correções obrigatórias da seção 6 da especificação.
 *
 * Tudo aqui é camada ADITIVA sobre o parser: `timesheetParser.ts` segue byte a
 * byte igual ao original, com seus 27 testes. As correções operam sobre o
 * resultado dele, para que a apuração portada e as correções possam ser
 * revisadas — e revertidas — separadamente.
 *
 * Implementadas: 6.2, 6.3, 6.4.
 * NÃO implementada: 6.1 (dia sem horas apuradas) — regra ainda não decidida.
 *                   Ver `decidirCountsAsWorkedDay` no fim do arquivo.
 */
import type { DayGroup } from "./timesheetParser";

// ─── 6.2 · Período confirmável na importação ─────────────────────────────────

/**
 * Período do lote. Strings UTC 'YYYY-MM-DD HH:MM:SS', como o resto da pilha.
 */
export interface Periodo {
  periodStart: string;
  periodEnd: string;
}

export interface PeriodoDoLote extends Periodo {
  /** true quando veio do operador; false quando é só a sugestão do arquivo */
  periodConfirmed: boolean;
}

const FORMATO_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

export class PeriodoInvalidoError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "PeriodoInvalidoError";
  }
}

/**
 * Decide o período do lote (correção 6.2).
 *
 * Antes, o período era sempre o menor e o maior registro do arquivo, aceito em
 * silêncio: um export com intervalo errado rotulava o lote errado. Agora o
 * detectado é apenas sugestão, e o período informado pelo operador prevalece e
 * marca o lote como confirmado.
 */
export function resolverPeriodo(
  detectado: Periodo,
  informado?: Periodo
): PeriodoDoLote {
  if (!informado) {
    return { ...detectado, periodConfirmed: false };
  }

  for (const [campo, valor] of Object.entries(informado)) {
    if (!FORMATO_TIMESTAMP.test(valor)) {
      throw new PeriodoInvalidoError(
        `${campo} deve estar no formato 'YYYY-MM-DD HH:MM:SS' (recebido: ${valor})`
      );
    }
  }
  if (informado.periodStart > informado.periodEnd) {
    throw new PeriodoInvalidoError(
      `Início do período depois do fim: ${informado.periodStart} > ${informado.periodEnd}`
    );
  }

  return { ...informado, periodConfirmed: true };
}

// ─── 6.3 · Último dia do export com tratamento distinto ──────────────────────

export const MOTIVO_EXPORT_TRUNCADO =
  "Último dia do arquivo — export possivelmente truncado, não é batida faltando";

/**
 * Dia apurado, já com as correções aplicadas.
 *
 * `hasIssue` passa a significar "dia que o operador precisa resolver". O dia
 * truncado sai desse conjunto mas mantém `issueDescription`, para a tela poder
 * mostrar a nota sem disparar alarme.
 */
export interface DiaApurado extends DayGroup {
  /** true quando o dia foi reclassificado como export truncado (6.3) */
  exportTruncado: boolean;
}

/** Maior workDate entre os grupos — o dia em que o arquivo termina. */
export function ultimoDiaDoArquivo(grupos: DayGroup[]): string | null {
  let ultimo: string | null = null;
  for (const g of grupos) {
    if (ultimo === null || g.workDate > ultimo) ultimo = g.workDate;
  }
  return ultimo;
}

/**
 * Aplica a correção 6.3.
 *
 * Quando o arquivo termina no meio de um dia, as batidas soltas desse dia
 * apareciam como "batida faltando". Alarme falso recorrente faz o operador
 * ignorar o alerta de verdade — que é o problema que a 6.4 tenta resolver.
 *
 * O último dia do arquivo deixa de contar como dia com problema e passa a
 * carregar uma nota informativa. Os dias anteriores não mudam: se o arquivo
 * termina no dia 24, uma batida faltando no dia 21 continua sendo alarme.
 *
 * ATENÇÃO: isto altera a coluna "Dias c/ Problema" e, por consequência, o
 * status do colaborador. É mudança de comportamento pedida pela especificação,
 * não regressão da migração.
 */
export function aplicarCorrecaoExportTruncado(grupos: DayGroup[]): DiaApurado[] {
  const ultimo = ultimoDiaDoArquivo(grupos);

  return grupos.map((g) => {
    const ehUltimoDiaComAlarme = g.workDate === ultimo && g.hasIssue;
    if (!ehUltimoDiaComAlarme) {
      return { ...g, exportTruncado: false };
    }
    return {
      ...g,
      hasIssue: false,
      issueDescription: MOTIVO_EXPORT_TRUNCADO,
      exportTruncado: true,
    };
  });
}

// ─── 6.4 · Fechamento barrado com dias em aberto ─────────────────────────────

/**
 * Dia com número ímpar de batidas: o pareamento sequencial casa as duas
 * primeiras e descarta a terceira. O total sai menor do que a pessoa
 * trabalhou — não é "incompleto", é errado para menos, e o colaborador recebe
 * a menos se ninguém corrigir.
 */
export interface DiaEmAberto {
  employeeCode: number;
  employeeName: string;
  workDate: string;
  recordCount: number;
  issueDescription: string;
}

export class DiasEmAbertoError extends Error {
  readonly dias: DiaEmAberto[];
  constructor(dias: DiaEmAberto[]) {
    const resumo = dias
      .map((d) => `${d.employeeName} em ${d.workDate} (${d.recordCount} batidas)`)
      .join("; ");
    super(
      `Fechamento bloqueado: ${dias.length} dia(s) em aberto — ${resumo}. ` +
        `Corrija as batidas ou confirme explicitamente o fechamento.`
    );
    this.name = "DiasEmAbertoError";
    this.dias = dias;
  }
}

/**
 * Lista os dias em aberto de um lote (correção 6.4).
 *
 * O dia truncado do fim do arquivo não entra: pela 6.3 ele não é batida
 * faltando, e barrar o fechamento por causa dele seria o mesmo alarme falso
 * numa porta diferente.
 */
export function diasEmAberto(dias: DiaApurado[]): DiaEmAberto[] {
  return dias
    .filter((d) => !d.exportTruncado && d.records.length % 2 !== 0)
    .map((d) => ({
      employeeCode: d.employeeCode,
      employeeName: d.employeeName,
      workDate: d.workDate,
      recordCount: d.records.length,
      issueDescription: d.issueDescription,
    }));
}

/**
 * Porta de entrada do fechamento (correção 6.4).
 *
 * A sinalização já existia; o que faltava era impedir o fechamento com dias em
 * aberto, ou exigir confirmação explícita. Sem `confirmado`, lança.
 */
export function verificarFechamento(
  dias: DiaApurado[],
  opcoes: { confirmado?: boolean } = {}
): DiaEmAberto[] {
  const emAberto = diasEmAberto(dias);
  if (emAberto.length > 0 && !opcoes.confirmado) {
    throw new DiasEmAbertoError(emAberto);
  }
  return emAberto;
}

// ─── 6.1 · NÃO IMPLEMENTADA ──────────────────────────────────────────────────

/**
 * Ponto único de decisão da correção 6.1 — "dia sem horas conta como dia
 * trabalhado".
 *
 * REGRA AINDA NÃO DEFINIDA. Não decidir sozinho (CLAUDE.md).
 *
 * Hoje, todo dia com qualquer registro conta como dia trabalhado e paga diária
 * de referência e passagem cheia, mesmo apurando zero hora. As candidatas na
 * especificação são: contar só quando houver minutos apurados, ou só quando
 * houver ao menos um par completo de batidas.
 *
 * Esta função existe para que a regra tenha um lugar só quando for decidida.
 * Enquanto isso, devolve o comportamento atual sem alterá-lo: todo dia
 * apurado conta.
 *
 * No arquivo de amostra o caso ocorre com Elaine, Raquel e Ketlen em
 * 24/08/2026 — as mesmas três batidas soltas que a 6.3 reclassifica. Ou seja:
 * com a 6.3 aplicada e a 6.1 pendente, esses dias deixam de dar alarme mas
 * continuam pagando diária e passagem.
 */
export function decidirCountsAsWorkedDay(_dia: DiaApurado): boolean {
  return true;
}
