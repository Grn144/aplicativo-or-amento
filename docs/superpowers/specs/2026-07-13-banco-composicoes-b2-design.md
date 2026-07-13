# Design — Banco de Composições (Fase B2: restaurar versão + histórico de uso)

**Data:** 2026-07-13
**Status:** Aprovado para implementação
**Pré-requisito:** Fase B1 (núcleo) — implementada, mesclada na `master` e rodando em produção. Ver `docs/superpowers/specs/2026-07-10-banco-composicoes-nucleo-design.md`.

---

## 1. Contexto e escopo

A Fase B1 entregou o cadastro, a biblioteca com busca/favoritos, a inserção em um clique no orçamento, e um versionamento por snapshot que já grava histórico mas não permite restaurar nem mostra estatísticas de uso. Este documento cobre a Fase B2, que fecha essas duas lacunas.

**Nesta fase (B2):**
- Restaurar uma versão anterior de uma composição (criando uma nova versão, nunca reescrevendo o histórico).
- Histórico de uso: quantas vezes uma composição foi inserida em orçamentos, quando foi a última vez, e quem inseriu.

**Decisões que restringem o escopo:**
- **"Taxa de aprovação" removida do escopo.** O pedido original mencionava essa métrica, mas o sistema não tem um fluxo de aprovação por item — só um `status` de obra inteira (`rascunho`/`enviado`/`aprovado`/...). Vincular "uso aprovado" ao status da obra seria uma métrica frágil e de valor questionável nesta fase. Histórico de uso fica só com contagem, último uso e usuário.
- **Restaurar sempre cria uma nova versão.** Nunca apaga ou reescreve versões existentes — mantém o modelo append-only já estabelecido na B1 para `composicao_versoes`.
- **Histórico de uso é um log dedicado, não uma extensão de `itens_orcamento`.** `itens_orcamento` não tem colunas de data/usuário de criação, e é uma tabela central já usada por import/export/dashboard — estendê-la para isso seria invasivo. Um log de uso à parte (`composicao_usos`), gravado no momento da inserção, resolve sem tocar no schema existente.
- **Fora de escopo nesta fase (permanece para B3+):** import/export Excel de composições, dashboard de indicadores, IA integrada, anexos.

---

## 2. Modelo de dados

```sql
-- Log de uso: uma linha por inserção de composição num orçamento (append-only)
CREATE TABLE composicao_usos (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  composicao_id     uuid NOT NULL REFERENCES composicoes(id) ON DELETE CASCADE,
  composicao_versao integer NOT NULL,
  obra_id           uuid NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  usuario_id        uuid REFERENCES usuarios(id),
  criado_em         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON composicao_usos (composicao_id);
CREATE INDEX ON composicao_usos (obra_id);
```

**Semântica:** cada inserção de composição no orçamento (fluxo já existente desde a B1: `POST /api/obras/[id]/grupos/[grupoId]/itens` com `composicao_id`) grava uma linha aqui, no mesmo request que cria o item — não há relação nova com `itens_orcamento`. O log é cumulativo: se o item for depois removido do orçamento, a linha de uso permanece (a métrica é "quantas vezes já foi usada historicamente", não "quantas vezes está em uso agora").

**Derivações:**
```
total_usos = COUNT(*) FROM composicao_usos WHERE composicao_id = X
ultimo_uso = MAX(criado_em) FROM composicao_usos WHERE composicao_id = X
```

**RLS:** mesmo padrão de leitura ampla / escrita restrita a `admin`/`engenheiro`/`orçamentista` (igual `itens_write` — são os mesmos papéis que podem inserir itens no orçamento). Sem política de UPDATE/DELETE — o log é imutável, mesmo padrão de `composicao_versoes`.

---

## 3. Restaurar versão anterior

**Endpoint:** `POST /api/composicoes/[id]/versoes/[versaoId]/restaurar`, onde `versaoId` é o `id` da linha em `composicao_versoes` (não o número da versão — evita ambiguidade e é mais simples de referenciar a partir da lista já carregada no modal).

**Lógica:**
1. Busca o snapshot da versão alvo (`composicao_versoes.snapshot`: `{ composicao, materiais, mao_obra }`, formato já gravado desde a B1).
2. Extrai os campos editáveis do snapshot (`codigo`, `nome`, `disciplina_id`, `descricao_tecnica`, `unidade_id`, `produtividade`, `markup_sugerido`, `observacoes`, `tags`, `ativo`) e as listas de materiais/mão de obra (sem `id`/`composicao_id` — são regenerados no insert).
3. Reaproveita a mesma lógica de `PUT /api/composicoes/[id]` da B1 (`normalizarMateriais`/`normalizarMaoObra` de `lib/composicoes/normalizar.ts`, `composicaoMudou` de `lib/composicoes/calculos.ts`, bump de versão, novo snapshot) — restaurar é, na prática, um PUT cujo corpo vem do snapshot arquivado em vez do corpo da requisição.
4. Se o conteúdo restaurado for idêntico ao atual (`composicaoMudou` retorna `false`), não faz nada — mesma regra "salvar sem alteração não incrementa" já validada na B1.

Isso reaproveita a infraestrutura de update já construída e testada na B1, sem duplicar lógica de comparação/normalização.

**UI:** dentro do `ComposicaoModal` (já lista o histórico de versões — hoje somente leitura), cada linha da lista ganha um botão "Restaurar esta versão", exceto a versão atual (mais recente), com confirmação antes de executar. Após restaurar, o modal recarrega os dados da composição (novos campos, nova lista de materiais/mão de obra, novo item no histórico de versões).

---

## 4. Histórico de uso

**Agregado (contagem + último uso):** `GET /api/composicoes/[id]` (já existe, B1) ganha dois campos novos na resposta: `total_usos` e `ultimo_uso`, calculados via `count`/`max` sobre `composicao_usos`.

**Lista detalhada de usos:** `GET /api/composicoes/[id]/usos` — retorna `{ obra: { codigo, nome }, usuario: { nome } | null, criado_em }[]`, ordenado por data decrescente. Exibida como uma segunda seção no `ComposicaoModal`, ao lado do histórico de versões.

**Biblioteca (`/composicoes`):** a tabela ganha as colunas **"Usos"** e **"Último uso"**. `GET /api/composicoes` (lista, B1) passa a agregar a contagem por composição na mesma resposta, seguindo o mesmo padrão já usado para favoritos (query separada + merge em memória — sem N+1 por linha).

---

## 5. Permissões e testes

**Permissões:** restaurar versão segue o mesmo padrão de escrita da composição (`admin`/`engenheiro`/`orçamentista`); ler histórico de uso é aberto a todo usuário autenticado, igual o resto da biblioteca.

**Testes (Vitest):**
- Extrair a montagem do "body de atualização a partir de um snapshot" para uma função pura em `lib/composicoes/` (ex: `montarBodyDeSnapshot(snapshot)`), testável isoladamente.
- `montarBodyDeSnapshot`: dado um snapshot no formato `{ composicao, materiais, mao_obra }`, retorna os campos editáveis + listas normalizadas, sem `id`/`composicao_id`.
- Restaurar uma versão idêntica à atual não incrementa `versao` (reaproveita `composicaoMudou`, já testado — só precisa confirmar a integração).
- Restaurar uma versão diferente cria uma nova versão com o conteúdo antigo.

---

## 6. Critérios de aceite

1. Inserir uma composição num orçamento grava uma linha em `composicao_usos` com `obra_id`, `usuario_id` e `composicao_versao` corretos.
2. A biblioteca (`/composicoes`) mostra "Usos" e "Último uso" corretos para cada composição.
3. O modal de composição mostra a lista detalhada de usos (obra, usuário, data).
4. Restaurar uma versão anterior cria uma nova versão com o conteúdo daquela versão, sem apagar nenhuma versão existente.
5. Restaurar a versão que já é idêntica à atual não incrementa a versão (mesma regra de "sem alteração" da B1).
6. Editar uma composição depois de uma restauração não afeta itens já inseridos em orçamentos (mesma garantia de rastreabilidade-só da B1 — nada muda aqui, só reafirmando que a restauração não introduz uma referência viva).
7. Visualizador não consegue restaurar versão (RLS bloqueia).
8. `npm run test:run` verde; `npm run build` sem erros.
