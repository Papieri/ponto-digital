# Timesheet Calculator - TODO

## Schema & Database
- [x] Tabela employees (funcionários com código, nome, valor/hora, valor/dia, passagem)
- [x] Tabela time_records (registros de ponto importados)
- [x] Tabela import_batches (lotes de importação com referência S3)
- [x] Tabela payroll_periods (períodos de fechamento quinzenal)
- [x] Tabela daily_summaries (resumo diário por funcionário)

## Backend
- [x] Parser de arquivo TXT de registros de ponto
- [x] Lógica de agrupamento: 4 registros/dia (entrada, saída manhã, entrada tarde, saída)
- [x] Lógica de exceção: 6 registros/dia (com pausas)
- [x] Cálculo de horas trabalhadas por funcionário/dia
- [x] Identificação de registros faltantes/incompletos
- [x] Upload de arquivo TXT para S3
- [x] Endpoint de importação de arquivo
- [x] Endpoint de listagem de funcionários (CRUD)
- [x] Endpoint de relatório de fechamento quinzenal
- [x] Notificação ao proprietário ao processar novo período
- [x] Notificação ao proprietário quando há registros faltantes críticos

## Frontend
- [x] Layout com sidebar escura e navegação
- [x] Página de Dashboard (visão geral com histórico de importações)
- [x] Página de Funcionários (cadastro e edição com CRUD completo)
- [x] Página de Importação de arquivo TXT (drag & drop + preview)
- [x] Página de Relatório de Fechamento Quinzenal
- [x] Sinalização visual de dias com registros incompletos (vermelho/amarelo)
- [x] Exportação de relatório (CSV resumo + CSV detalhado)
- [x] Tema claro, funcional e profissional

## Testes
- [x] Teste do parser de arquivo TXT (15 testes passando)
- [x] Teste de cálculo de horas
- [x] Teste de identificação de registros faltantes

## Dados iniciais
- [x] Funcionários da planilha pré-carregados no banco de dados

## Normalização de Nomes
- [x] Normalizar nomes para Title Case no parser (ELAINE → Elaine, altamiRO → Altamiro)
- [x] Atualizar nomes já cadastrados no banco de dados para Title Case
- [x] Atualizar nomes nos registros de ponto e resumos diários existentes

## Edição Manual de Registros
- [x] Endpoint para listar registros de ponto de um funcionário/dia específico
- [x] Endpoint para adicionar registro de ponto manualmente
- [x] Endpoint para remover registro de ponto
- [x] Endpoint para recalcular resumo diário após edição
- [x] Endpoint para recalcular período de folha após edição
- [x] Modal de edição na tela de relatório (detalhe diário)
- [x] Listagem dos registros do dia com horários editáveis
- [x] Botão de adicionar batida com seletor de hora
- [x] Botão de remover batida individual
- [x] Recálculo automático ao salvar edições
- [x] Atualização visual imediata do status (OK/Aviso/Crítico)

## Turno Noturno (cruzamento de meia-noite)
- [x] Detectar registros de saída na madrugada que pertencem ao turno iniciado no dia anterior
- [x] Agrupar entrada (ex: 22:00 dia N) + saída (ex: 02:00 dia N+1) no mesmo turno
- [x] Calcular horas corretamente para turnos que cruzam a meia-noite
- [x] Corrigir timezone definitivamente: usar Date.UTC no parser + pool com timezone=+00:00
- [x] Reimportar dados com a lógica corrigida

## Bugs Reportados (20/02/2026)
- [x] Elaine 06/02 mostra 3 registros — investigado: o 05:49 pertence ao turno noturno do 05/02 (correto). Dia 06/02 tem 3 registros reais no arquivo (batida faltando confirmada)
- [x] Modal de edição: adicionar 09:00 salvava como 12:00 (+3h) — corrigido adicionando 'Z' ao ISO string para forçar UTC
- [x] Erro React NotFoundError: insertBefore — corrigido mantendo modal sempre montado (sem desmontagem condicional)

## Ajustes (20/02/2026 - rodada 2)
- [x] Corrigir bug de +3h nas adições manuais de horário no modal
- [x] Adicionar exclusão de importações no Dashboard (botão lixo + AlertDialog de confirmação)
- [x] Ajustar limiar do turno noturno: registros a partir de 05:30 são primeiro turno (não madrugada)

## Bugs (21/02/2026)
- [x] Bug de exibição: horários mostrados com +3h no relatório (ex: 12:03 → 15:03) — corrigido adicionando função toUtcDate() que adiciona 'Z' às strings sem timezone antes de criar o Date
- [x] Adicionar coluna "Valor Total" (Total/Hora + Passagem) na tabela de resumo por funcionário
- [x] Bug: erro NotFoundError insertBefore ao adicionar/remover registro manual — corrigido com setTimeout(50ms) para serializar invalidações entre modal e ReportPage
