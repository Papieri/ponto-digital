/**
 * Camada de acesso ao banco — Postgres via Drizzle + driver `postgres`.
 *
 * Portada de `referencia/codigo-fonte/db.ts` (MySQL/TiDB via mysql2). Mudam o
 * driver e o dialeto; as consultas e a forma dos dados são as mesmas.
 *
 * REGRA DE FUSO HORÁRIO — leia antes de mexer:
 * Os campos de ponto são `timestamp` SEM timezone, em modo string. O driver
 * `postgres` converte, por padrão, `timestamp without time zone` (OID 1114) em
 * `Date` usando o fuso local do processo — o que reintroduziria exatamente o
 * deslocamento de +3h que esta migração precisa evitar. Por isso o parser de
 * tipo do OID 1114 é sobrescrito para devolver a string crua do banco, sem
 * nenhuma interpretação. O valor que entra é literalmente o que sai.
 *
 * Convenções (CLAUDE.md): todo acesso ao banco passa por aqui; nenhum router
 * consulta direto.
 */
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  type InsertDailySummary,
  type InsertEmployee,
  type InsertImportBatch,
  type InsertPayrollPeriod,
  type InsertTimeRecord,
  dailySummaries,
  employees,
  importBatches,
  payrollPeriods,
  periodAdjustments,
  timeRecords,
} from "../../drizzle/schema";

export type Db = ReturnType<typeof drizzle>;

let _client: ReturnType<typeof postgres> | null = null;
let _db: Db | null = null;

/**
 * Devolve a conexão, criando-a na primeira chamada. Sem DATABASE_URL, falha
 * alto — no marco 1 não existe modo degradado.
 */
export function getDb(): Db {
  if (_db) return _db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL não definida. Copie .env.example para .env e ajuste."
    );
  }

  _client = postgres(connectionString, {
    max: 5,
    // Fuso da sessão fixado em UTC. Não afeta `timestamp without time zone`
    // (que não carrega fuso), mas garante que nada mais na pilha reinterprete.
    connection: { TimeZone: "UTC" },
    types: {
      // OID 1114 = timestamp without time zone. Sem isto o driver devolveria
      // um Date construído no fuso local do processo.
      timestampNoTz: {
        to: 1114,
        from: [1114],
        serialize: (v: string | Date) =>
          typeof v === "string" ? v : v.toISOString().replace("T", " ").slice(0, 19),
        parse: (v: string) => v,
      },
    },
  });
  _db = drizzle(_client);
  return _db;
}

/** Encerra a conexão. Necessário para scripts de linha de comando terminarem. */
export async function closeDb(): Promise<void> {
  if (_client) await _client.end({ timeout: 5 });
  _client = null;
  _db = null;
}

// ─── Employees ───────────────────────────────────────────────────────────────

export async function getAllEmployees() {
  return getDb()
    .select()
    .from(employees)
    .where(eq(employees.active, true))
    .orderBy(asc(employees.name));
}

export async function getEmployeeByCode(code: number) {
  const result = await getDb()
    .select()
    .from(employees)
    .where(eq(employees.code, code))
    .limit(1);
  return result[0] ?? undefined;
}

export async function upsertEmployee(data: InsertEmployee) {
  const result = await getDb()
    .insert(employees)
    .values(data)
    .onConflictDoUpdate({
      target: employees.code,
      set: {
        name: data.name,
        department: data.department,
        hourlyRate: data.hourlyRate,
        dailyRate: data.dailyRate,
        transportAllowance: data.transportAllowance,
        active: data.active ?? true,
        updatedAt: new Date(),
      },
    })
    .returning();
  return result[0]!;
}

/** Baixa lógica, como no original: o histórico dos lotes precisa do cadastro. */
export async function deleteEmployee(id: number) {
  await getDb().update(employees).set({ active: false }).where(eq(employees.id, id));
}

// ─── Import Batches ──────────────────────────────────────────────────────────

export async function createImportBatch(data: InsertImportBatch) {
  const result = await getDb().insert(importBatches).values(data).returning();
  return result[0]!;
}

export async function updateImportBatch(
  id: number,
  data: Partial<InsertImportBatch>
) {
  await getDb().update(importBatches).set(data).where(eq(importBatches.id, id));
}

export async function getAllImportBatches() {
  return getDb().select().from(importBatches).orderBy(desc(importBatches.createdAt));
}

export async function getImportBatchById(id: number) {
  const result = await getDb()
    .select()
    .from(importBatches)
    .where(eq(importBatches.id, id))
    .limit(1);
  return result[0] ?? undefined;
}

/**
 * Remove o lote. A cascata é do banco (ON DELETE CASCADE nas chaves
 * estrangeiras) — no original era feita à mão, por limitação do TiDB.
 */
export async function deleteImportBatch(batchId: number) {
  await getDb().delete(importBatches).where(eq(importBatches.id, batchId));
}

// ─── Time Records ────────────────────────────────────────────────────────────

export async function insertTimeRecords(records: InsertTimeRecord[]) {
  if (records.length === 0) return;
  const db = getDb();
  for (let i = 0; i < records.length; i += 500) {
    await db.insert(timeRecords).values(records.slice(i, i + 500));
  }
}

export async function getTimeRecordsByBatch(batchId: number) {
  return getDb()
    .select()
    .from(timeRecords)
    .where(eq(timeRecords.batchId, batchId))
    .orderBy(asc(timeRecords.recordedAt));
}

/**
 * Batidas de um colaborador num dia. O recorte é pela data do registro, como no
 * original.
 *
 * LIMITAÇÃO CONHECIDA, herdada: num turno que cruza a meia-noite, a apuração
 * atribui a batida da madrugada ao dia anterior, mas esta consulta a devolve no
 * dia em que foi registrada. Nenhuma amostra real exercita turno noturno.
 */
export async function getTimeRecordsByEmployeeAndDate(
  batchId: number,
  employeeCode: number,
  workDate: string // YYYY-MM-DD
) {
  return getDb()
    .select()
    .from(timeRecords)
    .where(
      and(
        eq(timeRecords.batchId, batchId),
        eq(timeRecords.employeeCode, employeeCode),
        gte(timeRecords.recordedAt, `${workDate} 00:00:00`),
        lte(timeRecords.recordedAt, `${workDate} 23:59:59`)
      )
    )
    .orderBy(asc(timeRecords.recordedAt));
}

export async function addTimeRecord(record: InsertTimeRecord) {
  const result = await getDb().insert(timeRecords).values(record).returning();
  return result[0]!;
}

export async function deleteTimeRecord(id: number) {
  await getDb().delete(timeRecords).where(eq(timeRecords.id, id));
}

export async function getTimeRecordById(id: number) {
  const result = await getDb()
    .select()
    .from(timeRecords)
    .where(eq(timeRecords.id, id))
    .limit(1);
  return result[0] ?? undefined;
}

// ─── Daily Summaries ─────────────────────────────────────────────────────────

export async function insertDailySummaries(summaries: InsertDailySummary[]) {
  if (summaries.length === 0) return;
  const db = getDb();
  for (let i = 0; i < summaries.length; i += 500) {
    await db.insert(dailySummaries).values(summaries.slice(i, i + 500));
  }
}

export async function getDailySummaryByEmployeeAndDate(
  batchId: number,
  employeeCode: number,
  workDate: string // YYYY-MM-DD
) {
  const result = await getDb()
    .select()
    .from(dailySummaries)
    .where(
      and(
        eq(dailySummaries.batchId, batchId),
        eq(dailySummaries.employeeCode, employeeCode),
        gte(dailySummaries.workDate, `${workDate} 00:00:00`),
        lte(dailySummaries.workDate, `${workDate} 23:59:59`)
      )
    )
    .limit(1);
  return result[0] ?? undefined;
}

export async function insertDailySummary(resumo: InsertDailySummary) {
  const result = await getDb().insert(dailySummaries).values(resumo).returning();
  return result[0]!;
}

export async function deleteDailySummary(id: number) {
  await getDb().delete(dailySummaries).where(eq(dailySummaries.id, id));
}

export async function updateDailySummary(
  id: number,
  data: Partial<InsertDailySummary>
) {
  await getDb().update(dailySummaries).set(data).where(eq(dailySummaries.id, id));
}

export async function getDailySummariesByBatch(batchId: number) {
  return getDb()
    .select()
    .from(dailySummaries)
    .where(eq(dailySummaries.batchId, batchId))
    .orderBy(asc(dailySummaries.employeeCode), asc(dailySummaries.workDate));
}

// ─── Payroll Periods ─────────────────────────────────────────────────────────

export async function insertPayrollPeriods(periods: InsertPayrollPeriod[]) {
  if (periods.length === 0) return;
  const db = getDb();
  for (let i = 0; i < periods.length; i += 500) {
    await db.insert(payrollPeriods).values(periods.slice(i, i + 500));
  }
}

export async function getPayrollPeriodsByBatch(batchId: number) {
  return getDb()
    .select()
    .from(payrollPeriods)
    .where(eq(payrollPeriods.batchId, batchId))
    .orderBy(asc(payrollPeriods.employeeCode));
}

export async function getPayrollPeriodByEmployee(
  batchId: number,
  employeeCode: number
) {
  const result = await getDb()
    .select()
    .from(payrollPeriods)
    .where(
      and(
        eq(payrollPeriods.batchId, batchId),
        eq(payrollPeriods.employeeCode, employeeCode)
      )
    )
    .limit(1);
  return result[0] ?? undefined;
}

export async function getPayrollPeriodSummary(batchId: number) {
  return getDb()
    .select({
      totalEmployees: sql<number>`COUNT(DISTINCT ${payrollPeriods.employeeCode})`,
      totalWorkedDays: sql<number>`SUM(${payrollPeriods.workedDays})`,
      totalMinutes: sql<number>`SUM(${payrollPeriods.totalMinutes})`,
      totalByHour: sql<number>`SUM(${payrollPeriods.totalByHour})`,
      totalByDay: sql<number>`SUM(${payrollPeriods.totalByDay})`,
      totalTransport: sql<number>`SUM(${payrollPeriods.transportTotal})`,
      criticalCount: sql<number>`SUM(CASE WHEN ${payrollPeriods.status} = 'critical' THEN 1 ELSE 0 END)`,
      warningCount: sql<number>`SUM(CASE WHEN ${payrollPeriods.status} = 'warning' THEN 1 ELSE 0 END)`,
    })
    .from(payrollPeriods)
    .where(eq(payrollPeriods.batchId, batchId));
}

// ─── Period Adjustments ──────────────────────────────────────────────────────

/**
 * Descontos e acréscimos do lote. O CRUD é da Fase 3; a leitura já existe
 * porque o VALOR A PAGAR depende deles — sem lote de ajustes, soma zero.
 */
export async function getPeriodAdjustmentsByBatch(batchId: number) {
  return getDb()
    .select()
    .from(periodAdjustments)
    .where(eq(periodAdjustments.batchId, batchId))
    .orderBy(asc(periodAdjustments.employeeCode));
}

// ─── Atualização de fechamento (correção 6.5) ────────────────────────────────

export async function updatePayrollPeriodForEmployee(
  batchId: number,
  employeeCode: number,
  data: Partial<InsertPayrollPeriod>
) {
  await getDb()
    .update(payrollPeriods)
    .set(data)
    .where(
      and(
        eq(payrollPeriods.batchId, batchId),
        eq(payrollPeriods.employeeCode, employeeCode)
      )
    );
}
