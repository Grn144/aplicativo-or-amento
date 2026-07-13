# Design — Banco de Composições (Fase B5a: Alertas e Ordenação — sem IA)

**Data:** 2026-07-13
**Status:** Aprovado para implementação
**Pré-requisito:** Fases B1 (núcleo) e B2 (restaurar versão + histórico de uso) — implementadas, mescladas na `master` e rodando em produção.

---

## 1. Contexto e escopo

O escopo original de "IA Integrada" (B5) descrevia 6 comportamentos: sugerir composições por descrição, recomendar materiais equivalentes, identificar composições semelhantes, alertar itens faltantes, sugerir atualização de preço, e indicar composições mais utilizadas. Ao analisar cada um, três NÃO precisam de LLM nem de decisão de provedor de IA — reaproveitam dados que os módulos B1/B2 já produzem:

| Comportamento original | Precisa de LLM? |
|---|---|
| Sugerir composições pela descrição digitada | Sim — fica para B5b |
| Recomendar materiais equivalentes | Sim — fica para B5b |
| Identificar composições semelhantes | Sim — fica para B5b |
| Alertar itens faltantes | **Não** — nesta fase (B5a) |
| Sugerir atualização de preço | **Não** — nesta fase (B5a) |
| Indicar composições mais utilizadas | **Não** — nesta fase (B5a) |

Esta fase (B5a) implementa os três itens que não precisam de LLM. Não há nenhuma integração de LLM no projeto (`package.json` sem SDK de IA) — a decisão de provedor/custo fica para quando a B5b for iniciada.

**Nesta fase (B5a):**
1. Alertar quando uma composição tem só material ou só mão de obra (nunca os dois ausentes — isso já é bloqueado no cadastro desde a B1).
2. Alertar, por item no editor de orçamento, quando a composição de origem já tem uma versão mais nova do que a usada no item.
3. Ordenar a biblioteca de composições por "mais utilizadas".

**Fora de escopo nesta fase:** qualquer coisa que exija LLM/embeddings (fica para B5b), import/export Excel (B3), dashboard de indicadores (B4).

---

## 2. Alerta de item incompleto

**Definição:** uma composição é "incompleta" quando tem materiais mas nenhuma mão de obra, ou mão de obra mas nenhum material. (Ter os dois vazios é impossível — a validação de criar/editar composição já exige pelo menos um dos dois, desde a B1.)

**Modal de composição (`ComposicaoModal`):** computado no client a partir dos arrays `materiais`/`maoDeObra` já carregados — sem mudança de API. Mostra um aviso discreto perto do resumo de custo direto quando incompleta.

**Biblioteca (`/composicoes`):** `GET /api/composicoes` passa a calcular `incompleta: boolean` por composição, buscando a contagem de materiais e de mão de obra por `composicao_id` (mesmo padrão de "query separada + merge em memória" já usado para `favorito`/`total_usos`) e marcando `incompleta = (materiaisCount === 0) !== (maoObraCount === 0)` — combina os dois casos (só material, só mão de obra) numa única checagem XOR.

**UI:** ícone de aviso (⚠) na linha da tabela e no modal. Nunca bloqueia salvar — é só um alerta visual.

---

## 3. Alerta de composição desatualizada

**Definição:** um item do orçamento que veio de uma composição (`composicao_id` não nulo) está "desatualizado" quando `item.composicao_versao` é menor que a versão **atual** da composição de origem. Comparação simples de número de versão — não compara custos nem snapshots (decisão explícita: mais simples, aceita falsos positivos quando a mudança de versão não afetou custo).

**Servidor (`app/(app)/obras/[id]/page.tsx`):** o select de `itens_orcamento` já embutido na busca da obra ganha o relacionamento `composicoes(versao)`, disponível apenas quando `composicao_id` não é nulo.

**Client (`TabelaOrcamento`):** para cada item, se `item.composicao_id` e `item.composicoes?.versao` existem e `item.composicao_versao < item.composicoes.versao`, mostra um ícone ao lado da descrição (nas visões técnica e comercial), com tooltip indicando a versão atual disponível vs. a versão em uso. Não altera nenhum cálculo de custo/venda/FEE/markup — é puramente um indicador visual, sem side effects.

**Fora de escopo nesta fase:** resumo/contador agregado no cabeçalho da obra (decisão do usuário — só o indicador por item).

---

## 4. Ordenar biblioteca por mais utilizadas

**UI (`ComposicoesPageClient`):** novo controle "Ordenar por" (Nome / Mais utilizadas) ao lado dos filtros já existentes (busca, disciplina, favoritos).

**API (`GET /api/composicoes`):** aceita o parâmetro `ordenar` (`'usos'` ou ausente). Como `total_usos` é calculado em memória (não é coluna do banco — resultado do merge com `composicao_usos`, já implementado na B2), a ordenação por usos acontece **depois** do merge, ordenando o array final por `total_usos` decrescente antes de devolver a resposta. Sem o parâmetro, mantém a ordenação por nome já existente (`.order('nome')` na query do Supabase).

---

## 5. Testes

As três features desta fase são comparações condicionais simples sobre dados que as APIs já entregam prontos (contagens, números de versão, contadores de uso) — não introduzem lógica de cálculo nova complexa o suficiente para justificar, a priori, uma função pura extraída com testes dedicados (diferente de B1/B2, que tinham fórmulas de custo/comparação de snapshot). Se, ao detalhar o plano de implementação, a checagem de "incompleta" ou "desatualizado" acabar sendo necessária em mais de um lugar (ex: tanto no client quanto no server), extrai-se para `lib/composicoes/` com teste; senão, fica inline nos componentes/rotas.

---

## 6. Critérios de aceite

1. Uma composição com só materiais (nenhuma mão de obra) aparece marcada como incompleta na biblioteca e no modal — e vice-versa.
2. Uma composição com materiais e mão de obra não é marcada como incompleta.
3. Um item de orçamento cuja composição de origem já está numa versão mais nova mostra o indicador de desatualizado; um item cuja composição não mudou de versão desde a inserção, não mostra.
4. Um item digitado manualmente (sem `composicao_id`) nunca mostra nenhum dos dois alertas.
5. A biblioteca ordena corretamente por "Mais utilizadas" quando selecionado, e volta a ordenar por nome quando desmarcado.
6. Nenhum cálculo de custo, venda, FEE, markup ou totais do orçamento muda em relação ao comportamento já existente (B5a é puramente informativo).
7. `npm run test:run` verde; `npx tsc --noEmit` sem erros novos.
