# Design — Banco de Composições (Fase B5b: IA Integrada — Embeddings)

**Data:** 2026-07-14
**Status:** Aprovado para implementação
**Pré-requisito:** Fases B1, B2, B5a, B3 e B4 — implementadas, mescladas na `master` e rodando em produção.

---

## 1. Contexto e escopo

O escopo original de "IA Integrada" (B5) tinha 6 comportamentos; 3 não precisavam de IA e foram implementados na B5a (alerta de incompleta, alerta de desatualizada, ordenar por mais utilizadas). Os 3 restantes exigem de fato um provedor de IA/embeddings — é o que esta fase (B5b) implementa:

1. Sugerir composições pela descrição digitada.
2. Recomendar materiais equivalentes.
3. Identificar composições semelhantes.

**Insight de arquitetura:** as três funcionalidades são, no fundo, a mesma capacidade — busca por similaridade semântica em texto. Nenhuma delas precisa de um LLM de conversa (chat/geração) — só de um modelo de **embeddings**, que é mais barato, mais rápido e mais simples de operar. Essa é a decisão central desta fase: sem chamadas de "chat" a um LLM, só embeddings + busca por similaridade vetorial.

**Fora de escopo nesta fase:** qualquer explicação gerada por LLM sobre por que uma sugestão foi feita (abordagem híbrida com LLM de re-ranking, avaliada e descartada — complexidade/custo desnecessários pro valor entregue). Filtro de período, dashboards, exports — não fazem parte dessas 3 funcionalidades.

---

## 2. Arquitetura de embeddings

**Provedor:** OpenAI `text-embedding-3-small` (1536 dimensões), chamado via nova variável de ambiente `OPENAI_API_KEY` (não existe ainda — precisa ser criada e adicionada ao `.env.local`/ao ambiente de produção). Custo de referência: ~US$0,02 por 1 milhão de tokens — para o volume de texto de composições/materiais, é um custo irrisório mesmo em bibliotecas grandes.

**Armazenamento:** extensão `pgvector` habilitada no Supabase (`create extension if not exists vector`, rodada manualmente pelo usuário no SQL Editor, mesmo processo já usado pras migrations anteriores). Duas colunas novas:
- `composicoes.embedding vector(1536)` — calculado a partir de `nome || ' ' || descricao_tecnica`.
- `composicao_materiais.embedding vector(1536)` — calculado a partir de `descricao` do material.

**Quando calcula:** de forma *best-effort*, no mesmo fluxo de escrita já existente:
- `criarComposicao` (B3, `lib/composicoes/criar.ts`) — calcula e grava o embedding da composição e de cada material logo após os inserts.
- `atualizarComposicaoSeMudou` (B2, `lib/composicoes/atualizar.ts`) — recalcula o embedding da composição só se `nome` ou `descricao_tecnica` mudaram; recalcula os embeddings dos materiais sempre que a lista de materiais é reescrita (já é reescrita por inteiro a cada update, desde a B2 — não há update parcial de linha de material).
- Se a chamada à API de embeddings falhar (rede, limite de taxa, etc.), a operação principal (criar/atualizar composição) **continua e é salva normalmente** — só fica sem embedding (ou com o embedding antigo, no caso de update) até uma nova tentativa. Nunca bloqueia a escrita principal por causa desta feature secundária — mesmo princípio do log de uso não-bloqueante da B2.

**Backfill de composições existentes:** endpoint `POST /api/composicoes/backfill-embeddings` (acesso restrito a `admin`) processa em lotes todas as composições e materiais com `embedding IS NULL`. Idempotente — pode ser rodado quantas vezes forem necessárias, só processa o que ainda não tem embedding (inclusive linhas que falharam numa tentativa anterior).

**Busca por similaridade:** usa o operador de distância de cosseno do pgvector (`<=>`) em SQL. Cada busca define um limiar mínimo de similaridade (constante configurável no código, ajustável sem migration) e um teto de resultados (top 3 a top 5, dependendo da funcionalidade — detalhado abaixo).

---

## 3. Funcionalidade 1 — sugerir composições ao criar um item no orçamento

O fluxo atual de "+ Adicionar item" (`TabelaOrcamento.tsx`) cria uma linha em branco editada célula a célula via `CelulaEditavel` — um componente genérico reusado em ~12 lugares da tabela, que só dispara `onSave` no blur/Enter (não dá pra "escutar" cada tecla sem alterar esse componente compartilhado, arriscando os outros 11 usos).

**Comportamento:** a sugestão aparece **depois** que a descrição é salva (blur/Enter), só para itens que ainda não vieram de uma composição (`composicao_id === null`):

1. Usuário digita a descrição na célula do item novo e sai do campo — salva normalmente (sem mudança nesse passo).
2. Em paralelo, dispara uma busca por similaridade contra `composicoes.embedding` usando o texto digitado.
3. Se houver resultado(s) acima do limiar, aparece um aviso discreto e dispensável embaixo da linha do item: até 3 sugestões (nome da composição).
4. Clicar numa sugestão substitui o item manual pela composição escolhida — reaproveita a lógica de inserção já existente (mesma usada pelo `InserirComposicaoModal`/B1: quantidade mantida, campos recalculados a partir da composição, `composicao_id`/`composicao_versao` gravados).
5. O aviso pode ser dispensado; uma vez dispensado, não reaparece pra aquele item.

Não altera `CelulaEditavel` nem nenhum dos outros 11 usos dela — é um comportamento novo e isolado, específico da célula de descrição de itens sem composição.

---

## 4. Funcionalidade 3 — composições semelhantes ao criar uma nova

No `ComposicaoModal` (B1), só no fluxo de **criação** (`composicaoId === null` — nunca na edição):

1. Com um debounce de 300ms (mesmo padrão já usado na busca da biblioteca), dispara uma busca por similaridade contra `composicoes.embedding` usando `nome + descricao_tecnica` conforme o usuário preenche.
2. Se houver resultado(s) acima do limiar, aparece uma seção "Composições parecidas já cadastradas" abaixo dos campos de nome/descrição — até 5 resultados (código, nome, disciplina).
3. Puramente informativo — nunca bloqueia salvar. Objetivo: reduzir duplicação de composições quase idênticas na biblioteca.

---

## 5. Funcionalidade 2 — materiais equivalentes ao digitar um material

No `ComposicaoModal`, em cada linha de material (lista dinâmica dentro da composição sendo criada/editada):

1. Com o mesmo debounce de 300ms, dispara uma busca por similaridade contra `composicao_materiais.embedding` de **todas as composições da biblioteca**, excluindo os materiais da própria composição sendo editada.
2. Se houver resultado(s) acima do limiar, aparece uma lista pequena e dispensável abaixo daquele campo — até 5 resultados: descrição + fornecedor + preço unitário de referência do material encontrado.
3. Clicar numa sugestão preenche a descrição **e** o preço unitário daquela linha com os valores encontrados — só um ponto de partida, o usuário pode editar livremente depois.
4. Objetivo: padronizar nomenclatura entre composições (evitar "bloco cerâmico" vs "bloco ceramico 14x19x39" como termos diferentes pra mesma coisa) e reaproveitar referências de preço já cadastradas.

---

## 6. Testes

- Funções puras testáveis sem chamar a API real: montagem do texto a ser embeddado (`nome + descricao_tecnica`; `descricao` do material), filtragem por limiar de similaridade, corte em top-N.
- Chamada real à API de embeddings da OpenAI é mockada nos testes (padrão já usado no projeto pra qualquer integração externa — nenhuma chamada de rede real em teste automatizado).
- Sem teste de rota de API dedicado (padrão já estabelecido — nenhuma rota de `/api` no projeto tem teste próprio).

---

## 7. Critérios de aceite

1. Composição nova ganha embedding automaticamente ao ser criada (verificável na coluna `embedding`).
2. Composição editada com mudança em nome/descrição recalcula o embedding; sem mudança nesses campos, não recalcula.
3. Falha na chamada à API de embeddings nunca impede criar ou editar uma composição.
4. Backfill processa só composições/materiais com `embedding IS NULL` e é seguro rodar mais de uma vez.
5. As 3 sugestões (item no orçamento, composições semelhantes, materiais equivalentes) nunca bloqueiam a ação principal — são sempre informativas e dispensáveis.
6. Nenhuma das 12 outras células editáveis de `TabelaOrcamento.tsx` (além da descrição de item sem composição) muda de comportamento.
7. `npm run test:run` verde; `npx tsc --noEmit` sem erros novos.
