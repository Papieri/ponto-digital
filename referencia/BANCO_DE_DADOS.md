# Banco de Dados

## Tecnologia

O banco de dados utiliza **MySQL** (compatível com TiDB), gerenciado pela plataforma Manus. O acesso é feito via **Drizzle ORM** com o driver `mysql2`. A string de conexão é injetada automaticamente via variável de ambiente `DATABASE_URL`.

---

## Modelo de Dados

O diagrama abaixo representa os relacionamentos entre as tabelas:

```
users
  └── (sem FK direta; importedBy em import_batches referencia users.id)

employees
  └── code (único) ← referenciado por time_records, daily_summaries, payroll_periods

import_batches
  ├── id ← referenciado por time_records.batchId
  ├── id ← referenciado por daily_summaries.batchId
  └── id ← referenciado por payroll_periods.batchId

time_records
  ├── batchId → import_batches.id (exclusão em cascata via código)
  └── employeeCode → employees.code (sem FK formal)

daily_summaries
  ├── batchId → import_batches.id (exclusão em cascata via código)
  └── employeeCode → employees.code (sem FK formal)

payroll_periods
  ├── batchId → import_batches.id (exclusão em cascata via código)
  └── employeeCode → employees.code (sem FK formal)
```

> **Nota:** As chaves estrangeiras não são enforçadas no banco (sem `FOREIGN KEY` declarada no schema Drizzle). A integridade referencial é garantida pela aplicação, especialmente na exclusão de lotes (`deleteBatch` no `routers.ts`).

---

## Tabelas

### `users`

Gerenciada pela plataforma Manus. Armazena os usuários autenticados via OAuth.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | INT AUTO_INCREMENT PK | Identificador interno |
| `openId` | VARCHAR(128) UNIQUE | ID do usuário na plataforma Manus |
| `name` | VARCHAR(128) | Nome do usuário |
| `role` | ENUM('admin','user') | Papel do usuário |
| `createdAt` | TIMESTAMP | Data de criação |
| `updatedAt` | TIMESTAMP | Data de atualização |

---

### `employees`

Cadastro de funcionários com suas taxas de remuneração.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | INT AUTO_INCREMENT PK | Identificador interno |
| `code` | INT UNIQUE NOT NULL | Código do funcionário (campo "Tra. No." do TXT) |
| `name` | VARCHAR(128) NOT NULL | Nome completo |
| `department` | VARCHAR(64) DEFAULT 'PRODUCAO' | Departamento |
| `hourlyRate` | DECIMAL(10,2) DEFAULT 0.00 | Valor por hora trabalhada (R$) |
| `dailyRate` | DECIMAL(10,2) DEFAULT 0.00 | Valor por dia trabalhado (R$) |
| `transportAllowance` | DECIMAL(10,2) DEFAULT 0.00 | Vale-transporte diário (R$) |
| `active` | BOOLEAN DEFAULT true | Se o funcionário está ativo |
| `createdAt` | TIMESTAMP | Data de criação |
| `updatedAt` | TIMESTAMP ON UPDATE | Data de atualização |

**Regra de negócio:** O campo `code` é o identificador de negócio que liga o funcionário aos registros de ponto. Ao importar um arquivo TXT, o parser usa o `code` para buscar as taxas do funcionário e calcular os valores financeiros.

---

### `import_batches`

Representa cada arquivo TXT importado. É o "lote" que agrupa todos os dados de uma importação.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | INT AUTO_INCREMENT PK | Identificador do lote |
| `filename` | VARCHAR(256) NOT NULL | Nome original do arquivo |
| `s3Key` | VARCHAR(512) | Chave do arquivo no S3 |
| `s3Url` | TEXT | URL pública do arquivo no S3 |
| `periodStart` | TIMESTAMP (string) NOT NULL | Início do período do lote |
| `periodEnd` | TIMESTAMP (string) NOT NULL | Fim do período do lote |
| `totalRecords` | INT DEFAULT 0 | Total de registros de ponto importados |
| `processedEmployees` | INT DEFAULT 0 | Quantidade de funcionários no lote |
| `status` | ENUM('processing','completed','error') | Status do processamento |
| `importedBy` | INT | ID do usuário que importou |
| `createdAt` | TIMESTAMP | Data de criação |

**Exclusão em cascata:** Ao deletar um lote, o código em `routers.ts` (`deleteImportBatch`) remove em cascata todos os `time_records`, `daily_summaries` e `payroll_periods` com o mesmo `batchId`.

---

### `time_records`

Registros individuais de ponto (cada batida no relógio).

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | INT AUTO_INCREMENT PK | Identificador do registro |
| `batchId` | INT NOT NULL | Lote de importação |
| `employeeCode` | INT NOT NULL | Código do funcionário |
| `employeeName` | VARCHAR(128) NOT NULL | Nome do funcionário (desnormalizado) |
| `department` | VARCHAR(64) | Departamento |
| `recordedAt` | TIMESTAMP (string) NOT NULL | Data e hora da batida (UTC, sem timezone) |
| `machineNo` | VARCHAR(16) | Número da máquina/relógio |
| `isManual` | BOOLEAN DEFAULT false | Se foi inserido manualmente pelo usuário |
| `createdAt` | TIMESTAMP | Data de criação |

**Formato de `recordedAt`:** Armazenado como string MySQL `YYYY-MM-DD HH:MM:SS` sem indicação de timezone. Todos os valores são UTC. O frontend usa a função `toUtcDate()` para interpretar corretamente.

---

### `daily_summaries`

Resumo calculado por funcionário por dia de trabalho.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | INT AUTO_INCREMENT PK | Identificador |
| `batchId` | INT NOT NULL | Lote de importação |
| `employeeCode` | INT NOT NULL | Código do funcionário |
| `workDate` | TIMESTAMP (string) NOT NULL | Data do dia de trabalho |
| `recordCount` | INT DEFAULT 0 | Quantidade de batidas no dia |
| `firstIn` | TIMESTAMP (string) | Primeira entrada do dia |
| `lastOut` | TIMESTAMP (string) | Última saída do dia |
| `totalMinutes` | INT DEFAULT 0 | Total de minutos trabalhados no dia |
| `hasIssue` | BOOLEAN DEFAULT false | Se há problema no dia (batidas ímpares, etc.) |
| `issueDescription` | TEXT | Descrição do problema |
| `createdAt` | TIMESTAMP | Data de criação |

---

### `payroll_periods`

Período de fechamento quinzenal por funcionário por lote.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | INT AUTO_INCREMENT PK | Identificador |
| `batchId` | INT NOT NULL | Lote de importação |
| `employeeCode` | INT NOT NULL | Código do funcionário |
| `employeeName` | VARCHAR(128) NOT NULL | Nome do funcionário |
| `periodStart` | TIMESTAMP (string) NOT NULL | Início do período |
| `periodEnd` | TIMESTAMP (string) NOT NULL | Fim do período |
| `workedDays` | INT DEFAULT 0 | Dias trabalhados no período |
| `totalMinutes` | INT DEFAULT 0 | Total de minutos no período |
| `hourlyRate` | DECIMAL(10,2) | Taxa horária usada no cálculo |
| `dailyRate` | DECIMAL(10,2) | Taxa diária usada no cálculo |
| `transportAllowance` | DECIMAL(10,2) | Vale-transporte diário |
| `totalByHour` | DECIMAL(10,2) | Total a pagar por hora (totalMinutes/60 × hourlyRate) |
| `totalByDay` | DECIMAL(10,2) | Total a pagar por dia (workedDays × dailyRate) |
| `transportTotal` | DECIMAL(10,2) | Total de vale-transporte (workedDays × transportAllowance) |
| `missingDays` | INT DEFAULT 0 | Dias com problemas de registro |
| `status` | ENUM('ok','warning','critical') | Status do funcionário no período |
| `createdAt` | TIMESTAMP | Data de criação |

**Regras de status:**
- `ok`: zero dias com problemas
- `warning`: 1 ou 2 dias com problemas
- `critical`: 3 ou mais dias com problemas

---

## Migrations

As migrations são gerenciadas pelo Drizzle Kit e aplicadas com `pnpm db:push` (que executa `drizzle-kit generate && drizzle-kit migrate`).

| Arquivo | Conteúdo |
|---|---|
| `0000_lethal_galactus.sql` | Criação das tabelas `users` e `employees` |
| `0001_daily_luminals.sql` | Criação de `import_batches`, `time_records`, `daily_summaries`, `payroll_periods` |
| `0002_burly_old_lace.sql` | Adição da coluna `isManual` em `time_records` |

---

## Convenções de Acesso

Todas as queries e mutations estão centralizadas em `server/db.ts`. Nenhum componente de rota (`routers.ts`) acessa o banco diretamente — sempre via funções exportadas de `db.ts`. Isso facilita testes e manutenção.
