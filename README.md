# Ponto Digital — Papieri

Fechamento quinzenal de horas de freelancers da produção. Este repositório é a
**portabilidade** do sistema que roda hoje na plataforma Manus para
infraestrutura própria — MySQL/TiDB sai, Postgres entra.

> Antes de escrever qualquer código, leia [`CLAUDE.md`](./CLAUDE.md) e
> [`docs/ponto_digital_especificacao.md`](./docs/ponto_digital_especificacao.md).
> A lógica de apuração já está validada em produção e **não deve ser
> reescrita**.

---

## Estado atual

**Marco 1 — apuração portada para Postgres.** Concluído e validado: a
importação reproduz a tabela do `CLAUDE.md` com os números lidos de volta do
banco, em quatro fusos diferentes. Relato em
[`docs/marco-1-validacao.md`](./docs/marco-1-validacao.md).

**Correções da seção 6 — 6.2, 6.3, 6.4 e 6.5.** Implementadas como camada
aditiva, com o parser portado intacto. Relato em
[`docs/correcoes-secao-6.md`](./docs/correcoes-secao-6.md).

A **6.1 não foi implementada**: a regra do dia sem horas apuradas continua
indefinida. `counts_as_worked_day` é gravado com o comportamento atual, a
partir de um ponto de decisão único e documentado.

Saída atual de `npm run validar amostras/Registo_de_comparec_.txt`:

| Cód | Nome | Dias | Total | Dias c/ problema | Status |
|---|---|---|---|---|---|
| 3 | Elaine | 6 | 45:42 | 0 | OK |
| 4 | Raquel | 6 | 42:08 | 1 | Aviso |
| 5 | Skarlat | 5 | 45:34 | 0 | OK |
| 6 | Jucelaine Paes | 5 | 43:41 | 0 | OK |
| 8 | Maria Izadora | 6 | 55:46 | 0 | OK |
| 22 | Ketlen Dias | 5 | 38:18 | 0 | OK |

> A coluna "Dias c/ problema" difere da tabela do `CLAUDE.md` por causa da
> correção 6.3 — o último dia do arquivo deixou de gerar alarme falso. Dias e
> horas não mudaram. Ver o relato das correções.

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
npm run seed:colaboradores   # taxas de amostra, para os valores saírem do zero
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
| `npm run seed:colaboradores` | Cadastra as taxas de amostra (fixture de desenvolvimento) |
| `npm run validar <txt>` | Importa um TXT e imprime a apuração lida do banco |

---

## Mapa do repositório

| Caminho | Conteúdo |
|---|---|
| `CLAUDE.md` | Regras invioláveis, decisões tomadas, tabela de validação |
| `docs/ponto_digital_especificacao.md` | Especificação completa |
| `docs/marco-1-validacao.md` | Relato da validação do marco 1 |
| `docs/correcoes-secao-6.md` | Relato das correções da seção 6 |
| `drizzle/schema.ts` | Schema Postgres |
| `drizzle/migrations/` | Migration + journal do drizzle-kit |
| `src/server/timesheetParser.ts` | Parser e apuração — portado byte a byte |
| `src/server/db.ts` | Acesso ao banco. Nenhum outro módulo consulta direto. |
| `src/server/correcoes.ts` | Correções 6.2, 6.3, 6.4 e o ponto de decisão da 6.1 |
| `src/server/calculo.ts` | Regras de valor e arredondamento |
| `src/server/importarPonto.ts` | Pipeline de importação e o recálculo da 6.5 |
| `scripts/validar.ts` | Script do `npm run validar` |
| `amostras/` | TXT do relógio e CSV de fechamento reais |
| `referencia/` | Documentação e código do sistema original. Leitura, não alvo. |

---

## O que ainda não existe

Telas, autenticação própria, storage de arquivos, o CRUD de ajustes do período
e a exportação CSV no formato novo. O cálculo já consome `period_adjustments`,
então o CRUD é só a interface.

A correção **6.1** continua bloqueada por decisão de negócio, e a 6.3 tornou o
caso menos visível — ver o alerta em
[`docs/correcoes-secao-6.md`](./docs/correcoes-secao-6.md).

Duas decisões de schema em aberto, ambas descritas no mesmo documento: um campo
explícito para o dia truncado (6.3) e um estado "lote fechado" (6.4). Nenhuma
migration foi criada por conta própria.
