CREATE TYPE "public"."adjustment_type" AS ENUM('desconto', 'acrescimo');--> statement-breakpoint
CREATE TYPE "public"."batch_status" AS ENUM('processing', 'completed', 'error');--> statement-breakpoint
CREATE TYPE "public"."period_status" AS ENUM('ok', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "daily_summaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"employee_code" integer NOT NULL,
	"work_date" timestamp NOT NULL,
	"record_count" integer DEFAULT 0 NOT NULL,
	"first_in" timestamp,
	"last_out" timestamp,
	"total_minutes" integer DEFAULT 0 NOT NULL,
	"counts_as_worked_day" boolean DEFAULT false NOT NULL,
	"has_issue" boolean DEFAULT false NOT NULL,
	"issue_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	"department" varchar(64) DEFAULT 'PRODUCAO',
	"hourly_rate" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"daily_rate" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"transport_allowance" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" varchar(256) NOT NULL,
	"storage_key" varchar(512),
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"period_confirmed" boolean DEFAULT false NOT NULL,
	"total_records" integer DEFAULT 0 NOT NULL,
	"processed_employees" integer DEFAULT 0 NOT NULL,
	"status" "batch_status" DEFAULT 'processing' NOT NULL,
	"imported_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"employee_code" integer NOT NULL,
	"employee_name" varchar(128) NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"worked_days" integer DEFAULT 0 NOT NULL,
	"total_minutes" integer DEFAULT 0 NOT NULL,
	"hourly_rate" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"daily_rate" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"transport_allowance" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"total_by_hour" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"total_by_day" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"transport_total" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"total_value" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"additions_total" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"deductions_total" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"amount_to_pay" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"missing_days" integer DEFAULT 0 NOT NULL,
	"status" "period_status" DEFAULT 'ok' NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "period_adjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"employee_code" integer NOT NULL,
	"type" "adjustment_type" NOT NULL,
	"description" varchar(256),
	"amount" numeric(10, 2) NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"employee_code" integer NOT NULL,
	"employee_name" varchar(128) NOT NULL,
	"department" varchar(64),
	"recorded_at" timestamp NOT NULL,
	"machine_no" varchar(16),
	"is_manual" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"name" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_signed_in" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "daily_summaries" ADD CONSTRAINT "daily_summaries_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_adjustments" ADD CONSTRAINT "period_adjustments_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_adjustments" ADD CONSTRAINT "period_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_records" ADD CONSTRAINT "time_records_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_summaries_batch_emp_date_idx" ON "daily_summaries" USING btree ("batch_id","employee_code","work_date");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_periods_batch_emp_idx" ON "payroll_periods" USING btree ("batch_id","employee_code");--> statement-breakpoint
CREATE INDEX "period_adjustments_batch_emp_idx" ON "period_adjustments" USING btree ("batch_id","employee_code");--> statement-breakpoint
CREATE INDEX "time_records_batch_emp_idx" ON "time_records" USING btree ("batch_id","employee_code","recorded_at");