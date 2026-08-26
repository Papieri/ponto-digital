# Pendências e Próximos Passos

Este documento lista os itens que ficaram fora do escopo da versão atual e as sugestões de evolução levantadas durante o desenvolvimento.

---

## Bugs Conhecidos

Não há bugs conhecidos na versão `3a83c0a5`. Os seguintes bugs foram identificados e corrigidos durante o desenvolvimento:

| Bug | Status | Solução |
|---|---|---|
| Horários exibidos com +3h (ex: 12:03 → 15:03) | Resolvido | Função `toUtcDate()` força interpretação UTC no frontend |
| Erro `NotFoundError: insertBefore` ao adicionar batida manual | Resolvido | `setTimeout(50ms)` serializa invalidações entre modal e ReportPage |
| Input de hora manual adicionava +3h ao gravar | Resolvido | Frontend constrói ISO string com `Z` explícito; backend usa `toMysqlUtcString()` |

---

## Funcionalidades Pendentes (Alta Prioridade)

### Exportação em PDF

O relatório quinzenal pode ser exportado em CSV, mas não em PDF. Um PDF formatado com cabeçalho da empresa, tabela de horas e totais seria útil para impressão e envio por e-mail ao setor contábil. Sugestão de implementação: usar a biblioteca `@react-pdf/renderer` no servidor para gerar o PDF a partir dos dados do `payroll_periods`.

### Filtro por Funcionário na Aba Detalhe Diário

A aba "Detalhe Diário" exibe todos os funcionários do lote. Quando há muitos colaboradores, a navegação fica lenta. Adicionar um seletor de funcionário no topo da aba permitiria filtrar para ver apenas um colaborador por vez.

### Recálculo ao Alterar Taxas de Funcionário

Atualmente, se o usuário alterar a taxa horária de um funcionário após a importação, os valores financeiros no relatório não são atualizados automaticamente. Seria necessário reimportar o lote. Uma solução seria adicionar um botão "Recalcular valores" no relatório que releia as taxas atuais e recalcule `totalByHour`, `totalByDay` e `transportTotal` para todos os funcionários do lote.

---

## Funcionalidades Sugeridas (Média Prioridade)

### Campo de Observação por Dia

No modal de edição, adicionar um campo de texto livre para registrar justificativas por dia (ex: "falta justificada", "banco de horas", "atestado médico"). O texto seria salvo em `daily_summaries.issueDescription` e exibido na coluna Observação do relatório diário.

### Mapeamento de Código de Funcionário

Criar uma tabela de mapeamento entre o código numérico do arquivo TXT e o código interno do funcionário. Isso seria útil para lidar com casos em que o arquivo usa códigos diferentes dos cadastrados no sistema, sem precisar alterar o cadastro do funcionário.

### Card de Valor Total nos Indicadores do Dashboard

Adicionar um card de "Valor Total" nos indicadores do topo do relatório (ao lado dos cards de Total por Hora e Passagens), exibindo o valor consolidado de todos os funcionários do lote para uma visão rápida sem precisar rolar até a tabela.

### Ordenação de Colunas na Tabela de Resumo

Permitir clicar no cabeçalho de qualquer coluna (Nome, Dias, Total Horas, Valor Total) para ordenar a tabela de forma crescente ou decrescente. Útil para identificar rapidamente os funcionários com mais horas ou maior valor a receber.

### Histórico de Edições Manuais

Registrar um log de auditoria de todas as edições manuais (quem adicionou/removeu qual batida, quando). Isso seria implementado com uma nova tabela `audit_log` e exibido no modal de edição como um histórico de alterações.

---

## Funcionalidades Sugeridas (Baixa Prioridade)

### Notificação de Fechamento

Enviar uma notificação automática ao dono do projeto (via `notifyOwner`) quando um lote for importado com sucesso, incluindo o resumo: quantos funcionários, quantos dias com problemas, valor total estimado.

### Importação em Lote (Múltiplos Arquivos)

Atualmente, cada arquivo TXT é importado individualmente. Permitir a seleção de múltiplos arquivos de uma vez, processando-os em sequência.

### Comparativo entre Períodos

Uma tela de comparativo que mostre lado a lado dois períodos quinzenais para um mesmo funcionário, facilitando a identificação de variações de horas e valores.

### Integração com Sistema de Folha de Pagamento

Exportar os dados em formato compatível com sistemas de folha de pagamento (ex: Domínio, Totvs) para eliminar a necessidade de redigitação manual dos valores calculados.

---

## Débitos Técnicos

### Chaves Estrangeiras no Banco

O schema atual não declara `FOREIGN KEY` formais no banco. A integridade referencial é garantida pelo código da aplicação. Em um banco MySQL puro (não TiDB serverless), seria recomendável adicionar as FKs com `ON DELETE CASCADE` para garantir consistência mesmo em operações diretas no banco.

### Testes de Integração

O projeto tem testes unitários para o parser (`timesheetParser.test.ts`), mas não tem testes de integração para os endpoints tRPC. Adicionar testes que mockam o banco e testam o fluxo completo de importação e cálculo seria valioso para evitar regressões.

### Paginação na Tabela de Registros

A tabela de detalhe diário carrega todos os registros de todos os funcionários de uma vez. Para lotes com muitos funcionários (30+), isso pode causar lentidão. Implementar paginação ou virtualização da lista seria recomendado.
