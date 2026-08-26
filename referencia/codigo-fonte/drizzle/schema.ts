import {
  boolean,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Funcionários cadastrados no sistema
export const employees = mysqlTable("employees", {
  id: int("id").autoincrement().primaryKey(),
  code: int("code").notNull().unique(), // Código do funcionário (Tra. No.)
  name: varchar("name", { length: 128 }).notNull(),
  department: varchar("department", { length: 64 }).default("PRODUCAO"),
  hourlyRate: decimal("hourlyRate", { precision: 10, scale: 2 }).notNull().default("0.00"),
  dailyRate: decimal("dailyRate", { precision: 10, scale: 2 }).notNull().default("0.00"),
  transportAllowance: decimal("transportAllowance", { precision: 10, scale: 2 }).default("0.00"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = typeof employees.$inferInsert;

// Lotes de importação (cada arquivo TXT importado)
export const importBatches = mysqlTable("import_batches", {
  id: int("id").autoincrement().primaryKey(),
  filename: varchar("filename", { length: 256 }).notNull(),
  s3Key: varchar("s3Key", { length: 512 }),
  s3Url: text("s3Url"),
  periodStart: timestamp("periodStart", { mode: "string" }).notNull(),
  periodEnd: timestamp("periodEnd", { mode: "string" }).notNull(),
  totalRecords: int("totalRecords").default(0),
  processedEmployees: int("processedEmployees").default(0),
  status: mysqlEnum("status", ["processing", "completed", "error"]).default("processing").notNull(),
  importedBy: int("importedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ImportBatch = typeof importBatches.$inferSelect;
export type InsertImportBatch = typeof importBatches.$inferInsert;

// Registros de ponto individuais
export const timeRecords = mysqlTable("time_records", {
  id: int("id").autoincrement().primaryKey(),
  batchId: int("batchId").notNull(),
  employeeCode: int("employeeCode").notNull(),
  employeeName: varchar("employeeName", { length: 128 }).notNull(),
  department: varchar("department", { length: 64 }),
  recordedAt: timestamp("recordedAt", { mode: "string" }).notNull(),
  machineNo: varchar("machineNo", { length: 16 }),
  isManual: boolean("isManual").default(false), // Registro inserido manualmente
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TimeRecord = typeof timeRecords.$inferSelect;
export type InsertTimeRecord = typeof timeRecords.$inferInsert;

// Resumo diário calculado por funcionário
export const dailySummaries = mysqlTable("daily_summaries", {
  id: int("id").autoincrement().primaryKey(),
  batchId: int("batchId").notNull(),
  employeeCode: int("employeeCode").notNull(),
  workDate: timestamp("workDate", { mode: "string" }).notNull(), // Data do dia de trabalho
  recordCount: int("recordCount").default(0), // Qtd de registros naquele dia
  firstIn: timestamp("firstIn", { mode: "string" }), // Primeira entrada
  lastOut: timestamp("lastOut", { mode: "string" }), // Última saída
  totalMinutes: int("totalMinutes").default(0), // Total de minutos trabalhados
  hasIssue: boolean("hasIssue").default(false).notNull(), // Sinalização de problema
  issueDescription: text("issueDescription"), // Descrição do problema
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DailySummary = typeof dailySummaries.$inferSelect;
export type InsertDailySummary = typeof dailySummaries.$inferInsert;

// Períodos de fechamento quinzenal
export const payrollPeriods = mysqlTable("payroll_periods", {
  id: int("id").autoincrement().primaryKey(),
  batchId: int("batchId").notNull(),
  employeeCode: int("employeeCode").notNull(),
  employeeName: varchar("employeeName", { length: 128 }).notNull(),
  periodStart: timestamp("periodStart", { mode: "string" }).notNull(),
  periodEnd: timestamp("periodEnd", { mode: "string" }).notNull(),
  workedDays: int("workedDays").default(0),
  totalMinutes: int("totalMinutes").default(0),
  hourlyRate: decimal("hourlyRate", { precision: 10, scale: 2 }).default("0.00"),
  dailyRate: decimal("dailyRate", { precision: 10, scale: 2 }).default("0.00"),
  transportAllowance: decimal("transportAllowance", { precision: 10, scale: 2 }).default("0.00"),
  totalByHour: decimal("totalByHour", { precision: 10, scale: 2 }).default("0.00"),
  totalByDay: decimal("totalByDay", { precision: 10, scale: 2 }).default("0.00"),
  transportTotal: decimal("transportTotal", { precision: 10, scale: 2 }).default("0.00"),
  missingDays: int("missingDays").default(0), // Dias com registros faltantes
  status: mysqlEnum("status", ["ok", "warning", "critical"]).default("ok").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PayrollPeriod = typeof payrollPeriods.$inferSelect;
export type InsertPayrollPeriod = typeof payrollPeriods.$inferInsert;
