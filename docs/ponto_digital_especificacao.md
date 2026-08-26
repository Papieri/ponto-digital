# Ponto Digital — Especificação de Reconstrução

**Empresa:** Papieri
**Origem:** portabilidade do sistema hospedado na plataforma Manus (checkpoint `3a83c0a5`)
**Status:** rascunho para validação
**Data:** agosto de 2026

---

## 1. Objetivo

Fechamento quinzenal de horas de freelancers da produção. O sistema importa o arquivo TXT do relógio de ponto, apura as horas por pessoa e por dia, permite corrigir batidas e lançar descontos e acréscimos, e gera o relatório de pagamento.

Não é folha CLT: não há hora extra, jornada mensal, DSR, adicional noturno nem saldo de vales entre períodos. Cada quinzena é um período fechado e independente.

**Porte:** 6 a 8 colaboradores, um arquivo por quinzena.

---

## 2. Escopo funcional

| Módulo | Descrição |
|---|---|
| Login | Autenticação própria, usuário e senha |
| Colaboradores | Cadastro com valores individuais de remuneração |
| Importar ponto | Upload do TXT, parsing e criação do lote |
| Relatório de fechamento | Resumo por colaborador com valores e status |
| Detalhe diário | Registros dia a dia, com edição manual de batidas |
| Ajustes do período | Descontos e acréscimos por colaborador dentro do lote |
| Exportação CSV | Resumo e detalhado, prontos para planilha |

---

## 3. Cadastro do colaborador

| Campo | Observação |
|---|---|
| Código | Corresponde ao campo "Tra. No." do arquivo TXT |
| Nome | |
| Departamento | Padrão: PRODUCAO |
| Valor/hora | **Individual por pessoa** — não derivar da diária |
| Valor/dia | Usado apenas como referência no relatório |
| Passagem/dia | Pode ser zero |
| Ativo | |

> Os valores por hora observados hoje equivalem à diária dividida por 9, mas isso é
> coincidência de configuração, não regra. Os campos permanecem independentes para
> que um novo colaborador possa ter qualquer combinação.

---

## 4. Regras de cálculo

Por colaborador, dentro de um lote:

```
Total por Hora   = horas decimais apuradas x Valor/hora
Total por Dia    = dias trabalhados x Valor/dia        (referência, não entra no pagamento)
Total Passagem   = dias trabalhados x Passagem/dia
Valor Total      = Total por Hora + Total Passagem
VALOR A PAGAR    = ARREDONDAR PARA CIMA (Valor Total + Acréscimos - Descontos)
```

**Arredondamento:** para cima, até o real inteiro. Sempre a favor do colaborador.
Confirmado contra o fechamento de 15/07 a 31/07/2026 em todas as linhas, incluindo os
casos que distinguem "para cima" de "para o mais próximo".

**Dias trabalhados:** ver a correção obrigatória em 6.1 — a regra atual conta qualquer
dia com registro, mesmo sem horas apuradas.

---

## 5. Apuração de horas (mantida do sistema atual)

- Registros do dia são ordenados por horário e pareados em sequência:
  1º→2º, 3º→4º, e assim por diante. O campo entrada/saída do arquivo é ignorado,
  por vir inconsistente do relógio.
- Total do dia = soma dos intervalos entre pares.
- Número ímpar de registros: o último fica sem par e o dia é sinalizado.
- Esperado 4 registros por dia (ou 6 quando há pausa extra); outra quantidade é sinalizada.
- **Turno noturno:** registros entre 00:00 e 05:29 pertencem ao turno do dia anterior,
  desde que o dia anterior tenha número ímpar de registros. O dia de referência do turno
  é sempre o da entrada.
- Todos os horários são tratados como UTC, sem conversão de fuso, em toda a pilha.

**Status do colaborador no período:** 0 dias com problema = OK · 1 a 2 = Aviso · 3 ou mais = Crítico.

---

## 6. Correções obrigatórias

Identificadas na validação do parser contra um arquivo real de 17 a 24/08/2026.

### 6.1 Dia sem horas conta como dia trabalhado

A regra atual soma 1 dia trabalhado para qualquer dia que tenha algum registro,
independentemente das horas apuradas. Um dia com uma única batida apura zero hora
e mesmo assim paga diária de referência e passagem cheia.

No arquivo de teste isso ocorreu com três colaboradoras no mesmo dia.

**A definir:** o dia só conta quando houver minutos apurados, ou quando houver ao menos
um par completo de batidas.

### 6.2 Período deve ser confirmável na importação

O período do lote é hoje o menor e o maior registro do arquivo. Um export com intervalo
errado é aceito em silêncio e rotula o lote com o período errado.

O período detectado deve aparecer na tela de importação como sugestão editável.

### 6.3 Export truncado gera alarme falso

Quando o arquivo termina no meio de um dia, as batidas soltas do último dia aparecem
como "batida faltando". Alarme falso recorrente faz o operador ignorar o alerta.

O último dia do arquivo deve receber tratamento distinto do restante.

### 6.4 Dia com batidas ímpares subestima o valor

Com 3 batidas no dia, o pareamento sequencial casa as duas primeiras e descarta a
terceira. O relatório mostra menos horas do que a pessoa trabalhou — o número não é
"incompleto", é errado para menos, e o colaborador recebe a menos se ninguém corrigir.

A sinalização já existe. O que falta é impedir o fechamento com dias em aberto, ou
exigir confirmação explícita.

### 6.5 Recálculo ao alterar valores do colaborador

Os valores são congelados no momento da importação. Alterar o cadastro depois não
altera o relatório, e a única saída hoje é excluir e reimportar o lote — o que apaga
junto todas as correções manuais de batida já feitas.

Necessário um botão "Recalcular valores" que releia o cadastro e refaça as contas do lote.

---

## 7. Ajustes do período

Tabela nova, ligada ao lote e ao colaborador:

| Campo | Descrição |
|---|---|
| Lote | Identificador da importação |
| Código do colaborador | |
| Tipo | Desconto ou acréscimo |
| Descrição | Texto livre |
| Valor | |

Vários lançamentos por pessoa. Sem saldo entre períodos: o que é lançado numa quinzena
não aparece na seguinte.

Editável a partir da linha do colaborador no relatório.

---

## 8. Exportação CSV

Formato: separador `;`, UTF-8 com BOM, vírgula decimal. Abre direto no Excel em
português, sem assistente de importação.

Colunas do resumo, nesta ordem:

```
Código; Nome; Dias Trabalhados; Total Horas; Valor/Hora Base; Total por Hora;
Valor/Dia Base; Total por Dia; Passagem/Dia; Total Passagem; Valor Total;
Acréscimos; Descontos; VALOR A PAGAR; Dias c/ Problema; Status
```

`Acréscimos`, `Descontos` e `VALOR A PAGAR` passam a sair calculados pelo sistema.
Hoje são preenchidos à mão na planilha depois da exportação.

---

## 9. Arquitetura

Base preservada do sistema atual: React com Vite no front, Express com tRPC no back,
Drizzle como ORM, parser de TXT com testes unitários.

Substituições necessárias para sair da plataforma Manus:

| Hoje | Passa a ser |
|---|---|
| OAuth da plataforma | Autenticação própria: e-mail e senha, hash, sessão em cookie |
| Proxy de storage da plataforma | Pasta local, caminho por variável de ambiente |
| Banco TiDB da plataforma | Postgres |
| Hospedagem serverless da plataforma | Container em execução contínua |

**Desenvolvimento começa local.** Postgres em container Docker na máquina de quem
desenvolve. Sem conta, sem custo, sem internet no caminho crítico. As migrations rodam
iguais em qualquer Postgres.

**O host de produção fica em aberto de propósito.** Servidor da empresa, serviço
gerenciado ou Supabase — a decisão não bloqueia a construção, e a transferência é
`pg_dump` seguido de `pg_restore`. Com este volume, questão de segundos.

Para manter essa liberdade, duas restrições:

- **Nenhum recurso proprietário de fornecedor** no banco. Postgres puro.
- **Acesso a arquivos atrás de uma interface**, com implementação em disco local. Trocar
  por storage remoto é escrever outra implementação, não caçar chamadas espalhadas.

A autenticação é própria justamente porque é o que mais amarra a fornecedor. O banco se
troca com um dump; o provedor de identidade, não.

## 10. Fases

| Fase | Conteúdo | Depende de |
|---|---|---|
| 1 | Portar para fora do Manus: login próprio, storage, Postgres local | — |
| 2 | Correções do item 6 | Decisão do 6.1 |
| 3 | Ajustes do período e novo CSV | — |

A Fase 1 é o maior volume de trabalho e não depende de nenhuma decisão de negócio.

**Validação da Fase 1:** importar uma quinzena já fechada no sistema antigo e comparar
os totais linha a linha. O tratamento de fuso horário é a parte com maior chance de
quebrar em silêncio na troca de banco.

---

## 11. Pendências

1. Regra do dia sem horas apuradas (6.1).
2. Arquivo de teste com turno cruzando a meia-noite — nenhum dos arquivos disponíveis
   exercita essa lógica, que é a mais frágil na migração.
3. Confirmação de que "Total por Dia" é apenas referência.
4. Onde banco e aplicação vão rodar em produção — não bloqueia o desenvolvimento.
5. Quem mantém o sistema depois da transição.
