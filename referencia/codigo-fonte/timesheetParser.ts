/**
 * Timesheet Parser
 *
 * Processa arquivos TXT de registros de ponto no formato:
 * ID  Nome  Departamento  Data/Hora  Máquina
 *
 * Regras de negócio:
 * - Padrão normal: 4 registros/dia (entrada, saída almoço, retorno almoço, saída)
 * - Exceção: 6 registros/dia (com pausas adicionais)
 * - Turno noturno: registros de saída na madrugada (00:00–05:59) pertencem ao
 *   turno iniciado no dia anterior. O dia de referência é o da ENTRADA.
 * - Registros são ordenados por horário e agrupados em pares entrada/saída
 * - Horas trabalhadas = soma dos intervalos entre pares (entrada→saída)
 */

/** Horário limite para considerar um registro como "madrugada do turno anterior" */
/** Registros antes das 05:30 UTC são considerados madrugada do turno anterior */
const NIGHT_SHIFT_CUTOFF_HOUR = 5;
const NIGHT_SHIFT_CUTOFF_MINUTE = 30; // 00:00–05:29 → pertence ao dia anterior; 05:30+ → turno matinal

export interface ParsedRecord {
  employeeCode: number;
  employeeName: string;
  department: string;
  recordedAt: Date;
  machineNo: string;
}

export interface DayGroup {
  employeeCode: number;
  employeeName: string;
  workDate: string; // YYYY-MM-DD (data da ENTRADA do turno)
  records: ParsedRecord[];
  totalMinutes: number;
  firstIn: Date | null;
  lastOut: Date | null;
  hasIssue: boolean;
  issueDescription: string;
}

/**
 * Converte qualquer capitalização para Title Case.
 * Ex: "ELAINE" → "Elaine", "altamiRO" → "Altamiro", "Maria Izadora" → "Maria Izadora"
 */
export function toTitleCase(name: string): string {
  return name
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .trim();
}

/**
 * Faz o parse de uma linha do arquivo TXT.
 * Formato esperado: "ID\tNome\tDept\t DD.MM.YYYY     HH:MM:SS\tMáquina"
 */
function parseLine(line: string): ParsedRecord | null {
  const parts = line.split("\t").map((p) => p.trim());
  if (parts.length < 5) return null;

  const codeStr = parts[0]?.trim();
  const name = parts[1]?.trim();
  const department = parts[2]?.trim() ?? "PRODUCAO";
  const dateTimeStr = parts[3]?.trim();
  const machineNo = parts[4]?.trim() ?? "1";

  if (!codeStr || !name || !dateTimeStr) return null;

  const code = parseInt(codeStr, 10);
  if (isNaN(code)) return null;

  // Parse da data/hora: "02.02.2026     05:50:06" ou "02.02.2026 05:50:06"
  const dtClean = dateTimeStr.replace(/\s+/g, " ").trim();
  const dtMatch = dtClean.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!dtMatch) return null;

  const [, day, month, year, hour, minute, second] = dtMatch;
  // Usa Date.UTC para preservar exatamente o horário do arquivo sem conversão de timezone
  const recordedAt = new Date(
    Date.UTC(
      parseInt(year!),
      parseInt(month!) - 1,
      parseInt(day!),
      parseInt(hour!),
      parseInt(minute!),
      parseInt(second!)
    )
  );
  if (isNaN(recordedAt.getTime())) return null;

  return {
    employeeCode: code,
    employeeName: toTitleCase(name),
    department,
    recordedAt,
    machineNo,
  };
}

/**
 * Faz o parse do conteúdo completo do arquivo TXT.
 */
export function parseTxtContent(content: string): ParsedRecord[] {
  const lines = content.split("\n");
  const records: ParsedRecord[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("Tra.") || trimmed.startsWith("No.")) continue;

    const record = parseLine(trimmed);
    if (record) records.push(record);
  }

  return records;
}

/**
 * Retorna a data UTC (YYYY-MM-DD) de um Date.
 */
function toUtcDateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Subtrai um dia de uma chave YYYY-MM-DD.
 */
function prevDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const prev = new Date(Date.UTC(y!, m! - 1, d! - 1));
  return toUtcDateKey(prev);
}

/**
 * Calcula minutos trabalhados a partir de uma lista de registros já ordenados.
 * Agrupa em pares: registro[0]→registro[1], registro[2]→registro[3], etc.
 * Se o número de registros for ímpar, o último fica sem par (hasIssue = true).
 */
function calculateDayMinutes(records: ParsedRecord[]): {
  totalMinutes: number;
  hasIssue: boolean;
  issueDescription: string;
} {
  const sorted = [...records].sort(
    (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime()
  );

  const count = sorted.length;
  let totalMinutes = 0;
  let hasIssue = false;
  let issueDescription = "";

  if (count === 0) {
    return { totalMinutes: 0, hasIssue: true, issueDescription: "Sem registros" };
  }

  if (count % 2 !== 0) {
    hasIssue = true;
    issueDescription = `Número ímpar de registros (${count}) — possível batida faltando`;
  } else if (count !== 4 && count !== 6) {
    hasIssue = true;
    issueDescription = `${count} registros no dia (esperado: 4 ou 6)`;
  }

  const pairsToProcess = Math.floor(count / 2);
  for (let i = 0; i < pairsToProcess; i++) {
    const entrada = sorted[i * 2];
    const saida = sorted[i * 2 + 1];
    if (entrada && saida) {
      const diff = saida.recordedAt.getTime() - entrada.recordedAt.getTime();
      if (diff > 0) {
        totalMinutes += Math.floor(diff / 60000);
      }
    }
  }

  return { totalMinutes, hasIssue, issueDescription };
}

/**
 * Agrupa os registros por funcionário e por dia, com suporte a turno noturno.
 *
 * Lógica de turno noturno:
 * 1. Agrupa inicialmente por data UTC do registro.
 * 2. Para cada funcionário, verifica se um dia tem registros de madrugada
 *    (hora UTC < NIGHT_SHIFT_CUTOFF_HOUR = 06:00).
 * 3. Se o dia anterior desse funcionário existe E terminou com número ímpar
 *    de registros, os registros de madrugada são "herdados" pelo dia anterior
 *    (pertencem ao mesmo turno que começou na noite anterior).
 * 4. O dia de referência do turno é sempre a data da ENTRADA.
 */
export function groupByEmployeeAndDay(records: ParsedRecord[]): DayGroup[] {
  // ── Passo 1: Agrupar por funcionário e data UTC ──────────────────────────
  const map = new Map<string, ParsedRecord[]>();

  for (const record of records) {
    const dateKey = toUtcDateKey(record.recordedAt);
    const key = `${record.employeeCode}|${dateKey}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(record);
  }

  // ── Passo 2: Detectar e mesclar registros de madrugada (turno noturno) ──
  // Coletar todas as chaves para poder verificar o dia anterior
  const allKeys = new Set(map.keys());

  // Registros que serão movidos para o dia anterior
  const toMove = new Map<string, ParsedRecord[]>(); // destKey → records a adicionar

  for (const [key, dayRecords] of Array.from(map.entries())) {
    const [codeStr, dateKey] = key.split("|") as [string, string];

    // Separar registros de madrugada (hora UTC < 05:30 = pertence ao turno anterior)
    const isNightRecord = (r: ParsedRecord) => {
      const h = r.recordedAt.getUTCHours();
      const m = r.recordedAt.getUTCMinutes();
      return h < NIGHT_SHIFT_CUTOFF_HOUR || (h === NIGHT_SHIFT_CUTOFF_HOUR && m < NIGHT_SHIFT_CUTOFF_MINUTE);
    };
    const nightRecords = dayRecords.filter(isNightRecord);
    const normalRecords = dayRecords.filter((r) => !isNightRecord(r));

    if (nightRecords.length === 0) continue; // Nenhum registro de madrugada

    const prevKey = `${codeStr}|${prevDateKey(dateKey)}`;

    // Só herda se o dia anterior existe para esse funcionário
    if (!allKeys.has(prevKey)) continue;

    const prevDayRecords = map.get(prevKey)!;

    // Verifica se o dia anterior terminou com número ímpar (turno aberto)
    // OU se o último registro do dia anterior é tarde da noite (≥ 20:00)
    // indicando que o turno ainda estava em andamento
    const prevHasOddCount = prevDayRecords.length % 2 !== 0;

    // Só herda registros de madrugada se o dia anterior tem número ÍMPAR de registros
    // (turno aberto sem saída registrada). Se o dia anterior já tem par de registros,
    // o turno está fechado e os registros de madrugada pertencem ao dia atual.
    if (prevHasOddCount) {
      // Mover registros de madrugada para o dia anterior
      if (!toMove.has(prevKey)) toMove.set(prevKey, []);
      toMove.get(prevKey)!.push(...nightRecords);

      // Remover do dia atual
      if (normalRecords.length === 0) {
        map.delete(key);
      } else {
        map.set(key, normalRecords);
      }
    }
  }

  // Aplicar movimentos
  for (const [destKey, movedRecords] of Array.from(toMove.entries())) {
    const existing = map.get(destKey) ?? [];
    map.set(destKey, [...existing, ...movedRecords]);
  }

  // ── Passo 3: Construir DayGroups ─────────────────────────────────────────
  const groups: DayGroup[] = [];

  for (const [key, dayRecords] of Array.from(map.entries())) {
    const [codeStr, workDate] = key.split("|") as [string, string];
    const sorted = [...dayRecords].sort(
      (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime()
    );

    const { totalMinutes, hasIssue, issueDescription } = calculateDayMinutes(sorted);

    groups.push({
      employeeCode: parseInt(codeStr, 10),
      employeeName: sorted[0]!.employeeName,
      workDate,
      records: sorted,
      totalMinutes,
      firstIn: sorted[0]?.recordedAt ?? null,
      lastOut: sorted[sorted.length - 1]?.recordedAt ?? null,
      hasIssue,
      issueDescription,
    });
  }

  return groups.sort((a, b) => {
    if (a.employeeCode !== b.employeeCode) return a.employeeCode - b.employeeCode;
    return a.workDate.localeCompare(b.workDate);
  });
}

/**
 * Converte um objeto Date para string no formato MySQL 'YYYY-MM-DD HH:MM:SS'
 * usando os valores UTC, sem nenhuma conversão de timezone.
 * Isso garante que o mysql2 insira o valor exato sem aplicar offset do servidor.
 */
export function toMysqlUtcString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

/**
 * Detecta o período quinzenal com base nas datas dos registros.
 * Retorna strings UTC no formato MySQL para inserção direta sem conversão.
 */
export function detectPeriod(records: ParsedRecord[]): {
  periodStart: string;
  periodEnd: string;
} {
  if (records.length === 0) {
    const now = toMysqlUtcString(new Date());
    return { periodStart: now, periodEnd: now };
  }

  const dates = records.map((r) => r.recordedAt);
  const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

  // Normaliza para início e fim do dia em UTC
  const start = new Date(
    Date.UTC(minDate.getUTCFullYear(), minDate.getUTCMonth(), minDate.getUTCDate(), 0, 0, 0)
  );
  const end = new Date(
    Date.UTC(maxDate.getUTCFullYear(), maxDate.getUTCMonth(), maxDate.getUTCDate(), 23, 59, 59)
  );

  return { periodStart: toMysqlUtcString(start), periodEnd: toMysqlUtcString(end) };
}

/**
 * Formata minutos em "HH:MM"
 */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Converte string MySQL UTC 'YYYY-MM-DD HH:MM:SS' para timestamp em ms.
 * Trata como UTC puro sem conversão de timezone.
 */
function mysqlStringToMs(s: string): number {
  // Substitui espaço por T e adiciona Z para forçar UTC
  return new Date(s.replace(' ', 'T') + 'Z').getTime();
}

export function recalcFromTimestamps(timestamps: string[]): {
  totalMinutes: number;
  hasIssue: boolean;
  issueDescription: string;
  firstIn: string | null;
  lastOut: string | null;
} {
  const sorted = [...timestamps].sort((a, b) => mysqlStringToMs(a) - mysqlStringToMs(b));
  const count = sorted.length;
  if (count === 0) {
    return {
      totalMinutes: 0,
      hasIssue: true,
      issueDescription: "Sem registros",
      firstIn: null,
      lastOut: null,
    };
  }
  let hasIssue = false;
  let issueDescription = "";
  let totalMinutes = 0;
  if (count % 2 !== 0) {
    hasIssue = true;
    issueDescription = `Número ímpar de registros (${count}) — possível batida faltando`;
  } else if (count !== 4 && count !== 6) {
    hasIssue = true;
    issueDescription = `${count} registros no dia (esperado: 4 ou 6)`;
  }
  const pairsToProcess = Math.floor(count / 2);
  for (let i = 0; i < pairsToProcess; i++) {
    const entrada = sorted[i * 2];
    const saida = sorted[i * 2 + 1];
    if (entrada && saida) {
      const diff = mysqlStringToMs(saida) - mysqlStringToMs(entrada);
      if (diff > 0) totalMinutes += Math.floor(diff / 60000);
    }
  }
  return {
    totalMinutes,
    hasIssue,
    issueDescription,
    firstIn: sorted[0] ?? null,
    lastOut: sorted[sorted.length - 1] ?? null,
  };
}
