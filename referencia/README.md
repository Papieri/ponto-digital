# Ponto Digital — Calculadora de Horas Trabalhadas

**Versão documentada:** `3a83c0a5` (checkpoint final)
**Data de geração:** Julho de 2026
**Domínio de produção:** `timesheetapp-jhczrpx5.manus.space`

---

## Visão Geral do Projeto

O **Ponto Digital** é uma aplicação web desenvolvida para a empresa **Papieri** com o objetivo de automatizar o processamento e fechamento quinzenal de folha de ponto de funcionários. O sistema importa arquivos TXT gerados por relógios de ponto eletrônico (formato proprietário com colunas fixas), calcula automaticamente as horas trabalhadas por funcionário e período, e gera relatórios financeiros com valores a pagar por hora e por dia, além do vale-transporte.

### Público-Alvo

O sistema é voltado para uso interno da empresa Papieri, operado pelo setor financeiro/RH. O acesso é protegido por autenticação OAuth via plataforma Manus, garantindo que apenas usuários autorizados possam importar dados e visualizar relatórios.

### Escopo Definido

O escopo cobre as seguintes funcionalidades:

| Módulo | Descrição |
|---|---|
| Importação de ponto | Upload e parsing de arquivos TXT do relógio de ponto |
| Cadastro de funcionários | Gestão de funcionários com taxas horárias, diárias e vale-transporte |
| Relatório de fechamento | Resumo quinzenal com totais financeiros por funcionário |
| Detalhe diário | Visualização dos registros de ponto dia a dia por funcionário |
| Edição manual | Adição e remoção de batidas de ponto com recálculo automático |
| Exportação CSV | Download dos relatórios em formato CSV para uso em planilhas |
| Exclusão de importações | Remoção de lotes de importação com cascata completa dos dados |

---

## Início Rápido

Para rodar o projeto localmente, consulte o arquivo [DEPLOY.md](./DEPLOY.md).

Para entender a arquitetura técnica, consulte [ARQUITETURA.md](./ARQUITETURA.md).

Para o modelo de banco de dados, consulte [BANCO_DE_DADOS.md](./BANCO_DE_DADOS.md).

Para o histórico de decisões técnicas, consulte [DECISOES.md](./DECISOES.md).

Para a referência completa de APIs, consulte [APIS.md](./APIS.md).

Para a estrutura de arquivos, consulte [ESTRUTURA.md](./ESTRUTURA.md).

---

## Resumo das Tecnologias

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + Vite 7 + Tailwind CSS 4 |
| UI Components | shadcn/ui + Radix UI |
| Backend | Express 4 + tRPC 11 |
| Banco de dados | MySQL/TiDB via Drizzle ORM |
| Autenticação | Manus OAuth 2.0 |
| Runtime | Node.js 22 + TypeScript 5.9 |
| Hospedagem | Manus Webdev (Autoscale / Cloud Run) |

---

## Funcionalidades Principais

O sistema processa arquivos TXT com o seguinte formato de linha:

```
Tra. No.  Name        Dept.   Date       Time   IO   No.
00002     MIRELLI     PROD    02/02/2026 12:04  I    1
```

O parser (`server/timesheetParser.ts`) lê cada linha, agrupa os registros por funcionário e data, trata turnos noturnos (registros entre 00:00 e 05:29 UTC pertencem ao turno do dia anterior), calcula o total de horas por par entrada/saída e gera os resumos diários e o período de fechamento quinzenal.

---

## Pendências e Próximos Passos

Consulte o arquivo [PENDENCIAS.md](./PENDENCIAS.md) para a lista completa de itens pendentes e sugestões de evolução.
