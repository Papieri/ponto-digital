# Correções obrigatórias da seção 6

**Data:** agosto de 2026
**Escopo:** 6.2, 6.3, 6.4 e 6.5. A **6.1 não foi implementada** — a regra ainda
não foi decidida.

Tudo é camada **aditiva** sobre o parser: `src/server/timesheetParser.ts` segue
byte a byte igual ao original, com seus 27 testes. As correções vivem em
`src/server/correcoes.ts` e operam sobre o resultado dele, para que a apuração
portada e as correções possam ser revisadas — e revertidas — separadamente.

---

## ⚠️ A 6.3 muda a tabela de validação do marco 1

Esta é a consequência que mais importa. A coluna **Dias c/ Problema** mudou:

| Cód | Nome | Antes | Depois | Status |
|---|---|---|---|---|
| 3 | Elaine | 1 | **0** | OK |
| 4 | Raquel | 2 | **1** | Aviso |
| 5 | Skarlat | 0 | 0 | OK |
| 6 | Jucelaine Paes | 0 | 0 | OK |
| 8 | Maria Izadora | 0 | 0 | OK |
| 22 | Ketlen Dias | 1 | **0** | OK |

**Dias trabalhados e total de horas não mudaram em nenhuma linha.**

O motivo: em 24/08/2026, último dia do arquivo, Elaine, Raquel e Ketlen têm
**uma única batida** — entrada às 06:31, 06:51 e 07:33, sem saída, porque o
export foi cortado no meio da manhã. Eram exatamente os alarmes falsos que a
6.3 existe para eliminar.

Isso é **mudança de comportamento pedida pela especificação**, não regressão da
migração. A tabela no `CLAUDE.md` continua correta como marco da portabilidade
— ela mede a troca de banco, não as correções.

---

## 6.2 · Período confirmável na importação

O período era sempre o menor e o maior registro do arquivo, aceito em silêncio:
um export com intervalo errado rotulava o lote errado sem ninguém perceber.

`resolverPeriodo(detectado, informado?)` passa a tratar o detectado como
**sugestão**. Quando o operador informa um período, ele prevalece e o lote é
gravado com `period_confirmed = true`. Sem período informado, grava `false` — o
que deixa visível, no banco, quais lotes ninguém conferiu.

Validações: formato `'YYYY-MM-DD HH:MM:SS'` (o mesmo do resto da pilha) e
início não posterior ao fim.

---

## 6.3 · Último dia do export com tratamento distinto

Quando o arquivo termina no meio de um dia, as batidas soltas apareciam como
"batida faltando". Alarme falso recorrente faz o operador ignorar o alerta de
verdade — que é justamente o que a 6.4 tenta proteger.

`aplicarCorrecaoExportTruncado(grupos)` reclassifica os dias com alarme que
caem no **último dia do arquivo**: `has_issue` passa a `false` e
`issue_description` recebe uma nota informativa. O dia continua visível, mas
para de contar como dia com problema e de puxar o status para Aviso/Crítico.

Dias anteriores não mudam: se o arquivo termina no dia 24, uma batida faltando
no dia 21 continua sendo alarme — é o caso da Raquel.

**Decisão que vale revisar:** a especificação diz "tratamento distinto" sem
dizer qual. Adotei *informativo, não alarme*, porque o problema descrito é o
alarme falso. Está isolado numa função só, fácil de mudar se você preferir
outra leitura — por exemplo manter o alarme com texto diferente.

**Sem coluna nova no schema.** O dia truncado é identificado por `has_issue =
false` com `issue_description` preenchida. Se preferir um campo explícito, é
uma migration — me diga.

---

## 6.4 · Fechamento barrado com dias em aberto

Com 3 batidas no dia, o pareamento casa as duas primeiras e descarta a terceira.
O relatório sai com menos horas do que a pessoa trabalhou: não é "incompleto",
é errado para menos, e o colaborador recebe a menos se ninguém corrigir.

A sinalização já existia. O que faltava era a trava:

- `diasEmAberto(dias)` lista os dias com número ímpar de batidas;
- `verificarFechamento(dias, { confirmado })` **lança `DiasEmAbertoError`** se
  houver dias em aberto sem confirmação explícita. A exceção carrega a lista,
  para a tela poder mostrar quem e quando.

O dia truncado do fim do arquivo fica de fora: pela 6.3 ele não é batida
faltando, e barrar o fechamento por causa dele seria o mesmo alarme falso numa
porta diferente.

Na amostra sobra **um** dia em aberto: Raquel em 21/08, com 3 batidas.

**Ainda não há estado "fechado" no banco.** O enum `batch_status` tem
`processing`, `completed` e `error`, todos sobre a importação, não sobre o
fechamento. A trava está pronta como função de domínio, para a tela e a API
chamarem. Persistir "lote fechado" exige uma coluna nova — decisão sua.

---

## 6.5 · Recalcular valores

As taxas são congeladas na importação. Alterar o cadastro depois não mudava o
relatório, e a única saída era excluir e reimportar o lote — o que apagava junto
todas as correções manuais de batida.

`recalcularValores(batchId)` relê o cadastro e refaz as contas **a partir dos
resumos diários já gravados**, que é onde vivem as correções manuais. Não toca
em `time_records` nem em `daily_summaries`: só reescreve `payroll_periods`.

Provado em `src/server/recalculo.test.ts`, contra banco de verdade:

- dobrar o valor/hora no cadastro dobra o Total por Hora do lote depois do
  recálculo — e **não** antes, que é o bug;
- batidas e resumos diários sobrevivem intactos;
- uma correção manual (fechar o dia em aberto da Raquel) sobrevive ao recálculo
  **e** passa a valer na conta: `missingDays` vai a 0 e o status a OK;
- rodar duas vezes seguidas dá o mesmo resultado.

---

## 6.1 · NÃO implementada

A regra continua indefinida e não foi deduzida. `counts_as_worked_day` é
gravado explicitamente a partir de `decidirCountsAsWorkedDay()`, que devolve o
**comportamento atual**: todo dia apurado conta como dia trabalhado. A função
existe para que a regra tenha um lugar só quando for decidida, e um teste trava
o comportamento atual para ninguém decidir sem querer.

**O que a 6.3 fez com a 6.1, e que precisa da sua atenção:** os três dias
reclassificados como export truncado são exatamente os três casos que a 6.1
descreve — dia com uma batida só, zero hora apurada. Antes eles ao menos
apareciam como problema. Agora **não dão mais alarme, mas continuam contando
como dia trabalhado e pagando diária de referência e passagem cheia**.

Ou seja: a 6.3 tirou o sintoma que denunciava a 6.1. Enquanto a 6.1 não for
decidida, Elaine, Raquel e Ketlen seguem recebendo passagem por 24/08 — um dia
em que bateram o ponto e o arquivo não mostra que trabalharam.

As candidatas na especificação: contar só quando houver minutos apurados, ou só
quando houver ao menos um par completo de batidas.

---

## Onde olhar

| Arquivo | Conteúdo |
|---|---|
| `src/server/correcoes.ts` | 6.2, 6.3, 6.4 e o ponto de decisão da 6.1 |
| `src/server/calculo.ts` | Regras de valor, conferidas contra o fechamento real |
| `src/server/importarPonto.ts` | Pipeline com as correções aplicadas, e a 6.5 |
| `src/server/correcoes.test.ts` | 17 testes das correções |
| `src/server/calculo.test.ts` | 17 testes do dinheiro, lidos do CSV de amostra |
| `src/server/recalculo.test.ts` | 4 testes de integração da 6.5 |
