# Ponto Digital — Papieri

Fechamento quinzenal de horas de freelancers da produção. Este repositório é a
**portabilidade** do sistema que roda hoje na plataforma Manus para
infraestrutura própria — MySQL/TiDB sai, Postgres entra.

> Antes de escrever qualquer código, leia [`CLAUDE.md`](./CLAUDE.md) e
> [`docs/ponto_digital_especificacao.md`](./docs/ponto_digital_especificacao.md).
> A lógica de apuração já está validada em produção e **não deve ser
> reescrita**.

---

## Estado atual: marco 1 concluído

O marco 1 tem um único objetivo — provar que a apuração sobrevive à troca de
banco. Sem interface, sem login, sem deploy.

`npm run validar amostras/Registo_de_comparec_.txt` reproduz exatamente a
tabela de validação do `CLAUDE.md`, com os números lidos de volta do Postgres:

| Cód | Nome | Dias | Total | Dias c/ problema |
|---|---|---|---|---|
| 3 | Elaine | 6 | 45:42 | 1 |
| 4 | Raquel | 6 | 42:08 | 2 |
| 5 | Skarlat | 5 | 45:34 | 0 |
| 6 | Jucelaine Paes | 5 | 43:41 | 0 |
| 8 | Maria Izadora | 6 | 55:46 | 0 |
| 22 | Ketlen Dias | 5 | 38:18 | 1 |

O relato completo da validação, incluindo o que quase quebrou, está em
[`docs/marco-1-validacao.md`](./docs/marco-1-validacao.md).

---

## Como rodar

### 1. Postgres local

```bash
docker run -d --name ponto-db \
  -e POSTGRES_PASSWORD=devlocal \
  -e POSTGRES_DB=ponto \
  -p 5432:5432 postgres:16
```

Sem Docker, um Postgres 16 nativo serve igual — a migration é Postgres puro,
sem recurso de fornecedor:

```bash
pg_ctlcluster 16 main start
su postgres -c "psql -c \"ALTER USER postgres WITH PASSWORD 'devlocal';\""
su postgres -c "createdb ponto"
```

### 2. Ambiente e dependências

```bash
cp .env.example .env
npm install
```

### 3. Migration

```bash
npm run db:migrate
```

### 4. Testes e validação

```bash
npm test
npm run validar amostras/Registo_de_comparec_.txt
```

`validar` importa o TXT, grava tudo no banco, relê e imprime a tabela. O lote é
descartado ao final para o comando ser repetível — use `MANTER_LOTE=1` para
inspecionar os dados depois.

---

## Scripts

| Comando | O que faz |
|---|---|
| `npm test` | Vitest. Os testes de banco são ignorados sem `DATABASE_URL`. |
| `npm run check` | `tsc --noEmit` |
| `npm run db:generate` | Gera migration a partir de `drizzle/schema.ts` |
| `npm run db:migrate` | Aplica as migrations pendentes |
| `npm run validar <txt>` | Importa um TXT e imprime a apuração lida do banco |

---

## Mapa do repositório

| Caminho | Conteúdo |
|---|---|
| `CLAUDE.md` | Regras invioláveis, decisões tomadas, tabela de validação |
| `docs/ponto_digital_especificacao.md` | Especificação completa |
| `docs/marco-1-validacao.md` | Relato da validação do marco 1 |
| `drizzle/schema.ts` | Schema Postgres |
| `drizzle/migrations/` | Migration + journal do drizzle-kit |
| `src/server/timesheetParser.ts` | Parser e apuração — portado byte a byte |
| `src/server/db.ts` | Acesso ao banco. Nenhum outro módulo consulta direto. |
| `src/server/importarPonto.ts` | Pipeline de importação |
| `scripts/validar.ts` | Script do `npm run validar` |
| `amostras/` | TXT do relógio e CSV de fechamento reais |
| `referencia/` | Documentação e código do sistema original. Leitura, não alvo. |

---

## O que ainda não existe

Deliberadamente fora do marco 1: telas, autenticação, storage de arquivos,
ajustes de período, exportação CSV e as **cinco correções obrigatórias** da
seção 6 da especificação. As colunas que as suportam (`counts_as_worked_day`,
`period_confirmed`) já existem no schema e permanecem no valor padrão.

A correção 6.1 continua bloqueada por decisão de negócio — ver "Pendências que
dependem do Henrique" no `CLAUDE.md`.
