# Design — Banco de Composições (Fase B4: Dashboard de Indicadores)

**Data:** 2026-07-14
**Status:** Aprovado para implementação
**Pré-requisito:** Fases B1, B2, B5a e B3 — implementadas, mescladas na `master` e rodando em produção.

---

## 1. Contexto e escopo

O escopo original de "Banco de Composições Reutilizável" incluía um "dashboard" entre suas nove sub-funcionalidades. As fases anteriores (B1: núcleo, B2: versionamento + histórico de uso, B5a: alertas + ordenação, B3: import/export Excel) já produzem todos os dados que esse dashboard precisa mostrar — nenhuma feature nova de coleta de dados é necessária aqui, só agregação e visualização.

Este dashboard é **separado** do dashboard financeiro de orçamentos já existente (`/dashboard`, implementado em 2026-07-04) — aquele é focado em obras/valores, este é focado na saúde e no uso da biblioteca de composições.

**Nesta fase (B4):**
1. Página `/composicoes/dashboard` com 4 KPIs, 2 gráficos e 3 listas, todos com dados reais.
2. Botão "Ver indicadores" na página `/composicoes` para chegar até lá.

**Fora de escopo nesta fase:** filtro de período, export próprio (Excel/PDF), link das listas para a biblioteca filtrada, qualquer coisa que exija LLM.

---

## 2. Indicadores

| Indicador | Fonte / cálculo |
|---|---|
| Total de composições ativas | `count(composicoes) where ativo = true` |
| Composições incompletas | reaproveita `composicaoIncompleta` (B5a) — contagem + lista das 10 primeiras, ordenada por `nome` (ordem alfabética, sem critério de urgência entre elas) |
| Nunca utilizadas | composições com `total_usos = 0` (mesmo cálculo de `composicao_usos` da B2) — contagem + lista das 10 primeiras, ordenada por `criado_em` crescente (as mais antigas primeiro — maiores candidatas a revisão/remoção) |
| Itens de orçamento com composição desatualizada | contagem **global** (todas as obras) de `itens_orcamento` onde `composicao_versao < composicoes.versao` atual — mesma comparação de número de versão da B5a (que é por item, numa obra), aqui agregada em uma contagem única |
| Mais utilizadas | top 10 por `total_usos` (já ordenável desde a B5a) |
| Distribuição por disciplina | `count(composicoes) group by disciplina_id`; composições sem disciplina agrupam em "Sem disciplina" |
| Uso mensal | série fixa dos últimos 12 meses, contagem de linhas de `composicao_usos` por mês (`criado_em`) — janela fixa, sem seletor de período |

As listas (mais utilizadas, nunca utilizadas, incompletas) mostram só a informação no próprio dashboard, sem link para a biblioteca — clicar numa composição abre o `ComposicaoModal` já existente, no local, sem navegar de página.

---

## 3. Interface

**Página:** `/composicoes/dashboard` (Server Component), acessível por um botão "Ver indicadores" na página `/composicoes`, ao lado de "Exportar"/"Importar planilha"/"+ Nova composição".

**Grid de conteúdo:**

1. **Linha 1 — 4 cards KPI** (grid responsivo 2/4 colunas): Total de Composições Ativas (azul, ícone `Package`), Incompletas (laranja, `AlertTriangle`), Nunca Utilizadas (cinza, `PackageX`), Itens com Composição Desatualizada (vermelho, `RefreshCcw`). Sem variação % vs período anterior — são retratos do estado atual, não métricas de fluxo.
2. **Linha 2:** gráfico de pizza "Composições por Disciplina" + gráfico de barras "Uso Mensal" (últimos 12 meses).
3. **Linha 3 — 3 listas lado a lado**: "Mais Utilizadas" (nome, código, nº de usos), "Nunca Utilizadas" (nome, código, data de criação), "Incompletas" (nome, código, indicação de o que falta — material ou mão de obra). Cada lista mostra até 10 itens, com "+N mais" se houver mais. Cada linha é clicável e abre `ComposicaoModal` para edição no local.

**Empty state:** se não houver nenhuma composição ativa cadastrada, a página mostra uma mensagem única ("Nenhuma composição cadastrada ainda") com CTA para `/composicoes`, em vez dos 4 cards e gráficos vazios.

---

## 4. Arquitetura

Mesmo padrão do dashboard financeiro existente: Server Component + agregação em TypeScript, zero lógica de negócio duplicada em SQL.

```
Server Component (page.tsx)
  → Supabase server client: composicoes + disciplinas, composicao_usos, itens_orcamento
    (só os com composicao_id, com o relacionamento composicoes(versao))
  → lib/composicoes/dashboard-metricas.ts agrega tudo em funções puras
  → DashboardComposicoesData (objeto tipado) → props dos client components
```

**Arquivos:**

```
lib/composicoes/
  dashboard-metricas.ts       ← funções puras: KPIs, top-10 mais utilizadas, nunca
                                  utilizadas, incompletas, distribuição por disciplina,
                                  série mensal de uso, contagem de itens desatualizados
  dashboard-metricas.test.ts
app/(app)/composicoes/dashboard/
  page.tsx                    ← Server Component
components/composicoes/dashboard/
  CardKpiComposicoes.tsx      ← card simples (título + ícone + valor), sem variação %
                                  (não reaproveita CardKpi do dashboard financeiro, que
                                  sempre mostra "vs período anterior" — não se aplica aqui)
  GraficoPizzaDisciplinas.tsx ← reaproveita CardGrafico (components/dashboard/CardGrafico.tsx)
  GraficoBarrasUsoMensal.tsx  ← reaproveita CardGrafico
  ListaComposicoes.tsx        ← lista reutilizável (título + até 10 itens + "+N mais"),
                                  usada 3x com conteúdo diferente por linha; clicar numa
                                  linha abre o ComposicaoModal já existente
```

- `DashboardComposicoesData` (tipo em `dashboard-metricas.ts`): `totalAtivas: number`, `incompletas: {count: number, lista: ComposicaoResumo[]}`, `nuncaUtilizadas: {count: number, lista: ComposicaoResumo[]}`, `itensDesatualizados: number`, `maisUtilizadas: ComposicaoResumo[]`, `porDisciplina: {nome: string, quantidade: number}[]`, `usoMensal: {mes: string, quantidade: number}[]`.
- Contagem de itens desatualizados: query única em `itens_orcamento` (todas as obras) trazendo `composicao_id, composicao_versao, composicoes(versao)`, filtrando em TypeScript onde `composicao_versao < composicoes.versao` — mesma comparação já usada por item na B5a (`TabelaOrcamento.tsx`), agora agregada globalmente.
- `ComposicaoModal` é reaproveitado sem alteração: a página do dashboard mantém estado local (id da composição selecionada) e abre o modal já existente ao clicar numa linha de qualquer lista.
- Sem nova dependência (`recharts` já instalado desde o dashboard financeiro).
- Sem migration nova — nenhuma tabela/coluna nova, só leitura do que já existe.

---

## 5. Testes

`dashboard-metricas.test.ts` cobre cada função pura isoladamente:
- Total de ativas com lista vazia.
- Incompletas via XOR material/mão-de-obra (reaproveitando `composicaoIncompleta`).
- Nunca utilizadas = `total_usos === 0`.
- Distribuição por disciplina agrupa corretamente, incluindo composições sem disciplina agrupadas em "Sem disciplina".
- Série mensal preenche meses sem uso com 0 (nunca omite um mês).
- Itens desatualizados conta só quando `composicao_versao < versao atual` (nunca quando são iguais).
- Top-10 mais utilizadas ordena por `total_usos` decrescente e corta em 10.

Sem teste de API route — não há rota nova; a página consulta o Supabase diretamente, como o dashboard financeiro já faz.

---

## 6. Critérios de aceite

1. `/composicoes/dashboard` carrega com dados reais do Supabase, sem números fictícios.
2. Os 4 KPIs batem exatamente com os mesmos critérios já usados em B2/B5a (`total_usos`, `incompleta`, versão desatualizada) — mesmos números que apareceriam contando manualmente na biblioteca.
3. Gráfico de disciplina mostra todas as disciplinas com pelo menos 1 composição; composições sem disciplina aparecem como "Sem disciplina".
4. Gráfico de uso mensal mostra os últimos 12 meses, incluindo meses com 0 usos.
5. As 3 listas mostram no máximo 10 itens cada, com indicação de quantos mais existem quando aplicável.
6. Clicar em qualquer composição listada abre o `ComposicaoModal` existente, permitindo editar ali mesmo.
7. Botão "Ver indicadores" na página `/composicoes` navega para `/composicoes/dashboard`.
8. Biblioteca vazia (nenhuma composição ativa) mostra o empty state com CTA, não os 4 cards zerados.
9. `npm run test:run` verde; `npx tsc --noEmit` sem erros novos.
