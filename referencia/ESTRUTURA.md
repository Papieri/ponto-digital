# Estrutura do Projeto

## Árvore de Arquivos

```
timesheet_calculator/
├── client/                          # Frontend React (Vite)
│   ├── index.html                   # Ponto de entrada HTML; inclui fonte Google (Inter)
│   ├── public/                      # Assets estáticos servidos na raiz
│   └── src/
│       ├── main.tsx                 # Bootstrap: ThemeProvider, QueryClient, tRPC
│       ├── App.tsx                  # Roteamento (wouter) e layout global
│       ├── index.css                # CSS global: variáveis de tema, Tailwind @layer
│       ├── const.ts                 # Constantes: getLoginUrl(), APP_ID
│       ├── components/
│       │   ├── AppLayout.tsx        # Layout principal com sidebar de navegação
│       │   ├── DashboardLayout.tsx  # Layout alternativo (não usado atualmente)
│       │   ├── EditDayRecordsModal.tsx  # Modal de edição manual de batidas
│       │   ├── ErrorBoundary.tsx    # Captura erros React e exibe tela de fallback
│       │   ├── ManusDialog.tsx      # Dialog genérico da plataforma
│       │   ├── Map.tsx              # Componente Google Maps (não usado)
│       │   └── ui/                  # Componentes shadcn/ui (Radix primitives)
│       │       ├── alert-dialog.tsx # AlertDialog de confirmação (usado na exclusão)
│       │       ├── badge.tsx        # Badge de status
│       │       ├── button.tsx       # Botão com variantes
│       │       ├── card.tsx         # Card container
│       │       ├── dialog.tsx       # Dialog base
│       │       ├── input.tsx        # Input de texto
│       │       ├── label.tsx        # Label de formulário
│       │       ├── select.tsx       # Select dropdown
│       │       ├── sonner.tsx       # Toaster de notificações
│       │       ├── tabs.tsx         # Tabs (Resumo / Detalhe Diário)
│       │       └── ...              # Demais componentes shadcn/ui
│       ├── contexts/
│       │   └── ThemeContext.tsx     # Contexto de tema claro/escuro
│       ├── hooks/
│       │   ├── useComposition.ts   # Hook para composição de texto (IME)
│       │   ├── useMobile.tsx       # Detecta viewport mobile
│       │   └── usePersistFn.ts     # Referência estável para callbacks
│       ├── lib/
│       │   ├── trpc.ts             # Cliente tRPC com superjson transformer
│       │   └── utils.ts            # Utilitários: cn() para classnames
│       └── pages/
│           ├── Home.tsx            # Página inicial (redireciona para Dashboard)
│           ├── Dashboard.tsx       # Dashboard: histórico de importações + métricas
│           ├── Employees.tsx       # CRUD de funcionários com taxas e vale-transporte
│           ├── ImportPage.tsx      # Upload e importação de arquivo TXT
│           ├── ReportPage.tsx      # Relatório de fechamento quinzenal
│           ├── NotFound.tsx        # Página 404
│           └── ComponentShowcase.tsx  # Showcase de componentes (dev only)
│
├── drizzle/                         # Migrations e schema do banco
│   ├── schema.ts                    # Definição das tabelas (fonte da verdade)
│   ├── relations.ts                 # Relações Drizzle entre tabelas
│   ├── 0000_lethal_galactus.sql     # Migration inicial (users, employees)
│   ├── 0001_daily_luminals.sql      # Migration: import_batches, time_records, etc.
│   ├── 0002_burly_old_lace.sql      # Migration: campo isManual em time_records
│   └── meta/                        # Snapshots internos do Drizzle Kit
│
├── server/
│   ├── _core/                       # Infraestrutura da plataforma (NÃO EDITAR)
│   │   ├── index.ts                 # Entry point Express + Vite bridge
│   │   ├── context.ts               # Contexto tRPC (req, res, user)
│   │   ├── cookies.ts               # Helpers de cookie de sessão
│   │   ├── env.ts                   # Variáveis de ambiente tipadas
│   │   ├── llm.ts                   # Helper invokeLLM (não usado no projeto)
│   │   ├── notification.ts          # Helper notifyOwner
│   │   ├── oauth.ts                 # Fluxo OAuth Manus
│   │   ├── systemRouter.ts          # Router de sistema (notificações)
│   │   ├── trpc.ts                  # Instância tRPC + publicProcedure + protectedProcedure
│   │   └── vite.ts                  # Bridge Vite em desenvolvimento
│   ├── db.ts                        # Helpers de banco de dados (queries e mutations)
│   ├── routers.ts                   # Todos os tRPC routers da aplicação
│   ├── timesheetParser.ts           # Parser do arquivo TXT + lógica de cálculo
│   ├── storage.ts                   # Helpers S3 (storagePut, storageGet)
│   ├── auth.logout.test.ts          # Teste de logout (referência)
│   └── timesheetParser.test.ts      # Testes unitários do parser
│
├── shared/
│   ├── const.ts                     # Constantes compartilhadas frontend/backend
│   ├── types.ts                     # Tipos compartilhados
│   └── _core/errors.ts              # Erros padronizados
│
├── scripts/
│   └── reimport.mjs                 # Script utilitário para reimportar lotes (uso manual)
│
├── package.json                     # Dependências e scripts npm
├── tsconfig.json                    # Configuração TypeScript
├── vite.config.ts                   # Configuração Vite
├── vitest.config.ts                 # Configuração Vitest
├── drizzle.config.ts                # Configuração Drizzle Kit
├── components.json                  # Configuração shadcn/ui
└── todo.md                          # Lista de tarefas e histórico de bugs
```

---

## Arquivos Críticos para Manutenção

Os arquivos que qualquer desenvolvedor continuando o projeto deve conhecer em profundidade são os seguintes:

| Arquivo | Responsabilidade |
|---|---|
| `drizzle/schema.ts` | Modelo de dados completo; toda mudança de estrutura começa aqui |
| `server/timesheetParser.ts` | Lógica de parsing do TXT e cálculo de horas; contém a regra de turno noturno |
| `server/db.ts` | Todas as queries e mutations do banco; funções puras sem lógica de negócio |
| `server/routers.ts` | Todos os endpoints da API; orquestra db.ts e timesheetParser.ts |
| `client/src/pages/ReportPage.tsx` | Página mais complexa; exibe relatório completo com edição inline |
| `client/src/components/EditDayRecordsModal.tsx` | Modal de edição manual; contém a lógica de serialização de invalidações |
