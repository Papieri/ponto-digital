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

**Aplicação com telas.** Cadastro de colaboradores, importação do TXT,
relatório de fechamento com os valores por pessoa, **edição manual das batidas
do dia** e exportação em **Excel** e CSV. `npm run dev` sobe API e telas juntas
em http://127.0.0.1:5173.

**Instalação em outro computador.** A pasta `instalador/` tem um instalador
para Windows: copie o projeto para a outra máquina e rode o `Instalar.bat`.
Ver [`docs/instalar-em-outro-notebook.md`](./docs/instalar-em-outro-notebook.md).

**Marco 1 — apuração portada para Postgres.** Concluído e validado: a
importação reproduz a tabela do `CLAUDE.md` com os números lidos de volta do
banco, em quatro fusos diferentes, e confirmado numa máquina Windows com
PostgreSQL 18 em UTC−3. Relato em
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

Precisa de **Node 22+** e de um **Postgres 16**. No Windows, use o
**PowerShell** — não o CMD, que não tem `cp` e usa outra sintaxe de
continuação de linha. Quem estiver no WSL segue os blocos de Linux.

> Primeira vez, no Windows, e sem nada instalado? Tem um passo a passo do zero
> em [`docs/como-rodar-no-windows.md`](./docs/como-rodar-no-windows.md).

### 1. Postgres local

**Windows (PowerShell)** — tudo numa linha, porque a quebra com `\` é sintaxe
de shell Unix:

```powershell
docker run -d --name ponto-db -e POSTGRES_PASSWORD=devlocal -e POSTGRES_DB=ponto -p 5432:5432 postgres:16
```

**Linux, macOS ou WSL:**

```bash
docker run -d --name ponto-db \
  -e POSTGRES_PASSWORD=devlocal \
  -e POSTGRES_DB=ponto \
  -p 5432:5432 postgres:16
```

O container só precisa ser criado uma vez. Depois é `docker start ponto-db`.

<details>
<summary>Sem Docker</summary>

A migration é Postgres puro, sem recurso de fornecedor: qualquer Postgres 16
serve, basta existir um banco chamado `ponto` alcançável pela `DATABASE_URL`.

**Windows:**

```powershell
winget install PostgreSQL.PostgreSQL.16
& "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres ponto
```

Ajuste o `16` para a versão instalada — qualquer uma da 14 para cima serve.
Use `devlocal` como senha do usuário `postgres` na instalação, que é a do
`.env.example`. O Postgres fica como serviço do Windows e sobe sozinho — não
tem o passo de ligar o banco.

**Debian ou Ubuntu** (é o caminho usado no container onde este projeto foi
validado, quando o registry do Docker está bloqueado):

```bash
pg_ctlcluster 16 main start
su postgres -c "psql -c \"ALTER USER postgres WITH PASSWORD 'devlocal';\""
su postgres -c "createdb ponto"
```

</details>

### 2. Ambiente e dependências

```powershell
cp .env.example .env
npm install
```

No CMD, `cp` não existe — seria `copy .env.example .env`. No PowerShell e no
Linux o comando acima funciona como está.

### 3. Migration

```powershell
npm run db:migrate
```

### 4. Subir a aplicação

```powershell
npm run dev
```

Abra **http://127.0.0.1:5173**. O fluxo é: **Colaboradores** (cadastre com os
valores individuais) → **Importar Ponto** (envie o TXT e confirme o período) →
**Relatório de Fechamento**.

O código do colaborador precisa ser o mesmo do campo "Tra. No." do arquivo do
relógio. Quem não estiver cadastrado apura horas normalmente, mas com valor
zero — a tela de importação avisa quem ficou de fora.

**Esqueceu de bater o ponto?** No relatório, aba *Detalhe diário*, o lápis ao
lado do dia abre as batidas daquela pessoa: dá para incluir a que faltou ou
remover a duplicada. O dia e o fechamento se refazem na hora. O modal mostra
qual batida ficou sem par, que é a que faz as horas saírem a menor.

**PDF.** O botão *Baixar PDF* gera o relatório pronto para imprimir ou enviar à
contabilidade: cartões totalizadores no topo, tabela do fechamento, linha de
totais e rodapé com data de emissão e numeração de página. É gerado no
servidor, não pela impressão do navegador, para sair igual em qualquer máquina.

**Excel.** O botão *Excel* gera uma planilha com a aba de fechamento (colunas na
ordem da especificação, moeda formatada e totais em fórmula) e a aba de detalhe
diário. Os botões de CSV continuam, com separador `;` e vírgula decimal.

> **Ainda não há login.** Enquanto a autenticação própria não existir, o
> servidor escuta só em `127.0.0.1` e não deve ser exposto na rede.

### 5. Conferência pela linha de comando

```powershell
npm test
npm run seed:colaboradores
npm run validar amostras/Registo_de_comparec_.txt
```

O `seed:colaboradores` cadastra taxas de amostra, para os valores saírem do
zero. As barras normais no caminho do arquivo funcionam também no Windows.

`validar` importa o TXT, grava tudo no banco, relê e imprime a tabela. O lote é
descartado ao final para o comando ser repetível. Para inspecionar os dados
depois, mantenha o lote:

```powershell
$env:MANTER_LOTE=1; npm run validar amostras/Registo_de_comparec_.txt
```

```bash
MANTER_LOTE=1 npm run validar amostras/Registo_de_comparec_.txt   # Linux, macOS, WSL
```

---

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe API e telas em http://127.0.0.1:5173 |
| `npm run build` | Gera o frontend em `dist/client` |
| `npm start` | Roda em produção, servindo o frontend já construído |
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
| `docs/como-rodar-no-windows.md` | Passo a passo do zero, para Windows |
| `docs/instalar-em-outro-notebook.md` | Instalar em outra máquina |
| `drizzle/schema.ts` | Schema Postgres |
| `drizzle/migrations/` | Migration + journal do drizzle-kit |
| `src/server/timesheetParser.ts` | Parser e apuração — portado byte a byte |
| `src/server/db.ts` | Acesso ao banco. Nenhum outro módulo consulta direto. |
| `src/server/correcoes.ts` | Correções 6.2, 6.3, 6.4 e o ponto de decisão da 6.1 |
| `src/server/calculo.ts` | Regras de valor e arredondamento |
| `src/server/importarPonto.ts` | Pipeline de importação e o recálculo da 6.5 |
| `src/server/routers.ts` | API tRPC: colaboradores, importação, relatório |
| `src/server/index.ts` | Servidor Express (Vite embutido em desenvolvimento) |
| `src/server/storage/` | Acesso a arquivos atrás de interface, em disco local |
| `src/server/edicaoDia.ts` | Edição manual das batidas e recálculo do dia |
| `src/server/planilha.ts` | Geração do arquivo Excel |
| `src/server/pdf.ts` | Geração do relatório em PDF |
| `src/client/` | Telas: Lotes, Colaboradores, Importar e Relatório |
| `src/client/index.css` | Tipografia e cores. Leia antes de trocar a fonte. |
| `instalador/` | Instalador e atalho para Windows |
| `scripts/validar.ts` | Script do `npm run validar` |
| `amostras/` | TXT do relógio e CSV de fechamento reais |
| `referencia/` | Documentação e código do sistema original. Leitura, não alvo. |

---

## O que ainda não existe

**Autenticação própria** — é a lacuna que importa. A especificação prevê e-mail
e senha com hash e sessão em cookie httpOnly, e o schema já tem a tabela
`users`, mas nada disso foi construído. Enquanto isso, rode só em localhost.

Falta também o **CRUD de ajustes do período** (descontos e acréscimos): o
cálculo já lê `period_adjustments` e já soma na conta, então falta só a tela.

A correção **6.1** continua bloqueada por decisão de negócio, e a 6.3 tornou o
caso menos visível — ver o alerta em
[`docs/correcoes-secao-6.md`](./docs/correcoes-secao-6.md).

Duas decisões de schema em aberto, ambas descritas no mesmo documento: um campo
explícito para o dia truncado (6.3) e um estado "lote fechado" (6.4). Nenhuma
migration foi criada por conta própria.
