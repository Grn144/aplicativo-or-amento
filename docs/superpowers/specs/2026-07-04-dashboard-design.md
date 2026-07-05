# Design — Dashboard de Gestão de Orçamentos

**Data:** 2026-07-04
**Status:** Aprovado para implementação

---

## 1. Contexto

O sistema já possui login com MFA, CRUD de obras, editor de orçamento com visão técnica/comercial e export Excel. Falta o dashboard gerencial. O usuário forneceu um prompt visual detalhado (estilo SaaS 2025, minimalista, tema claro/escuro); este design adapta aquele prompt aos **dados reais** do banco — sem números fictícios.

**Decisões tomadas com o usuário:**

- Dados 100% reais do Supabase, adaptando conceitos do prompt ao que existe no banco.
- Sidebar redesenhada mostrando apenas rotas reais (Dashboard, Obras) — novos itens entram quando as páginas existirem.
- Gráficos com **Recharts** (base dos charts shadcn/ui, integra com CSS variables do tema).
- Escopo v1 completo: essenciais + export PDF/Excel + realtime + paginação/filtros na tabela.
- Arquitetura A: Server Components com agregação em TypeScript reutilizando `lib/calculos.ts` (nunca duplicar fórmulas em SQL — restrição da spec original).

---

## 2. Mapeamento de dados (prompt → banco real)

Status reais: `rascunho`, `enviado`, `aprovado`, `em_execucao`, `concluido`, `cancelado`.

| Conceito do prompt | Fonte real |
|---|---|
| Orçamentos Criados | contagem de `obras` no período |
| Em Análise | obras com status `enviado` |
| Aprovados | `aprovado` + `em_execucao` + `concluido` |
| Rejeitados/Cancelados | `cancelado` (não existe "rejeitado" no banco) |
| Valor Total Orçado | Σ `total_venda` de todas as obras do período (via `lib/calculos.ts`) |
| Valor Aprovado | Σ `total_venda` das obras aprovadas+ |
| Valor Executado | **não existe** → substituído por **custo previsto** (Σ `total_custo`) |
| Tempo Médio p/ Aprovação | **não rastreado** → substituído por **Margem Efetiva Média** |
| Responsável | `obras.criado_por` → `usuarios.nome` |
| Atividades Recentes | `historico_alteracoes` join `usuarios` |

Indicadores de variação (↑/↓ %): comparação com o período anterior equivalente (ex.: últimos 30 dias vs os 30 dias anteriores). Período anterior sem dados → exibe "—" em vez de %.

**Fora da v1 (dados inexistentes):** Top Engenheiros, Calendário de vencimentos, páginas Clientes/Equipes/Financeiro/Relatórios/Configurações.

O filtro de período usa `obras.data_orcamento` com fallback para `criado_em` quando nula.

**Escopo do filtro de período:** KPIs, pizza de status, indicadores menores, tabela e top clientes respeitam o filtro. Os três gráficos mensais (barras, linha, área) mostram sempre os 12 meses do ano corrente, independentemente do filtro — são séries anuais por definição.

---

## 3. Layout

### Sidebar (`components/layout/Sidebar.tsx` — substitui a atual)

- Logo da empresa no topo (reutiliza `LogoEmpresa`).
- Menu com ícones Lucide outline: Dashboard (`LayoutDashboard`), Obras (`Building2`).
- Colapsável (botão recolher → só ícones com tooltip); estado persiste em localStorage.
- Rodapé: avatar com iniciais, nome, papel traduzido (Administrador, Engenheiro, …) e botão Sair.
- Estilizada com tokens `--sidebar-*` existentes; funciona nos dois temas.
- Mobile: vira drawer (overlay) acionado por botão hambúrguer.

### Header do dashboard (`HeaderDashboard`)

- Título "Dashboard".
- Filtro de período: Hoje / 7 dias / 30 dias / 90 dias / Ano — grava em query string (`?periodo=30d`), default 30d.
- Busca: filtra a tabela de últimos orçamentos (client-side).
- Botão "Novo Orçamento" → `/obras?novo=1` (abre o fluxo de criação existente).
- Toggle tema ☀️/🌙 (global) e avatar do usuário.

### Grid de conteúdo (`/dashboard`)

1. **Linha 1 — 6 cards KPI** (grid responsivo 2/3/6 colunas): Orçamentos Criados (azul, `FileText`), Em Análise (laranja, `Clock`), Aprovados (verde, `CheckCircle2`), Cancelados (vermelho, `XCircle`), Valor Total Orçado (roxo, `Banknote`), Valor Aprovado (verde, `Wallet`). Cada card: ícone em círculo colorido, valor grande, variação % vs período anterior.
2. **Linha 2:** barras "Orçamentos por Mês" (jan–dez do ano corrente, tooltip, legenda) + pizza "Status dos Orçamentos" (com %, donut).
3. **Linha 3:** linha "Evolução Financeira" (valor orçado, valor aprovado, custo previsto — mensal) + área "Conversão de Orçamentos" (criados, enviados, aprovados — mensal).
4. **Linha 4 — indicadores menores:** Ticket Médio, Maior Orçamento, Taxa de Conversão (aprovados ÷ enviados), Margem Efetiva Média.
5. **Linha 5:** tabela "Últimos Orçamentos" (código, cliente, obra, responsável, valor, data, status badge, ações) + coluna lateral com Top Clientes (nome, nº obras, valor) e Atividades Recentes (timeline do histórico).

### Tabela de últimos orçamentos

- Ordenação client-side por qualquer coluna; paginação (10/página); filtro por status (dropdown); busca do header aplica aqui.
- Badges de status com as cores do tema (verde aprovado, amarelo em análise/enviado, vermelho cancelado, cinza rascunho, azul em execução, verde-escuro concluído).
- Ações: Visualizar e Editar → `/obras/[id]`; Excluir (só admin) com dialog de confirmação, via DELETE `/api/obras/[id]` existente.

---

## 4. Estilo visual

- Bordas 16px nos cards (`rounded-2xl`), sombra leve, espaçamento generoso (`gap-6`), tipografia atual do app, ícones Lucide outline (já instalado).
- Cores de destaque conforme o prompt, expostas como CSS variables de chart em `globals.css`:
  - Light: azul #2563EB, verde #22C55E, amarelo #F59E0B, vermelho #EF4444, roxo #8B5CF6, fundo #F8FAFC.
  - Dark: azul #3B82F6, amarelo #FBBF24, fundo #0F172A, cards #1E293B.
- Tema claro/escuro global via `next-themes` (`attribute="class"`, já compatível com o `.dark` do `globals.css`), toggle no header, sem flash de tema errado.
- Animações suaves: transições de hover nos cards, animação de entrada dos gráficos (nativa do Recharts).
- Responsivo: desktop (grid completo), tablet (2 colunas), mobile (1 coluna, sidebar drawer).

---

## 5. Arquitetura

```
Server Component (page.tsx)
  → lê searchParams (?periodo=)
  → Supabase server client (RLS ativo): obras + grupos + itens + clientes + usuarios + historico
  → lib/dashboard/metricas.ts agrega com lib/calculos.ts
  → DashboardData (objeto tipado) → props dos client components
```

### Arquivos

```
lib/dashboard/
  periodo.ts            ← parse do filtro, intervalo atual + intervalo anterior
  periodo.test.ts
  metricas.ts           ← funções puras: KPIs, séries mensais, top clientes, variações
  metricas.test.ts
app/(app)/dashboard/
  page.tsx              ← Server Component
  loading.tsx           ← skeleton completo da página
app/api/dashboard/export/route.ts   ← Excel do resumo (exceljs)
components/layout/
  Sidebar.tsx  ThemeProvider.tsx  ThemeToggle.tsx
components/dashboard/
  HeaderDashboard.tsx  CardKpi.tsx
  GraficoBarrasMensal.tsx  GraficoPizzaStatus.tsx
  GraficoLinhaFinanceiro.tsx  GraficoAreaConversao.tsx
  TabelaUltimosOrcamentos.tsx  TopClientes.tsx  AtividadesRecentes.tsx
  RealtimeRefresh.tsx
```

- `DashboardData` (tipo em `lib/dashboard/metricas.ts`): kpis, seriesMensais, statusDistribuicao, evolucaoFinanceira, conversao, indicadores, ultimosOrcamentos, topClientes, atividades.
- Nenhum cálculo de negócio no cliente; componentes de gráfico recebem séries prontas.
- Nova dependência: `recharts` (única).

### Realtime

`RealtimeRefresh` (client): um canal Supabase com `postgres_changes` em `obras`, `grupos_orcamento`, `itens_orcamento` → `router.refresh()` com debounce de 2s + toast "Dados atualizados" (sonner já instalado).

### Export

- **Excel:** GET `/api/dashboard/export?periodo=…` → exceljs gera resumo (KPIs + tabela de orçamentos do período).
- **PDF:** `window.print()` com CSS `@media print` (oculta sidebar/controles, ajusta grid).

---

## 6. Estados e erros

- **Loading:** `loading.tsx` com skeletons no formato do grid (cards, retângulos de gráfico, linhas de tabela).
- **Empty state:** por seção — sem obras no período, gráficos e tabela mostram ilustração leve + texto ("Nenhum orçamento neste período") + CTA "Novo Orçamento".
- **Erro de consulta:** `error.tsx` do App Router com botão "Tentar novamente" (`reset()`).
- **Divisões por zero:** taxa de conversão e variações % retornam null → UI exibe "—".

---

## 7. Testes (Vitest, padrão existente)

- `periodo.test.ts`: cada opção de filtro gera intervalo correto + intervalo anterior equivalente; timezone/limites de dia.
- `metricas.test.ts`: KPIs com lista vazia; obras fora do período excluídas; mapeamento de status; variação % com base zero → null; séries mensais com meses sem dados = 0; top clientes ordenado por valor.
- Componentes: `CardKpi` (renderiza valor, variação positiva/negativa/null), `TabelaUltimosOrcamentos` (ordenação, paginação, filtro de status, busca, empty state), `ThemeToggle` (alterna classe).

---

## 8. Critérios de aceite

1. `/dashboard` carrega com dados reais do Supabase respeitando o filtro de período.
2. Alternância claro/escuro instantânea, sem flash, persistida entre sessões, em todas as telas.
3. Todos os números batem com as fórmulas de `lib/calculos.ts` (mesmos valores da tela de edição de orçamento).
4. Sidebar nova em todas as páginas protegidas, colapsável, com perfil e Sair funcionando.
5. Tabela ordena, pagina, filtra por status e busca; ações navegam/excluem corretamente.
6. Export Excel baixa arquivo válido; impressão gera PDF legível.
7. Alterar uma obra em outra aba atualiza o dashboard em até ~3s (realtime).
8. Responsivo em 375px, 768px e 1280px.
9. `npm run test:run` verde; `npm run build` sem erros.
