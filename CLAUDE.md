# Ponto Digital — Papieri

Fechamento quinzenal de horas de freelancers da produção. Importa o TXT do relógio de
ponto, apura horas por pessoa e por dia, permite corrigir batidas e lançar descontos e
acréscimos, e gera o relatório de pagamento.

**Porte real:** 6 a 8 colaboradores, um arquivo por quinzena. Não otimize para escala.

---

## Este projeto é uma PORTABILIDADE, não um projeto novo

Existe um sistema funcionando hoje na plataforma Manus. O objetivo é tirá-lo de lá e
rodá-lo em infraestrutura própria, preservando a lógica que já está validada em produção.

**Não reescreva o que já funciona.** Em especial o `timesheetParser.ts`: ele tem regras
de negócio descobertas na prática, custou várias rodadas de correção e tem 15 testes
unitários. Portar significa mudar banco, autenticação e storage — não repensar apuração.

O código original está em `referencia/codigo-fonte/`. É leitura obrigatória antes de
escrever qualquer coisa equivalente.

---

## Comece por aqui

Ambiente local, sem conta em lugar nenhum:

```bash
docker run -d --name ponto-db \
  -e POSTGRES_PASSWORD=devlocal \
  -e POSTGRES_DB=ponto \
  -p 5432:5432 postgres:16

# .env
DATABASE_URL=postgres://postgres:devlocal@localhost:5432/ponto
UPLOAD_DIR=./uploads
SESSION_SECRET=qualquer-coisa-longa-em-dev
```

Aplique a migration de `drizzle/migrations/`, importe o TXT de `amostras/` e confira os
números contra a tabela de validação mais abaixo. Esse é o primeiro marco: se bater,
a apuração sobreviveu à troca de banco.

A ida para produção é `pg_dump` e `pg_restore` — com este volume de dados, segundos.
**Não escolha o host de produção agora**; isso não bloqueia nada.

---

## Mapa

| Caminho | Conteúdo |
|---|---|
| `docs/ponto_digital_especificacao.md` | Especificação completa. Consulte antes de decidir qualquer regra. |
| `referencia/` | Documentação e código do sistema original (Manus). Não é o código-alvo. |
| `drizzle/schema.ts` | Schema Postgres já convertido e validado |
| `drizzle/migrations/` | Migration gerada pelo drizzle-kit |
| `amostras/` | TXT do relógio e CSV de fechamento reais, para validação |

---

## Regras invioláveis

### 1. Fuso horário é UTC puro, em toda a pilha

Todos os horários de ponto são gravados exatamente como vêm do arquivo TXT, tratados
como UTC. O servidor **nunca** converte fuso — usa sempre `getUTCHours()`, `getUTCMinutes()`
e afins. O frontend interpreta as strings adicionando `Z` antes de criar `Date`, e exibe
com `{ timeZone: "UTC" }`.

Isso **parece** um bug e não é. Três bugs de "+3h" no sistema original vieram de tentar
ser esperto aqui. Os campos de ponto no schema são `timestamp` sem timezone, em modo
string, de propósito. Não troque para `withTimezone: true`.

### 2. O campo entrada/saída do TXT é ignorado

O relógio grava `I`/`O` de forma inconsistente. A apuração ordena os registros do dia por
horário e pareia em sequência: 1º→2º, 3º→4º. Isso é deliberado e mais robusto.

### 3. Não invente regra de cálculo

As regras foram deduzidas de um fechamento real e conferidas linha a linha. Se algo não
estiver na especificação, pergunte — não deduza.

---

## Stack alvo

| Camada | Tecnologia |
|---|---|
| Frontend | React 19, Vite, Tailwind, shadcn/ui, wouter, TanStack Query |
| Backend | Node 22, Express, tRPC 11, Zod |
| ORM | Drizzle (`drizzle-orm/pg-core` + driver `postgres`) |
| Banco | Postgres — local no desenvolvimento, host de produção a definir |
| Auth | Própria: e-mail e senha, hash argon2id ou bcrypt, sessão em cookie httpOnly |
| Arquivos | Pasta local, caminho vindo de variável de ambiente |
| Execução | Container Node em execução contínua (não serverless) |

O backup do sistema original **não inclui** o scaffolding da plataforma: `server/_core/*`,
o entrypoint Express, o módulo de autenticação, os componentes `ui/`, `lib/trpc`,
`lib/utils` e o `index.html`. Essa parte precisa ser escrita do zero — e é justamente a
que era amarrada ao Manus.

**Abstraia o acesso a arquivos atrás de uma interface** (`salvar`, `ler`, `apagar`), com
implementação em disco local. Trocar por storage remoto depois deve ser escrever outra
implementação, não caçar `fs.writeFile` espalhado pelo código.

---

## Regras de cálculo (resumo)

```
Total por Hora  = horas decimais x Valor/hora
Total por Dia   = dias trabalhados x Valor/dia     <- REFERÊNCIA, não entra no pagamento
Total Passagem  = dias trabalhados x Passagem/dia
Valor Total     = Total por Hora + Total Passagem
VALOR A PAGAR   = ARREDONDAR PARA CIMA (Valor Total + Acréscimos - Descontos)
```

Arredondamento **sempre para cima**, ao real inteiro. Verificado contra o fechamento real:
1937,28 vira 1938 · 1620,08 vira 1621 · 1887,33 vira 1888.

Valor/hora, valor/dia e passagem são **individuais por colaborador**. Nos dados atuais o
valor/hora equivale à diária dividida por 9, mas isso é coincidência de configuração — não
derive um do outro.

Ajustes (descontos e acréscimos) vivem dentro do lote e **não atravessam períodos**. Não
existe saldo rolante, parcelamento nem vale a descontar em quinzenas futuras.

Status: 0 dias com problema = OK · 1 a 2 = Aviso · 3 ou mais = Crítico.

---

## Correções obrigatórias

Detalhes na seção 6 da especificação. Resumo:

1. **Dia sem horas conta como dia trabalhado** — hoje um dia com uma batida só apura zero
   hora e mesmo assim paga diária e passagem. O schema já tem `counts_as_worked_day` para
   isso. **A regra ainda não foi definida — pergunte antes de implementar.**
2. **Período editável na importação** — hoje vem do menor/maior registro do arquivo, sem
   confirmação. Campo `period_confirmed` já existe no schema.
3. **Último dia do export truncado** gera alarme falso de batida faltando.
4. **Dia com batidas ímpares subestima o valor** — o pareamento descarta a batida sem par,
   e o relatório sai com menos horas do que a pessoa trabalhou.
5. **Botão "Recalcular valores"** — as taxas são congeladas na importação; alterar o
   cadastro depois não muda o relatório, e reimportar apaga as correções manuais.

---

## Como validar

Em `amostras/` há material real de produção:

**`Registo_de_comparec_.txt`** — 122 registros, 17 a 24/08/2026. O parser original produz:

| Cód | Nome | Dias | Total | Dias c/ problema |
|---|---|---|---|---|
| 3 | Elaine | 6 | 45:42 | 1 |
| 4 | Raquel | 6 | 42:08 | 2 |
| 5 | Skarlat | 5 | 45:34 | 0 |
| 6 | Jucelaine Paes | 5 | 43:41 | 0 |
| 8 | Maria Izadora | 6 | 55:46 | 0 |
| 22 | Ketlen Dias | 5 | 38:18 | 1 |

Qualquer divergência aqui depois da migração significa que o tratamento de fuso quebrou.
Confira antes de seguir.

**`fechamento_15-07-2026_31-07-2026.csv`** — saída real do sistema antigo, com as colunas
manuais já preenchidas. Serve para validar as contas de dinheiro e o arredondamento.

**Nenhuma amostra tem turno cruzando a meia-noite.** A lógica de turno noturno (registros
entre 00:00 e 05:29 herdados pelo dia anterior, quando o dia anterior tem número ímpar de
registros) não está coberta por dado real. Os testes unitários cobrem; dado de produção,
não. Trate com cuidado.

---

## Exportação CSV

Separador `;`, UTF-8 com BOM, vírgula decimal — abre direto no Excel em português.

```
Código; Nome; Dias Trabalhados; Total Horas; Valor/Hora Base; Total por Hora;
Valor/Dia Base; Total por Dia; Passagem/Dia; Total Passagem; Valor Total;
Acréscimos; Descontos; VALOR A PAGAR; Dias c/ Problema; Status
```

---

## Decisões já tomadas — não reabrir

- **Autenticação própria**, não de fornecedor. O banco é trocável; o Auth de plataforma
  é o que amarra de verdade. São 3 ou 4 usuários internos — senha com hash e sessão em
  cookie resolve, sem dependência de conta externa.
- **Postgres puro, sem recurso proprietário.** Nada de RLS, funções de plataforma ou
  extensão específica de fornecedor: o mesmo banco tem que subir em Docker local, em
  servidor da empresa ou em serviço gerenciado, sem alteração.
- **Container contínuo** em vez de serverless: o app é um Express monolítico e a
  importação insere milhares de linhas de uma vez.
- **Sem hora extra, jornada, DSR ou adicional noturno.** São freelancers; não é folha CLT.
- **Chaves estrangeiras reais com `ON DELETE CASCADE`** no lugar da cascata manual em
  código, que existia por limitação do TiDB.
- **Aplicação e banco na mesma região.** Cada tela faz várias consultas; latência entre
  continentes é percebida pelo operador.

---

## Pendências que dependem do Henrique

Não decida sozinho:

1. Regra do dia sem horas apuradas (correção 1).
2. Confirmar que "Total por Dia" é apenas referência.
3. Onde banco e aplicação vão rodar em produção (não bloqueia o desenvolvimento).
4. Arquivo de teste com turno cruzando a meia-noite.

---

## Convenções

- Banco em `snake_case`, TypeScript em `camelCase` — o Drizzle faz o mapeamento no schema.
- Todo acesso ao banco passa por `db.ts`. Nenhum router consulta direto.
- O parser é composto de funções puras, sem dependência de banco, para poder ser testado
  isoladamente. Mantenha assim.
- Testes com Vitest. Rode-os antes de dar qualquer coisa por pronta.
