CREATE TABLE `daily_summaries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` int NOT NULL,
	`employeeCode` int NOT NULL,
	`workDate` timestamp NOT NULL,
	`recordCount` int DEFAULT 0,
	`firstIn` timestamp,
	`lastOut` timestamp,
	`totalMinutes` int DEFAULT 0,
	`hasIssue` boolean NOT NULL DEFAULT false,
	`issueDescription` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `daily_summaries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`department` varchar(64) DEFAULT 'PRODUCAO',
	`hourlyRate` decimal(10,2) NOT NULL DEFAULT '0.00',
	`dailyRate` decimal(10,2) NOT NULL DEFAULT '0.00',
	`transportAllowance` decimal(10,2) DEFAULT '0.00',
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`),
	CONSTRAINT `employees_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`filename` varchar(256) NOT NULL,
	`s3Key` varchar(512),
	`s3Url` text,
	`periodStart` timestamp NOT NULL,
	`periodEnd` timestamp NOT NULL,
	`totalRecords` int DEFAULT 0,
	`processedEmployees` int DEFAULT 0,
	`status` enum('processing','completed','error') NOT NULL DEFAULT 'processing',
	`importedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `import_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payroll_periods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` int NOT NULL,
	`employeeCode` int NOT NULL,
	`employeeName` varchar(128) NOT NULL,
	`periodStart` timestamp NOT NULL,
	`periodEnd` timestamp NOT NULL,
	`workedDays` int DEFAULT 0,
	`totalMinutes` int DEFAULT 0,
	`hourlyRate` decimal(10,2) DEFAULT '0.00',
	`dailyRate` decimal(10,2) DEFAULT '0.00',
	`transportAllowance` decimal(10,2) DEFAULT '0.00',
	`totalByHour` decimal(10,2) DEFAULT '0.00',
	`totalByDay` decimal(10,2) DEFAULT '0.00',
	`transportTotal` decimal(10,2) DEFAULT '0.00',
	`missingDays` int DEFAULT 0,
	`status` enum('ok','warning','critical') NOT NULL DEFAULT 'ok',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payroll_periods_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `time_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` int NOT NULL,
	`employeeCode` int NOT NULL,
	`employeeName` varchar(128) NOT NULL,
	`department` varchar(64),
	`recordedAt` timestamp NOT NULL,
	`machineNo` varchar(16),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `time_records_id` PRIMARY KEY(`id`)
);
