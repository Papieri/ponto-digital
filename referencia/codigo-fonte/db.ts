import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { createPool } from "mysql2";
import { drizzle } from "drizzle-orm/mysql2";
import {
  type InsertDailySummary,
  type InsertEmployee,
  type InsertImportBatch,
  type InsertPayrollPeriod,
  type InsertTimeRecord,
  type InsertUser,
  dailySummaries,
  employees,
  importBatches,
  payrollPeriods,
  timeRecords,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // Força timezone UTC na conexão para evitar conversões indesejadas
      // O servidor pode estar em outro timezone (ex: America/New_York)
      // Cria pool com timezone='+00:00' para evitar conversões de fuso horario
      const pool = createPool(process.env.DATABASE_URL + (process.env.DATABASE_URL.includes('?') ? '&' : '?') + 'timezone=%2B00%3A00');
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0] ?? undefined;
}

// ─── Employees ───────────────────────────────────────────────────────────────

export async function getAllEmployees() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(employees).where(eq(employees.active, true)).orderBy(asc(employees.name));
}

export async function getEmployeeByCode(code: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employees).where(eq(employees.code, code)).limit(1);
  return result[0] ?? undefined;
}

export async function upsertEmployee(data: InsertEmployee) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const updateSet: Partial<InsertEmployee> = {
    name: data.name,
    department: data.department,
    hourlyRate: data.hourlyRate,
    dailyRate: data.dailyRate,
    transportAllowance: data.transportAllowance,
    active: data.active,
  };
  await db.insert(employees).values(data).onDuplicateKeyUpdate({ set: updateSet });
  const result = await db.select().from(employees).where(eq(employees.code, data.code)).limit(1);
  return result[0];
}

export async function deleteEmployee(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(employees).set({ active: false }).where(eq(employees.id, id));
}

// ─── Import Batches ───────────────────────────────────────────────────────────

export async function createImportBatch(data: InsertImportBatch) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(importBatches).values(data);
  const result = await db
    .select()
    .from(importBatches)
    .orderBy(desc(importBatches.id))
    .limit(1);
  return result[0]!;
}

export async function updateImportBatch(
  id: number,
  data: Partial<InsertImportBatch>
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(importBatches).set(data).where(eq(importBatches.id, id));
}

export async function getAllImportBatches() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(importBatches).orderBy(desc(importBatches.createdAt));
}

export async function getImportBatchById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(importBatches).where(eq(importBatches.id, id)).limit(1);
  return result[0] ?? undefined;
}

// ─── Time Records ─────────────────────────────────────────────────────────────

export async function insertTimeRecords(records: InsertTimeRecord[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (records.length === 0) return;
  // Insert in batches of 500
  for (let i = 0; i < records.length; i += 500) {
    await db.insert(timeRecords).values(records.slice(i, i + 500));
  }
}

export async function getTimeRecordsByBatch(batchId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(timeRecords)
    .where(eq(timeRecords.batchId, batchId))
    .orderBy(asc(timeRecords.recordedAt));
}

// ─── Daily Summaries ──────────────────────────────────────────────────────────

export async function insertDailySummaries(summaries: InsertDailySummary[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (summaries.length === 0) return;
  for (let i = 0; i < summaries.length; i += 500) {
    await db.insert(dailySummaries).values(summaries.slice(i, i + 500));
  }
}

export async function getDailySummariesByBatch(batchId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(dailySummaries)
    .where(eq(dailySummaries.batchId, batchId))
    .orderBy(asc(dailySummaries.workDate));
}

// ─── Payroll Periods ──────────────────────────────────────────────────────────

export async function insertPayrollPeriods(periods: InsertPayrollPeriod[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (periods.length === 0) return;
  for (let i = 0; i < periods.length; i += 500) {
    await db.insert(payrollPeriods).values(periods.slice(i, i + 500));
  }
}

export async function getPayrollPeriodsByBatch(batchId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(payrollPeriods)
    .where(eq(payrollPeriods.batchId, batchId))
    .orderBy(asc(payrollPeriods.employeeName));
}

export async function getPayrollPeriodSummary(batchId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
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

// ─── Time Record Editing ──────────────────────────────────────────────────────

export async function getTimeRecordsByEmployeeAndDate(
  batchId: number,
  employeeCode: number,
  workDate: string // YYYY-MM-DD
) {
  const db = await getDb();
  if (!db) return [];
  // Filter records for the given date range using UTC string comparison
  const dayStart = `${workDate} 00:00:00`;
  const dayEnd = `${workDate} 23:59:59`;
  return db
    .select()
    .from(timeRecords)
    .where(
      and(
        eq(timeRecords.batchId, batchId),
        eq(timeRecords.employeeCode, employeeCode),
        gte(timeRecords.recordedAt, dayStart),
        lte(timeRecords.recordedAt, dayEnd)
      )
    )
    .orderBy(asc(timeRecords.recordedAt));
}

export async function addTimeRecord(record: InsertTimeRecord) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(timeRecords).values(record);
  // Return the inserted record - recordedAt is now a string 'YYYY-MM-DD HH:MM:SS'
  const dayStr = (record.recordedAt as string).slice(0, 10);
  const results = await getTimeRecordsByEmployeeAndDate(
    record.batchId,
    record.employeeCode,
    dayStr
  );
  return results;
}

export async function deleteTimeRecord(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(timeRecords).where(eq(timeRecords.id, id));
}

export async function updateDailySummary(
  id: number,
  data: Partial<InsertDailySummary>
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(dailySummaries).set(data).where(eq(dailySummaries.id, id));
}

export async function getDailySummaryById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(dailySummaries)
    .where(eq(dailySummaries.id, id))
    .limit(1);
  return result[0] ?? undefined;
}

export async function getDailySummaryByEmployeeAndDate(
  batchId: number,
  employeeCode: number,
  workDate: string // YYYY-MM-DD
) {
  const db = await getDb();
  if (!db) return undefined;
  // Find summary where workDate is on the same calendar day using UTC string comparison
  const dayStart = `${workDate} 00:00:00`;
  const dayEnd = `${workDate} 23:59:59`;
  const result = await db
    .select()
    .from(dailySummaries)
    .where(
      and(
        eq(dailySummaries.batchId, batchId),
        eq(dailySummaries.employeeCode, employeeCode),
        gte(dailySummaries.workDate, dayStart),
        lte(dailySummaries.workDate, dayEnd)
      )
    )
    .limit(1);
  return result[0] ?? undefined;
}

export async function updatePayrollPeriodForEmployee(
  batchId: number,
  employeeCode: number,
  data: Partial<InsertPayrollPeriod>
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(payrollPeriods)
    .set(data)
    .where(
      and(
        eq(payrollPeriods.batchId, batchId),
        eq(payrollPeriods.employeeCode, employeeCode)
      )
    );
}

export async function getPayrollPeriodByEmployee(
  batchId: number,
  employeeCode: number
) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
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

export async function deleteImportBatch(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Deletar em cascata (ordem: payroll → daily → records → batch)
  await db.delete(payrollPeriods).where(eq(payrollPeriods.batchId, batchId));
  await db.delete(dailySummaries).where(eq(dailySummaries.batchId, batchId));
  await db.delete(timeRecords).where(eq(timeRecords.batchId, batchId));
  await db.delete(importBatches).where(eq(importBatches.id, batchId));
}
