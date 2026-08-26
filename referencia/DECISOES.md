# Histórico de Decisões Técnicas

Este documento registra cronologicamente as decisões técnicas tomadas durante o desenvolvimento do Ponto Digital, incluindo o que foi testado, descartado e o motivo. O objetivo é que qualquer desenvolvedor ou IA que continue o projeto entenda o raciocínio por trás das escolhas.

---

## Fase 1 — Scaffolding e Definição do Escopo

**Decisão:** Usar o template `web-db-user` da plataforma Manus (React + tRPC + MySQL + OAuth).

**Motivo:** O projeto requer autenticação (apenas usuários autorizados podem importar dados), banco de dados relacional (múltiplas tabelas com relacionamentos) e uma SPA responsiva. O template já entrega OAuth, sessão por cookie, tRPC e Drizzle configurados, eliminando semanas de boilerplate.

**Alternativas descartadas:** REST puro com Express + Axios foi descartado porque tRPC oferece tipagem end-to-end sem geração de código, reduzindo erros de contrato entre frontend e backend.

---

## Fase 2 — Parser do Arquivo TXT

**Decisão:** Implementar o parser em `server/timesheetParser.ts` como funções puras testáveis, sem dependência de banco de dados.

**Motivo:** O formato do arquivo TXT do relógio de ponto é proprietário e com colunas de largura fixa. A lógica de parsing é complexa (tratamento de turno noturno, redistribuição de registros entre dias) e precisa de testes unitários isolados. Separar o parser do banco permite testar com `vitest` sem precisar de conexão com banco.

**Decisão:** Ignorar o campo `IO` (entrada/saída) do arquivo TXT e tratar todos os registros do dia como uma sequência ordenada de pares (entrada, saída).

**Motivo:** Na prática, os arquivos reais da empresa tinham inconsistências no campo `IO` (alguns registros com `I` quando deveriam ser `O`). Ordenar por timestamp e tratar pares sequencialmente é mais robusto e produz os mesmos resultados corretos quando os dados estão íntegros.

**Decisão:** Registros entre 00:00 e 05:29 UTC pertencem ao turno do dia anterior, mas somente se o dia anterior tiver número ímpar de registros (turno aberto).

**Motivo:** Funcionários do turno noturno entram antes da meia-noite e saem na madrugada. Sem essa redistribuição, o dia anterior ficaria com número ímpar (entrada sem saída) e o dia atual teria uma saída sem entrada correspondente. A condição de "dia anterior com número ímpar" evita redistribuições incorretas quando o turno já estava fechado.

**Ajuste posterior:** O limiar foi definido em 05:30 (não 06:00) porque registros de entrada do primeiro turno matinal às 05:30 são válidos e não devem ser redistribuídos para o dia anterior.

---

## Fase 3 — Modelo de Dados

**Decisão:** Criar tabelas separadas para `time_records`, `daily_summaries` e `payroll_periods` em vez de calcular tudo na hora da query.

**Motivo:** Calcular totais de horas em tempo real para centenas de funcionários e dias seria lento e custoso. Pré-calcular e armazenar os resumos permite queries simples e rápidas na tela de relatório. O custo é a necessidade de recalcular ao editar registros manualmente (função `recalcDay`).

**Decisão:** Armazenar todos os timestamps como strings MySQL (`YYYY-MM-DD HH:MM:SS`) sem timezone, usando UTC implícito.

**Motivo:** O Drizzle ORM com `mode: "string"` retorna strings em vez de objetos `Date`, evitando conversões automáticas de timezone pelo driver MySQL. Isso garante que o valor armazenado seja exatamente o que foi lido do arquivo TXT (que já está em UTC).

**Problema encontrado:** O JavaScript interpreta strings sem timezone como hora local. Ao fazer `new Date("2026-02-02 12:03:57")` em um navegador com fuso UTC-3, o resultado é `2026-02-02T15:03:57Z` (12:03 local = 15:03 UTC). Ao exibir com `timeZone: "UTC"`, o horário aparecia como 15:03 em vez de 12:03.

**Solução:** Criada a função `toUtcDate(s: string): Date | null` no frontend que adiciona `"Z"` à string antes de criar o `Date`, forçando interpretação UTC: `new Date(s.replace(' ', 'T') + 'Z')`.

---

## Fase 4 — Lógica de Cálculo Financeiro

**Decisão:** Calcular `totalByHour`, `totalByDay` e `transportTotal` no momento da importação e armazenar em `payroll_periods`, usando as taxas do funcionário no momento da importação.

**Motivo:** As taxas dos funcionários podem mudar ao longo do tempo. Armazenar os valores calculados garante que o relatório de um período passado não seja alterado por mudanças futuras nas taxas. Se o usuário alterar a taxa de um funcionário, precisará reimportar o lote para recalcular.

**Decisão:** Adicionar coluna "Valor Total" (Total/Hora + Passagem) na tabela de resumo.

**Motivo:** Solicitação direta do usuário. A coluna soma `totalByHour + transportTotal` e é exibida destacada em laranja para facilitar a leitura do valor final a pagar por funcionário.

---

## Fase 5 — Edição Manual de Registros

**Decisão:** Implementar edição manual via modal (`EditDayRecordsModal.tsx`) em vez de edição inline na tabela.

**Motivo:** A edição inline em tabelas com muitas linhas é propensa a erros de UX (clique acidental, perda de contexto). O modal isola a edição de um único dia e funcionário, mostrando todos os registros existentes e permitindo adicionar/remover com confirmação.

**Decisão:** O input de hora no modal usa `type="time"` do HTML nativo.

**Problema encontrado:** O `input type="time"` retorna o valor no fuso local do navegador. Ao construir a ISO string para enviar ao backend, era necessário garantir que `${workDate}T${timePart}Z` usasse UTC. O bug original era que o backend recebia a hora local e a armazenava como UTC, resultando em +3h na exibição (UTC-3 → UTC).

**Solução:** O frontend constrói explicitamente `${workDate}T${timePart}:00Z` (com `Z` no final), forçando que o horário digitado seja tratado como UTC. O backend usa `toMysqlUtcString(new Date(input.recordedAt))` que extrai os componentes UTC do Date e formata como string MySQL.

---

## Fase 6 — Bug de Re-renders Simultâneos

**Problema:** Ao adicionar ou remover uma batida manual, a tela exibia `NotFoundError: Failed to execute 'insertBefore' on 'Node'` e ficava branca.

**Diagnóstico:** O `onSuccess` do `addMutation` no modal disparava 4 invalidações de cache tRPC simultaneamente (`getDayRecords`, `getDailySummaries`, `getPayrollPeriods`, `getPayrollSummary`). Ao mesmo tempo, o `onSaved()` callback no `ReportPage` disparava mais 3 invalidações. Essas 7 invalidações causavam re-renders em cascata enquanto o React ainda estava processando o primeiro render, resultando em tentativas de manipular nós do DOM que já haviam sido removidos.

**Solução:** O modal passou a invalidar apenas `getDayRecords` imediatamente (atualiza a lista local do modal). O callback `onSaved()` é chamado com `setTimeout(() => onSaved(), 50)`, garantindo que o React termine o primeiro ciclo de render antes de disparar as invalidações do ReportPage. Isso serializa os re-renders sem perda de dados.

**Alternativas descartadas:** Usar `React.startTransition` foi considerado mas descartado porque as invalidações do tRPC não são transições de estado React — são chamadas assíncronas que disparam fora do ciclo de render.

---

## Fase 7 — Exclusão de Importações

**Decisão:** Implementar exclusão de lotes com AlertDialog de confirmação, não com exclusão direta.

**Motivo:** A exclusão de um lote remove em cascata centenas ou milhares de registros de ponto, resumos diários e períodos de folha. Uma exclusão acidental seria catastrófica. O AlertDialog exibe o nome do arquivo e um aviso explícito de irreversibilidade antes de confirmar.

**Decisão:** A exclusão em cascata é implementada no código da aplicação (`deleteImportBatch` em `db.ts`) e não via `ON DELETE CASCADE` no banco.

**Motivo:** O schema Drizzle não declara chaves estrangeiras formais (para compatibilidade com TiDB serverless). A cascata é garantida pela ordem de deleção: primeiro `time_records`, depois `daily_summaries`, depois `payroll_periods`, e por último `import_batches`.

---

## Decisões de Design

**Decisão:** Tema escuro (`defaultTheme="dark"`) com paleta azul/slate.

**Motivo:** O sistema é uma ferramenta interna de uso diário. Temas escuros reduzem a fadiga visual em uso prolongado.

**Decisão:** Layout com sidebar fixa (`AppLayout.tsx`) em vez de top navigation.

**Motivo:** O sistema tem 4 seções principais (Dashboard, Funcionários, Importar, Relatório). Uma sidebar fixa permite navegação rápida sem perder o contexto da página atual, padrão estabelecido para ferramentas internas e dashboards.

**Decisão:** Exportação CSV em vez de PDF.

**Motivo:** O usuário usa os dados em planilhas (Excel/Google Sheets) para processamento adicional. CSV é mais fácil de importar e manipular do que PDF. PDF foi sugerido como próximo passo mas não implementado na versão atual.
