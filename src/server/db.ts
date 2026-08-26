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
import { and, asc, desc, eq, sql } from "drizzle-orm";
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

// ─── Daily Summaries ─────────────────────────────────────────────────────────

export async function insertDailySummaries(summaries: InsertDailySummary[]) {
  if (summaries.length === 0) return;
  const db = getDb();
  for (let i = 0; i < summaries.length; i += 500) {
    await db.insert(dailySummaries).values(summaries.slice(i, i + 500));
  }
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
