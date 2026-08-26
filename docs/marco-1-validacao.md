# Marco 1 — validação da troca de MySQL para Postgres

**Data:** agosto de 2026
**Escopo:** provar que a apuração sobrevive à troca de banco. Sem interface,
sem login, sem deploy.

---

## Resultado

`npm run validar amostras/Registo_de_comparec_.txt` reproduz **exatamente** as
seis linhas da tabela de validação do `CLAUDE.md`:

```
Arquivo   : amostras/Registo_de_comparec_.txt
Lote      : #1
Período   : 2026-08-17 00:00:00 a 2026-08-24 23:59:59 (UTC)
Registros : 122

| Cód | Nome           | Dias | Total | Dias c/ problema |
|-----|----------------|------|-------|------------------|
| 3   | Elaine         |    6 | 45:42 |                1 |
| 4   | Raquel         |    6 | 42:08 |                2 |
| 5   | Skarlat        |    5 | 45:34 |                0 |
| 6   | Jucelaine Paes |    5 | 43:41 |                0 |
| 8   | Maria Izadora  |    6 | 55:46 |                0 |
| 22  | Ketlen Dias    |    5 | 38:18 |                1 |

Batidas gravadas e relidas sem deslocamento: sim (122 registros)
Apuração refeita a partir do banco: idêntica (33 dias apurados)
```

Nenhum número divergiu. Nenhuma regra do parser foi alterada.

### Por que a tabela vem do banco

A tabela **não** é impressa a partir do parse em memória — isso não provaria
nada sobre a troca de banco. Ela sai de `payroll_periods`, lida de volta do
Postgres. Em seguida o script refaz a apuração a partir das batidas relidas de
`time_records` e compara os dois caminhos. Um deslocamento de fuso em qualquer
ponto da ida ou da volta aparece como divergência.

### Rodado fora do UTC

O ambiente de desenvolvimento roda em UTC, onde um bug de fuso é invisível. A
validação foi repetida em três fusos, com resultado idêntico:

| Fuso do processo | Offset | Resultado |
|---|---|---|
| `UTC` | +00 | as seis linhas |
| `America/Sao_Paulo` | −03 | as seis linhas |
| `Asia/Tokyo` | +09 | as seis linhas |
| `Pacific/Kiritimati` | +14 | as seis linhas |

---

## O que quase quebrou: o driver, não o ORM

O `CLAUDE.md` avisa que três bugs de "+3h" no sistema original vieram de tentar
ser esperto com fuso. Na migração o risco reapareceu **em uma camada nova**.

O driver `postgres` converte, por padrão, `timestamp without time zone`
(OID 1114) em um `Date` construído no **fuso local do processo**. O modo string
do Drizzle não protege contra isso: ele repassa o que o driver entregou.

Medido diretamente:

| TZ do processo | Sem proteção | Com proteção |
|---|---|---|
| `UTC` | `Date` — `Mon Aug 17 2026 06:35:35 GMT+0000` | `"2026-08-17 06:35:35"` |
| `America/Sao_Paulo` | `Date` — `Mon Aug 17 2026 06:35:35 GMT-0300` | `"2026-08-17 06:35:35"` |
| `Asia/Tokyo` | `Date` — `Mon Aug 17 2026 06:35:35 GMT+0900` | `"2026-08-17 06:35:35"` |

Rodando em São Paulo, a batida das 06:35 vira um instante cujo `getUTCHours()`
é **9**. É o mesmo bug de "+3h" de antes, entrando por uma porta diferente — e
teria passado despercebido num servidor em UTC.

**Proteção:** `getDb()` em `src/server/db.ts` sobrescreve o parser do OID 1114
para devolver a string crua do banco, sem interpretação, e fixa a sessão em
UTC. `src/server/db.fuso.test.ts` trava esse comportamento: remover a
sobrescrita quebra o build.

---

## Divergências entre o handoff e o código

Duas coisas encontradas na leitura do material original. Nenhuma delas afeta os
números acima.

### 1. O arquivo de testes estava desatualizado em relação ao parser

`referencia/codigo-fonte/timesheetParser.test.ts` foi escrito contra uma versão
anterior da API:

| Função | Teste esperava | Parser entrega |
|---|---|---|
| `detectPeriod` | `{ periodStart: Date, ... }` | `'YYYY-MM-DD HH:MM:SS'` |
| `recalcFromTimestamps` | `Date[]` | `string[]` |

Portado sem alteração, o arquivo dá **5 falhas em 27 testes**, todas com
`TypeError` de tipo trocado — não de regra de negócio.

O parser é a fonte de verdade: `routers.ts`, o chamador em produção, usa a API
de string. O arquivo de testes é que ficou para trás, provavelmente quando a
gravação passou a ser feita por string para evitar o offset do servidor MySQL.

**Feito:** o parser foi portado **byte a byte**, sem tocar em nada. Nos 5 testes
defasados, apenas as *chamadas* foram traduzidas para a API atual — os valores
esperados e as asserções continuam idênticos (os mesmos 640 minutos, o mesmo
02/02/2026, o mesmo "ímpar"). Cada tradução está marcada com um comentário
`// PORTABILIDADE:` explicando o que o original afirmava. O arquivo original
segue intacto em `referencia/codigo-fonte/` para conferência.

Suíte atual: **29 testes, todos passando** (27 do parser + 2 de fuso).

### 2. `toMysqlUtcString` continua com esse nome

O nome cita MySQL, mas o formato `'YYYY-MM-DD HH:MM:SS'` que ela produz é
exatamente o que o `timestamp` do Postgres em modo string espera. A função foi
portada sem renomear, para o parser ficar byte a byte igual ao original.

Vale renomear depois, num commit isolado que não misture renomeação com
mudança de comportamento.

---

## Conferência da migration

A migration do handoff (`0000_striped_abomination.sql`) foi comparada com a que
o `drizzle-kit generate` produz a partir de `drizzle/schema.ts`: **idênticas**.
O arquivo do handoff foi mantido como canônico e o journal do drizzle-kit
aponta para ele.

---

## O que este marco não prova

- **Turno cruzando a meia-noite.** Nenhuma amostra exercita a regra de herança
  de madrugada. Os testes unitários cobrem; dado real, não. Continua sendo a
  pendência mais frágil da migração — ver `CLAUDE.md`.
- **As contas de dinheiro.** `fechamento_15-07-2026_31-07-2026.csv` está em
  `amostras/` e ainda não foi conferido contra o sistema. O marco 1 valida
  horas e dias, não valor a pagar nem arredondamento.
- **As cinco correções obrigatórias.** Nenhuma foi implementada, por decisão de
  escopo. A regra da 6.1 continua indefinida.
