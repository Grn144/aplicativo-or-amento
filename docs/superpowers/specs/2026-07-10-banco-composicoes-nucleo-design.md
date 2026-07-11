# Design — Banco de Composições Reutilizável (Fase B1: Núcleo)

**Data:** 2026-07-10
**Status:** Aprovado para implementação

---

## 1. Contexto e escopo

O pedido original descreve um módulo completo de Banco de Composições (cadastro, estrutura, inserção em um clique, biblioteca inteligente, favoritos, histórico de uso, IA integrada, versionamento com restauração, integração com Excel, dashboard). É grande demais para uma única spec — este documento cobre apenas a **Fase B1: núcleo**, que serve de fundação para as fases seguintes.

**Nesta fase (B1):**
- Cadastro completo da composição + estrutura (materiais e mão de obra)
- Biblioteca com busca/filtros e favoritos
- Inserção em um clique no orçamento
- Histórico de versões por snapshot (sem restaurar ainda)

**Fora de escopo nesta fase (fases futuras B2+):**
- B2: restaurar versão anterior; histórico de uso (contagem, último uso, usuário, taxa de aprovação)
- B3: importação/exportação Excel de composições
- B4: dashboard de indicadores (mais utilizadas, economia de tempo, custo médio, margem média)
- B5: IA integrada (sugestão automática por descrição, materiais equivalentes, composições similares, alerta de preço desatualizado)

**Decisões que restringem o escopo:**
- Composição **não** tem Equipamentos nem Serviços Terceirizados — só Materiais e Mão de obra, espelhando os dois buckets de custo que `itens_orcamento` já tem (`custo_unit_material`, `custo_unit_mao_obra`). Isso evita migration nesses campos e mantém 1 composição = 1 item ao inserir.
- "Categoria" e "Disciplina" são o mesmo campo — reusa a tabela `disciplinas` já existente, sem taxonomia duplicada.
- Só existe **markup sugerido** (multiplicador), não "margem padrão" (%) — consistente com o modelo de markup já adotado em `itens_orcamento` (ver [[modelo-orcamento-rs-fee-item]]).
- Sem anexos nesta fase (evita integração com Supabase Storage antes de validar o núcleo).
- Sem cadastro de fornecedores/cargos — ambos texto livre nas linhas de material/mão de obra.

---

## 2. Modelo de dados

```sql
-- Composições (cadastro principal)
composicoes (
  id                uuid PK,
  codigo            text NOT NULL UNIQUE,        -- digitado pelo usuário (reaproveita códigos de planilhas antigas)
  nome              text NOT NULL,
  disciplina_id     uuid FK → disciplinas,        -- categoria = disciplina (reuso, sem campo duplicado)
  descricao_tecnica text NOT NULL,
  unidade_id        uuid FK → unidades_medida,
  produtividade     text,                         -- texto livre, só informativo (ex: "0,5 m²/h"), não entra em cálculo
  custo_direto      numeric(15,4) NOT NULL DEFAULT 0,  -- derivado: Σ materiais + Σ mão de obra, por 1 unidade de referência
  markup_sugerido   numeric(8,4) NOT NULL DEFAULT 1,
  observacoes       text,
  tags              text[],
  versao            integer NOT NULL DEFAULT 1,
  ativo             boolean NOT NULL DEFAULT true,
  responsavel_id    uuid FK → usuarios,
  criado_em         timestamptz DEFAULT now(),
  atualizado_em     timestamptz DEFAULT now()
)

-- Materiais da composição (quantidade por 1 unidade de referência da composição)
composicao_materiais (
  id              uuid PK,
  composicao_id   uuid FK → composicoes ON DELETE CASCADE,
  descricao       text NOT NULL,
  quantidade      numeric(15,4) NOT NULL,
  unidade_id      uuid FK → unidades_medida,
  fornecedor      text,                           -- texto livre
  preco_unitario  numeric(15,4) NOT NULL,
  ordem           integer NOT NULL
)

-- Mão de obra da composição (horas por 1 unidade de referência da composição)
composicao_mao_obra (
  id              uuid PK,
  composicao_id   uuid FK → composicoes ON DELETE CASCADE,
  cargo           text NOT NULL,                  -- texto livre
  horas           numeric(15,4) NOT NULL,
  custo_hora      numeric(15,4) NOT NULL,
  ordem           integer NOT NULL
)

-- Snapshot de versão (gravado a cada save com alteração)
composicao_versoes (
  id             uuid PK,
  composicao_id  uuid FK → composicoes ON DELETE CASCADE,
  versao         integer NOT NULL,
  snapshot       jsonb NOT NULL,                  -- composição + materiais + mão de obra completos naquele momento
  usuario_id     uuid FK → usuarios,
  criado_em      timestamptz DEFAULT now()
)

-- Favoritos por usuário
composicoes_favoritas (
  usuario_id     uuid FK → usuarios,
  composicao_id  uuid FK → composicoes,
  criado_em      timestamptz DEFAULT now(),
  PRIMARY KEY (usuario_id, composicao_id)
)
```

**Alteração em `itens_orcamento`** (rastreabilidade de origem, prepara terreno para B5 sem nova migration depois):

```sql
ALTER TABLE itens_orcamento
  ADD COLUMN composicao_id      uuid NULL REFERENCES composicoes(id),
  ADD COLUMN composicao_versao  integer NULL;
```

Nullable — itens digitados manualmente continuam sem referência.

RLS: as tabelas novas seguem o mesmo padrão de `disciplinas`/`unidades_medida` (leitura ampla para usuários autenticados, escrita restrita por papel — ver seção 6).

---

## 3. Cálculo e inserção no orçamento

**Ao salvar a composição**, `custo_direto` é recalculado:

```
custo_direto = Σ(material.quantidade × material.preco_unitario) + Σ(mao_obra.horas × mao_obra.custo_hora)
```

**Ao inserir a composição num orçamento** (usuário escolhe grupo/disciplina de destino + quantidade), o item criado em `itens_orcamento` recebe:

```
custo_unit_material  = Σ(material.quantidade × material.preco_unitario)   -- por 1 unidade
custo_unit_mao_obra  = Σ(mao_obra.horas × mao_obra.custo_hora)            -- por 1 unidade
markup_material = markup_mao_obra = composicao.markup_sugerido
descricao       = composicao.descricao_tecnica
unidade_id      = composicao.unidade_id
composicao_id, composicao_versao = referência para rastreabilidade
quantidade      = valor digitado pelo usuário no momento da inserção
numero, ordem   = próximos sequenciais dentro do grupo de destino
```

`fee_mao_obra`/`fee_material` do item ficam `null` (herda o `fee_fator` da obra, igual a um item digitado manualmente). `local` e `observacao`/`observacao_2` ficam em branco — são específicos do orçamento, preenchidos pelo usuário depois de inserir.

O cálculo de subtotal/venda já existente em `lib/calculos.ts` (`custo_unit × quantidade`) não muda — os "horas por cargo" e "quantidade de material" da composição já são valores **por 1 unidade de referência**, então escalam automaticamente pela quantidade do item no orçamento sem lógica nova.

---

## 4. Biblioteca, busca e favoritos

- Busca por texto livre (nome, código, descrição técnica) via `ILIKE` sobre os três campos.
- Filtros: disciplina, tags, "só favoritos".
- Resultado instantâneo (debounce no client + query no backend).
- Favoritos: toggle por usuário (estrela) gravado em `composicoes_favoritas`; filtro "Meus favoritos" na mesma tela.

---

## 5. Versionamento (nesta fase)

- Toda vez que a composição é salva com alteração (nos campos da composição, materiais ou mão de obra), `composicoes.versao` incrementa e um snapshot completo (JSON) é gravado em `composicao_versoes`.
- **Não há** ação de restaurar nesta fase — só listagem (versão, usuário, data). Restaurar fica para B2, já com o dado histórico disponível.

---

## 6. Interface

**`/composicoes`** (nova página de nível superior):
- Barra de busca instantânea + filtros (disciplina, tags, favoritos)
- Tabela densa: código, nome, disciplina, unidade, custo direto, markup sugerido, versão, estrela de favorito
- Botão "Nova composição" → abre modal de criação
- Clique na linha → modal de edição/detalhe

**Modal de composição** (criar/editar):
- Campos do cadastro: código, nome, disciplina, unidade, descrição técnica, produtividade, markup sugerido, observações, tags
- Duas sub-listas em árvore: **Materiais** (descrição, qtd, unidade, fornecedor, preço unit.) e **Mão de obra** (cargo, horas, custo-hora) — adicionar/remover linha inline, com `custo_direto` recalculando ao vivo
- Seção "Histórico de versões" (somente leitura: versão, usuário, data)

**Dentro do editor de orçamento (`/obras/[id]`)**:
- Botão "Inserir Composição" abre painel/modal com a mesma busca da biblioteca
- Ao escolher: seletor de grupo/disciplina de destino + campo de quantidade → botão "Inserir" cria o item

**Permissões:** mesmo padrão de `disciplinas`/`unidades_medida` — admin e engenheiro/orçamentista podem criar/editar/excluir composições e inserir no orçamento; visualizador só vê/busca (não edita composição nem insere item, já que também não edita orçamento).

---

## 7. Testes (Vitest)

- Agregação: soma de materiais + mão de obra → `custo_direto` correto
- Mapeamento na inserção: item criado com `custo_unit_material`/`custo_unit_mao_obra`/`markup_*` corretos a partir da composição escolhida
- Versionamento: salvar composição com alteração incrementa `versao` e grava snapshot; salvar sem alteração não incrementa
- Busca: filtro por disciplina/tags/favoritos retorna o resultado esperado
- RLS: visualizador não consegue criar/editar composição nem inserir item

---

## 8. Critérios de aceite

1. Cadastrar uma composição com N materiais e M cargos de mão de obra, salvar, e ver `custo_direto` correto.
2. Buscar por nome, código, disciplina e tag retorna os resultados esperados.
3. Marcar/desmarcar favorito persiste por usuário.
4. Inserir uma composição num orçamento cria um item com os campos mapeados corretamente (seção 3), rastreável via `composicao_id`/`composicao_versao`.
5. Editar uma composição já usada em orçamentos não altera itens já inseridos (o item guarda os valores calculados no momento da inserção, não uma referência viva).
6. Editar e salvar uma composição gera nova versão com snapshot completo; histórico de versões lista corretamente.
7. Visualizador não consegue criar, editar ou inserir composições.
8. `npm run test:run` verde; `npm run build` sem erros.
