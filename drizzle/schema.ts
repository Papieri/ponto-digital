import {
  boolean,
  index,
  uniqueIndex,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Schema Postgres (Supabase) — convertido do schema MySQL original.
 *
 * REGRA DE FUSO HORÁRIO — não alterar sem ler:
 * Todos os campos de data/hora de ponto usam `timestamp` SEM timezone, em modo
 * string. O valor gravado é exatamente o que veio do arquivo TXT, tratado como
 * UTC em toda a pilha. O servidor nunca converte fuso: usa sempre getUTC*.
 * Trocar para `withTimezone: true` faz o driver aplicar offset e desloca todos
 * os horários — foi a origem de três bugs no sistema original.
 *
 * Campos de auditoria (createdAt, updatedAt) podem ter timezone, porque
 * representam instantes reais e não horários de cartão.
 */

export const userRole = pgEnum("user_role", ["user", "admin"]);
export const batchStatus = pgEnum("batch_status", ["processing", "completed", "error"]);
export const periodStatus = pgEnum("period_status", ["ok", "warning", "critical"]);
export const adjustmentType = pgEnum("adjustment_type", ["desconto", "acrescimo"]);

/**
 * Usuários do sistema — autenticação própria.
 * `passwordHash` guarda o hash (argon2id ou bcrypt), NUNCA a senha.
 * Sessão em cookie httpOnly; não existe cadastro público, só admin cria usuário.
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: text("name"),
  role: userRole("role").default("user").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in", { withTimezone: true }),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** Cadastro de colaboradores. Valores individuais por pessoa. */
export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  code: integer("code").notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  department: varchar("department", { length: 64 }).default("PRODUCAO"),
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }).notNull().default("0.00"),
  dailyRate: numeric("daily_rate", { precision: 10, scale: 2 }).notNull().default("0.00"),
  transportAllowance: numeric("transport_allowance", { precision: 10, scale: 2 })
    .notNull()
    .default("0.00"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = typeof employees.$inferInsert;

/** Lote de importação — um arquivo TXT, um período fechado. */
export const importBatches = pgTable("import_batches", {
  id: serial("id").primaryKey(),
  filename: varchar("filename", { length: 256 }).notNull(),
  storageKey: varchar("storage_key", { length: 512 }),
  periodStart: timestamp("period_start", { mode: "string" }).notNull(),
  periodEnd: timestamp("period_end", { mode: "string" }).notNull(),
  /** true quando o operador confirmou ou ajustou o período sugerido */
  periodConfirmed: boolean("period_confirmed").default(false).notNull(),
  totalRecords: integer("total_records").default(0).notNull(),
  processedEmployees: integer("processed_employees").default(0).notNull(),
  status: batchStatus("status").default("processing").notNull(),
  importedBy: integer("imported_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ImportBatch = typeof importBatches.$inferSelect;
export type InsertImportBatch = typeof importBatches.$inferInsert;

/** Batidas individuais. */
export const timeRecords = pgTable("time_records", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id")
    .notNull()
    .references(() => importBatches.id, { onDelete: "cascade" }),
  employeeCode: integer("employee_code").notNull(),
  employeeName: varchar("employee_name", { length: 128 }).notNull(),
  department: varchar("department", { length: 64 }),
  recordedAt: timestamp("recorded_at", { mode: "string" }).notNull(),
  machineNo: varchar("machine_no", { length: 16 }),
  isManual: boolean("is_manual").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("time_records_batch_emp_idx").on(t.batchId, t.employeeCode, t.recordedAt),
]);

export type TimeRecord = typeof timeRecords.$inferSelect;
export type InsertTimeRecord = typeof timeRecords.$inferInsert;

/** Resumo por colaborador por dia. */
export const dailySummaries = pgTable("daily_summaries", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id")
    .notNull()
    .references(() => importBatches.id, { onDelete: "cascade" }),
  employeeCode: integer("employee_code").notNull(),
  workDate: timestamp("work_date", { mode: "string" }).notNull(),
  recordCount: integer("record_count").default(0).notNull(),
  firstIn: timestamp("first_in", { mode: "string" }),
  lastOut: timestamp("last_out", { mode: "string" }),
  totalMinutes: integer("total_minutes").default(0).notNull(),
  /** dia que efetivamente conta para diária e passagem — ver regra 6.1 */
  countsAsWorkedDay: boolean("counts_as_worked_day").default(false).notNull(),
  hasIssue: boolean("has_issue").default(false).notNull(),
  issueDescription: text("issue_description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("daily_summaries_batch_emp_date_idx").on(t.batchId, t.employeeCode, t.workDate),
]);

export type DailySummary = typeof dailySummaries.$inferSelect;
export type InsertDailySummary = typeof dailySummaries.$inferInsert;

/** Fechamento do período por colaborador. */
export const payrollPeriods = pgTable("payroll_periods", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id")
    .notNull()
    .references(() => importBatches.id, { onDelete: "cascade" }),
  employeeCode: integer("employee_code").notNull(),
  employeeName: varchar("employee_name", { length: 128 }).notNull(),
  periodStart: timestamp("period_start", { mode: "string" }).notNull(),
  periodEnd: timestamp("period_end", { mode: "string" }).notNull(),
  workedDays: integer("worked_days").default(0).notNull(),
  totalMinutes: integer("total_minutes").default(0).notNull(),
  // taxas congeladas no momento do cálculo
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }).default("0.00").notNull(),
  dailyRate: numeric("daily_rate", { precision: 10, scale: 2 }).default("0.00").notNull(),
  transportAllowance: numeric("transport_allowance", { precision: 10, scale: 2 })
    .default("0.00")
    .notNull(),
  // resultados
  totalByHour: numeric("total_by_hour", { precision: 10, scale: 2 }).default("0.00").notNull(),
  totalByDay: numeric("total_by_day", { precision: 10, scale: 2 }).default("0.00").notNull(),
  transportTotal: numeric("transport_total", { precision: 10, scale: 2 })
    .default("0.00")
    .notNull(),
  /** Total por Hora + Total Passagem */
  totalValue: numeric("total_value", { precision: 10, scale: 2 }).default("0.00").notNull(),
  additionsTotal: numeric("additions_total", { precision: 10, scale: 2 })
    .default("0.00")
    .notNull(),
  deductionsTotal: numeric("deductions_total", { precision: 10, scale: 2 })
    .default("0.00")
    .notNull(),
  /** arredondado para cima, ao real inteiro */
  amountToPay: numeric("amount_to_pay", { precision: 10, scale: 2 }).default("0.00").notNull(),
  missingDays: integer("missing_days").default(0).notNull(),
  status: periodStatus("status").default("ok").notNull(),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("payroll_periods_batch_emp_idx").on(t.batchId, t.employeeCode),
]);

export type PayrollPeriod = typeof payrollPeriods.$inferSelect;
export type InsertPayrollPeriod = typeof payrollPeriods.$inferInsert;

/**
 * Descontos e acréscimos lançados dentro de um lote.
 * Sem saldo entre períodos: o que é lançado numa quinzena não passa para a seguinte.
 */
export const periodAdjustments = pgTable("period_adjustments", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id")
    .notNull()
    .references(() => importBatches.id, { onDelete: "cascade" }),
  employeeCode: integer("employee_code").notNull(),
  type: adjustmentType("type").notNull(),
  description: varchar("description", { length: 256 }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("period_adjustments_batch_emp_idx").on(t.batchId, t.employeeCode),
]);

export type PeriodAdjustment = typeof periodAdjustments.$inferSelect;
export type InsertPeriodAdjustment = typeof periodAdjustments.$inferInsert;
