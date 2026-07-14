# Banco de Composições — Fase B5b (IA Integrada — Embeddings) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sugerir composições pela descrição digitada (no orçamento), identificar composições semelhantes (ao criar uma nova) e recomendar materiais equivalentes (ao digitar um material) — as 3 últimas funcionalidades de "IA Integrada" do Banco de Composições, todas construídas sobre a mesma capacidade: busca por similaridade semântica via embeddings (sem LLM de chat).

**Architecture:** `text-embedding-3-small` da OpenAI gera vetores de 1536 dimensões, armazenados em colunas `vector` (pgvector) em `composicoes` e `composicao_materiais`, calculados de forma *best-effort* no mesmo fluxo de escrita já existente (`criarComposicao` da B3, `atualizarComposicaoSeMudou` da B2) — nunca bloqueiam a operação principal se falharem. Duas funções SQL (`match_composicoes`/`match_materiais`) fazem a busca de vizinhos mais próximos no Postgres; o filtro por limiar de similaridade e o corte em top-N acontecem em TypeScript (lógica pura, testável). As 3 funcionalidades de UI reaproveitam um componente de sugestão único (`ListaSugestoesSemelhantes`) e duas rotas de busca (`/api/composicoes/semelhantes`, `/api/composicoes/materiais-semelhantes`).

**Tech Stack:** Next.js 15 (App Router) + TypeScript, Supabase (Postgres + pgvector), OpenAI SDK (`openai`, novo pacote), Tailwind + shadcn/ui, Vitest.

## Global Constraints

- **`OPENAI_API_KEY` é um pré-requisito de ambiente, não de código.** Nenhuma task cria essa variável — ela precisa existir em `.env.local` (e em produção) antes de qualquer teste ao vivo funcionar. Sem ela, `gerarEmbedding` retorna `null` (nunca lança erro), então o app continua funcionando normalmente, só sem embeddings.
- `gerarEmbedding` (Task 2) **nunca lança exceção** — qualquer falha (chave ausente, rede, limite de taxa) retorna `null`. Todo código que a chama trata `null` como "não foi possível, segue sem bloquear".
- O limiar de similaridade (`LIMIAR_SIMILARIDADE = 0.75`) e o corte em top-N vivem em TypeScript (`lib/composicoes/embeddings-texto.ts`), não em SQL — as funções SQL (`match_composicoes`/`match_materiais`) só trazem os vizinhos mais próximos (sem filtro de qualidade), pra manter a lógica de "isso é bom o suficiente pra mostrar" pura e testável sem precisar de banco.
- Funcionalidade 3 (composições semelhantes) só aparece ao **criar** uma composição nova (`composicaoId === null`) — nunca ao editar uma existente.
- Funcionalidade 1 (sugerir no orçamento) **nunca modifica `CelulaEditavel`** nem nenhum dos outros 11 usos dela em `TabelaOrcamento.tsx` — é um comportamento novo e isolado, adicionado só à volta da célula de descrição de itens sem composição.
- Nenhuma rota de API desta fase tem teste automatizado (padrão já estabelecido). As modificações em `criar.ts`/`atualizar.ts` também não ganham teste novo (mesmo padrão já estabelecido pra esses dois arquivos). Só `lib/composicoes/embeddings-texto.ts` (lógica pura) tem testes — `lib/embeddings/gerar.ts` (chamada real à API) não é testado automaticamente, seguindo o padrão do projeto de nunca fazer chamada de rede real em teste.
- Sem geração de texto explicativo por LLM em nenhuma sugestão — só busca por similaridade e exibição direta dos resultados.

---

### Task 1: Migration — pgvector + colunas de embedding + funções SQL de busca

**Files:**
- Create: `supabase/migrations/012_embeddings_composicoes.sql`

**Interfaces:**
- Produces: colunas `composicoes.embedding`/`composicao_materiais.embedding` (tipo `vector(1536)`), e as funções SQL `match_composicoes(query_embedding, limite)` e `match_materiais(query_embedding, limite, excluir_composicao_id)` — usadas pelas Tasks 7 e 8 via `supabase.rpc(...)`.

- [ ] **Step 1: Escrever a migration**

Crie `supabase/migrations/012_embeddings_composicoes.sql`:

```sql
-- 012_embeddings_composicoes.sql
-- Fase B5b do Banco de Composições Reutilizável: busca por similaridade
-- semântica via embeddings (OpenAI text-embedding-3-small, 1536 dimensões).
-- Ver docs/superpowers/specs/2026-07-14-banco-composicoes-b5b-design.md
--
-- Sem índice ivfflat de propósito: no volume de dados esperado (biblioteca
-- de composições de uma empresa, não multi-tenant em larga escala), um scan
-- sequencial com o operador de distância de cosseno é rápido o suficiente,
-- e o ivfflat exige ajuste do parâmetro `lists` que só faz sentido depois de
-- conhecer o volume real de dados. Pode ser adicionado depois sem quebrar
-- nada caso a biblioteca cresça muito.

create extension if not exists vector;

alter table composicoes add column embedding vector(1536);
alter table composicao_materiais add column embedding vector(1536);

-- Busca as composições ativas com embedding mais próximas (menor distância
-- de cosseno) do embedding de consulta. Não aplica limiar de qualidade nem
-- decide quantas mostrar de fato — isso é responsabilidade da camada
-- TypeScript (lib/composicoes/embeddings-texto.ts), que filtra o resultado
-- bruto desta função por LIMIAR_SIMILARIDADE e corta em top-N.
create or replace function match_composicoes(
  query_embedding vector(1536),
  limite int
)
returns table (
  id uuid,
  codigo text,
  nome text,
  disciplina_nome text,
  similaridade float
)
language sql stable
as $$
  select
    c.id, c.codigo, c.nome,
    d.nome as disciplina_nome,
    1 - (c.embedding <=> query_embedding) as similaridade
  from composicoes c
  left join disciplinas d on d.id = c.disciplina_id
  where c.ativo = true
    and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit limite;
$$;

-- Busca materiais (de qualquer composição ativa) com embedding mais próximo
-- do embedding de consulta, opcionalmente excluindo os materiais de uma
-- composição específica (a que está sendo editada, pra não sugerir ela
-- mesma). Mesma filosofia da função acima: sem limiar de qualidade aqui.
create or replace function match_materiais(
  query_embedding vector(1536),
  limite int,
  excluir_composicao_id uuid
)
returns table (
  descricao text,
  fornecedor text,
  preco_unitario numeric,
  similaridade float
)
language sql stable
as $$
  select
    m.descricao, m.fornecedor, m.preco_unitario,
    1 - (m.embedding <=> query_embedding) as similaridade
  from composicao_materiais m
  join composicoes c on c.id = m.composicao_id
  where c.ativo = true
    and m.embedding is not null
    and (excluir_composicao_id is null or m.composicao_id <> excluir_composicao_id)
  order by m.embedding <=> query_embedding
  limit limite;
$$;
```

- [ ] **Step 2: Rodar a migration no Supabase**

Cole o conteúdo do arquivo no SQL Editor do Supabase e rode. Confirme sem erro — `create extension if not exists vector` precisa que a extensão esteja disponível no projeto Supabase (já vem habilitada por padrão em projetos Supabase modernos; se der erro de permissão, é preciso habilitar a extensão "vector" pela aba Database > Extensions do painel do Supabase antes de rodar a migration).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/012_embeddings_composicoes.sql
git commit -m "feat: migration de embeddings (pgvector) para composicoes e materiais"
```

---

### Task 2: `lib/embeddings/gerar.ts` — wrapper da API de embeddings da OpenAI

**Files:**
- Create: `lib/embeddings/gerar.ts`
- Modify: `package.json` (via `npm install openai`)

**Interfaces:**
- Produces: `gerarEmbedding(texto: string): Promise<number[] | null>` — usado pelas Tasks 4, 5, 6, 7, 8. Nunca lança exceção.

- [ ] **Step 1: Instalar o SDK oficial da OpenAI**

Run: `npm install openai`
Expected: adiciona `openai` a `package.json`/`package-lock.json`, sem erro.

- [ ] **Step 2: Criar `lib/embeddings/gerar.ts`**

```typescript
// lib/embeddings/gerar.ts
import OpenAI from 'openai'

const MODELO = 'text-embedding-3-small'

let cliente: OpenAI | null = null

function obterCliente(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  if (!cliente) cliente = new OpenAI({ apiKey })
  return cliente
}

/** Gera o embedding de um texto via OpenAI. Nunca lança — retorna null em
 * qualquer falha (chave ausente, erro de rede, limite de taxa, texto vazio
 * etc.), pra nunca bloquear a operação principal (criar/editar composição,
 * ou uma busca por similaridade) por causa desta feature secundária. */
export async function gerarEmbedding(texto: string): Promise<number[] | null> {
  const textoLimpo = texto.trim()
  if (!textoLimpo) return null

  const clienteOpenAI = obterCliente()
  if (!clienteOpenAI) {
    console.error('OPENAI_API_KEY não configurada — embedding não gerado')
    return null
  }

  try {
    const resposta = await clienteOpenAI.embeddings.create({ model: MODELO, input: textoLimpo })
    return resposta.data[0]?.embedding ?? null
  } catch (erro) {
    console.error('Falha ao gerar embedding:', erro instanceof Error ? erro.message : erro)
    return null
  }
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 4: Verificação manual (opcional, requer `OPENAI_API_KEY` configurada)**

Se `OPENAI_API_KEY` já estiver disponível no ambiente, rode um teste manual rápido (ex.: um script temporário chamando `gerarEmbedding('teste')` e conferindo que retorna um array de 1536 números). Se a chave ainda não estiver configurada, pule este passo — a função já foi projetada pra nunca quebrar nesse caso (retorna `null`), então não há como testar de ponta a ponta antes da chave existir.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json lib/embeddings/gerar.ts
git commit -m "feat: wrapper de geracao de embeddings via OpenAI"
```

---

### Task 3: `lib/composicoes/embeddings-texto.ts` — texto a embeddar + filtro de similaridade

**Files:**
- Create: `lib/composicoes/embeddings-texto.ts`
- Create: `lib/composicoes/embeddings-texto.test.ts`

**Interfaces:**
- Produces: `textoEmbeddingComposicao(nome, descricaoTecnica): string`, `textoEmbeddingMaterial(descricao): string`, `LIMIAR_SIMILARIDADE: number`, `filtrarPorSimilaridade<T>(resultados, limiar?, limite?): T[]` — usados pelas Tasks 4, 5, 6, 7, 8.

- [ ] **Step 1: Escrever os testes (falhando)**

Crie `lib/composicoes/embeddings-texto.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  textoEmbeddingComposicao,
  textoEmbeddingMaterial,
  filtrarPorSimilaridade,
  LIMIAR_SIMILARIDADE,
} from './embeddings-texto'

describe('textoEmbeddingComposicao', () => {
  it('junta nome e descrição técnica com espaço', () => {
    expect(textoEmbeddingComposicao('Alvenaria', 'Execução de alvenaria de blocos')).toBe(
      'Alvenaria Execução de alvenaria de blocos'
    )
  })

  it('remove espaços extras nas pontas de cada campo', () => {
    expect(textoEmbeddingComposicao('  Alvenaria  ', '  Descrição  ')).toBe('Alvenaria Descrição')
  })
})

describe('textoEmbeddingMaterial', () => {
  it('retorna a descrição sem espaços nas pontas', () => {
    expect(textoEmbeddingMaterial('  Bloco cerâmico  ')).toBe('Bloco cerâmico')
  })
})

describe('filtrarPorSimilaridade', () => {
  it('remove resultados abaixo do limiar', () => {
    const resultados = [{ id: 'a', similaridade: 0.9 }, { id: 'b', similaridade: 0.5 }]
    expect(filtrarPorSimilaridade(resultados, 0.75)).toEqual([{ id: 'a', similaridade: 0.9 }])
  })

  it('ordena do mais parecido pro menos parecido', () => {
    const resultados = [{ id: 'a', similaridade: 0.8 }, { id: 'b', similaridade: 0.95 }]
    expect(filtrarPorSimilaridade(resultados, 0.75).map(r => r.id)).toEqual(['b', 'a'])
  })

  it('corta no limite informado', () => {
    const resultados = [
      { id: 'a', similaridade: 0.95 },
      { id: 'b', similaridade: 0.9 },
      { id: 'c', similaridade: 0.85 },
    ]
    expect(filtrarPorSimilaridade(resultados, 0.75, 2).map(r => r.id)).toEqual(['a', 'b'])
  })

  it('sem limite informado, retorna todos os que passam no limiar', () => {
    const resultados = [{ id: 'a', similaridade: 0.95 }, { id: 'b', similaridade: 0.9 }]
    expect(filtrarPorSimilaridade(resultados, 0.75).map(r => r.id)).toEqual(['a', 'b'])
  })

  it('usa o limiar padrão (LIMIAR_SIMILARIDADE) quando não informado', () => {
    const resultados = [{ id: 'a', similaridade: LIMIAR_SIMILARIDADE - 0.01 }]
    expect(filtrarPorSimilaridade(resultados)).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run lib/composicoes/embeddings-texto.test.ts`
Expected: FAIL — o módulo `./embeddings-texto` não existe ainda.

- [ ] **Step 3: Implementar `lib/composicoes/embeddings-texto.ts`**

```typescript
// lib/composicoes/embeddings-texto.ts

/** Texto usado pra gerar o embedding de uma composição — nome + descrição
 * técnica é o que melhor representa "o que essa composição faz". */
export function textoEmbeddingComposicao(nome: string, descricaoTecnica: string): string {
  return `${nome.trim()} ${descricaoTecnica.trim()}`.trim()
}

/** Texto usado pra gerar o embedding de um material — só a descrição. */
export function textoEmbeddingMaterial(descricao: string): string {
  return descricao.trim()
}

/** Limiar mínimo de similaridade de cosseno (0 a 1) pra considerar um
 * resultado relevante o suficiente pra mostrar como sugestão. Valor inicial
 * empírico pro text-embedding-3-small em descrições técnicas curtas em
 * português — ajustável aqui sem precisar de migration. */
export const LIMIAR_SIMILARIDADE = 0.75

export interface ResultadoComSimilaridade {
  similaridade: number
}

/** Filtra um resultado bruto de busca por similaridade (já ordenado por
 * proximidade pela função SQL match_composicoes/match_materiais, mas sem
 * filtro de qualidade) pelo limiar mínimo, reordena por similaridade
 * decrescente (defensivo — não confia na ordem vinda do banco) e corta em
 * até `limite` resultados. */
export function filtrarPorSimilaridade<T extends ResultadoComSimilaridade>(
  resultados: T[],
  limiar: number = LIMIAR_SIMILARIDADE,
  limite?: number
): T[] {
  const filtrados = [...resultados]
    .filter(r => r.similaridade >= limiar)
    .sort((a, b) => b.similaridade - a.similaridade)
  return limite !== undefined ? filtrados.slice(0, limite) : filtrados
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run lib/composicoes/embeddings-texto.test.ts`
Expected: PASS (todos os 7 testes).

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 6: Commit**

```bash
git add lib/composicoes/embeddings-texto.ts lib/composicoes/embeddings-texto.test.ts
git commit -m "feat: texto de embedding e filtro de similaridade (logica pura)"
```

---

### Task 4: Gerar embedding ao criar uma composição

**Files:**
- Modify: `lib/composicoes/criar.ts`

**Interfaces:**
- Consumes: `gerarEmbedding` (Task 2), `textoEmbeddingComposicao`/`textoEmbeddingMaterial` (Task 3).

- [ ] **Step 1: Adicionar os imports**

Em `lib/composicoes/criar.ts`, adicione ao topo do arquivo (após os imports já existentes):

```typescript
import { gerarEmbedding } from '@/lib/embeddings/gerar'
import { textoEmbeddingComposicao, textoEmbeddingMaterial } from './embeddings-texto'
```

- [ ] **Step 2: Calcular e gravar os embeddings antes do `return` final**

`criarComposicao` termina assim atualmente:

```typescript
  const { error: erroVersao } = await supabase.from('composicao_versoes').insert({
    composicao_id: composicao.id,
    versao: 1,
    snapshot: { composicao, materiais: resMateriais.data, mao_obra: resMaoObra.data },
    usuario_id: usuarioId,
  })
  if (erroVersao) return { status: 500, body: { error: erroVersao.message } }

  return {
    status: 201,
    body: { ...composicao, composicao_materiais: resMateriais.data, composicao_mao_obra: resMaoObra.data },
  }
}
```

Substitua por (adiciona o bloco de embeddings entre o insert da versão e o `return`):

```typescript
  const { error: erroVersao } = await supabase.from('composicao_versoes').insert({
    composicao_id: composicao.id,
    versao: 1,
    snapshot: { composicao, materiais: resMateriais.data, mao_obra: resMaoObra.data },
    usuario_id: usuarioId,
  })
  if (erroVersao) return { status: 500, body: { error: erroVersao.message } }

  // Embeddings (B5b): melhor-esforço, nunca falha a criação da composição
  // por causa disso — se a API de embeddings falhar, a composição fica sem
  // embedding até o próximo backfill/edição, mas já foi salva com sucesso.
  const embeddingComposicao = await gerarEmbedding(
    textoEmbeddingComposicao(composicao.nome, composicao.descricao_tecnica)
  )
  if (embeddingComposicao) {
    const { error: erroEmbedding } = await supabase
      .from('composicoes')
      .update({ embedding: embeddingComposicao })
      .eq('id', composicao.id)
    if (erroEmbedding) console.error('Falha ao gravar embedding da composição:', erroEmbedding.message)
  }
  await Promise.all(
    (resMateriais.data ?? []).map(async m => {
      const embeddingMaterial = await gerarEmbedding(textoEmbeddingMaterial(m.descricao))
      if (!embeddingMaterial) return
      const { error: erroEmbeddingMaterial } = await supabase
        .from('composicao_materiais')
        .update({ embedding: embeddingMaterial })
        .eq('id', m.id)
      if (erroEmbeddingMaterial) console.error('Falha ao gravar embedding do material:', erroEmbeddingMaterial.message)
    })
  )

  return {
    status: 201,
    body: { ...composicao, composicao_materiais: resMateriais.data, composicao_mao_obra: resMaoObra.data },
  }
}
```

- [ ] **Step 3: Verificar tipos e rodar os testes existentes**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

Run: `npx vitest run`
Expected: todos os testes existentes continuam passando (nenhum teste cobre `criarComposicao` diretamente, mas `lib/composicoes/calculos.test.ts`/`normalizar.test.ts`/`embeddings-texto.test.ts` não podem quebrar).

- [ ] **Step 4: Verificação manual**

Sem `OPENAI_API_KEY` configurada: crie uma composição pela UI (`/composicoes`) e confirme que ela é criada normalmente (a chamada de embedding falha silenciosamente, só loga no console do servidor — a composição não fica sem ser criada). Se `OPENAI_API_KEY` já estiver configurada: confirme na tabela `composicoes` do Supabase que a coluna `embedding` da composição criada não está mais `null`.

- [ ] **Step 5: Commit**

```bash
git add lib/composicoes/criar.ts
git commit -m "feat: gera embedding ao criar composicao (melhor-esforco)"
```

---

### Task 5: Recalcular embedding ao editar uma composição

**Files:**
- Modify: `lib/composicoes/atualizar.ts`

**Interfaces:**
- Consumes: `gerarEmbedding` (Task 2), `textoEmbeddingComposicao`/`textoEmbeddingMaterial` (Task 3).

- [ ] **Step 1: Adicionar os imports**

Em `lib/composicoes/atualizar.ts`, adicione ao topo (após os imports já existentes):

```typescript
import { gerarEmbedding } from '@/lib/embeddings/gerar'
import { textoEmbeddingComposicao, textoEmbeddingMaterial } from './embeddings-texto'
```

- [ ] **Step 2: Recalcular embeddings antes do `return` final do ramo "mudou"**

`atualizarComposicaoSeMudou` termina assim atualmente (dentro do ramo em que `mudou === true`):

```typescript
  const { error: erroVersao } = await supabase.from('composicao_versoes').insert({
    composicao_id: id,
    versao: novaVersao,
    snapshot: { composicao: composicaoAtualizada, materiais: resMateriais.data, mao_obra: resMaoObra.data },
    usuario_id: usuarioId,
  })
  if (erroVersao) return { status: 500, body: { error: erroVersao.message } }

  return {
    status: 200,
    body: {
      ...composicaoAtualizada,
      composicao_materiais: resMateriais.data,
      composicao_mao_obra: resMaoObra.data,
    },
  }
}
```

Substitua por:

```typescript
  const { error: erroVersao } = await supabase.from('composicao_versoes').insert({
    composicao_id: id,
    versao: novaVersao,
    snapshot: { composicao: composicaoAtualizada, materiais: resMateriais.data, mao_obra: resMaoObra.data },
    usuario_id: usuarioId,
  })
  if (erroVersao) return { status: 500, body: { error: erroVersao.message } }

  // Embeddings (B5b): melhor-esforço, igual à criação (ver lib/composicoes/criar.ts).
  // Só recalcula o embedding da composição se nome/descrição técnica mudaram
  // — evita chamada desnecessária à API quando só preço/quantidade mudou.
  // Os materiais são sempre recalculados porque a lista inteira é reescrita
  // a cada update (nunca há update parcial de uma linha de material).
  if (camposAntigos.nome !== camposNovos.nome || camposAntigos.descricao_tecnica !== camposNovos.descricao_tecnica) {
    const embeddingComposicao = await gerarEmbedding(
      textoEmbeddingComposicao(camposNovos.nome, camposNovos.descricao_tecnica)
    )
    if (embeddingComposicao) {
      const { error: erroEmbedding } = await supabase
        .from('composicoes')
        .update({ embedding: embeddingComposicao })
        .eq('id', id)
      if (erroEmbedding) console.error('Falha ao gravar embedding da composição:', erroEmbedding.message)
    }
  }
  await Promise.all(
    (resMateriais.data ?? []).map(async m => {
      const embeddingMaterial = await gerarEmbedding(textoEmbeddingMaterial(m.descricao))
      if (!embeddingMaterial) return
      const { error: erroEmbeddingMaterial } = await supabase
        .from('composicao_materiais')
        .update({ embedding: embeddingMaterial })
        .eq('id', m.id)
      if (erroEmbeddingMaterial) console.error('Falha ao gravar embedding do material:', erroEmbeddingMaterial.message)
    })
  )

  return {
    status: 200,
    body: {
      ...composicaoAtualizada,
      composicao_materiais: resMateriais.data,
      composicao_mao_obra: resMaoObra.data,
    },
  }
}
```

- [ ] **Step 3: Verificar tipos e rodar os testes existentes**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

Run: `npx vitest run`
Expected: todos os testes existentes continuam passando.

- [ ] **Step 4: Verificação manual**

Edite uma composição existente mudando só o preço de um material (sem tocar em nome/descrição técnica) — confirme que a composição salva normalmente. Se `OPENAI_API_KEY` estiver configurada, edite mudando a descrição técnica e confirme que a coluna `embedding` da composição foi atualizada (valor diferente do anterior).

- [ ] **Step 5: Commit**

```bash
git add lib/composicoes/atualizar.ts
git commit -m "feat: recalcula embedding ao editar composicao (melhor-esforco)"
```

---

### Task 6: `POST /api/composicoes/backfill-embeddings`

**Files:**
- Create: `app/api/composicoes/backfill-embeddings/route.ts`

**Interfaces:**
- Consumes: `gerarEmbedding` (Task 2), `textoEmbeddingComposicao`/`textoEmbeddingMaterial` (Task 3).

- [ ] **Step 1: Criar a rota**

```typescript
// app/api/composicoes/backfill-embeddings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { gerarEmbedding } from '@/lib/embeddings/gerar'
import { textoEmbeddingComposicao, textoEmbeddingMaterial } from '@/lib/composicoes/embeddings-texto'

// Processa em lote (até 500 por vez) todas as composições e materiais com
// embedding IS NULL — idempotente, seguro rodar quantas vezes forem
// necessárias (não recalcula o que já tem embedding). Usado pra preencher
// composições/materiais criados antes da B5b.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: usuario } = await supabase.from('usuarios').select('papel').eq('id', user.id).single()
  if (usuario?.papel !== 'admin') {
    return NextResponse.json({ error: 'Apenas administradores podem rodar o backfill' }, { status: 403 })
  }

  const { data: composicoesSemEmbedding, error: erroComposicoes } = await supabase
    .from('composicoes')
    .select('id, nome, descricao_tecnica')
    .is('embedding', null)
    .limit(500)
  if (erroComposicoes) return NextResponse.json({ error: erroComposicoes.message }, { status: 500 })

  let composicoesAtualizadas = 0
  for (const c of composicoesSemEmbedding ?? []) {
    const embedding = await gerarEmbedding(textoEmbeddingComposicao(c.nome, c.descricao_tecnica))
    if (!embedding) continue
    const { error } = await supabase.from('composicoes').update({ embedding }).eq('id', c.id)
    if (!error) composicoesAtualizadas++
  }

  const { data: materiaisSemEmbedding, error: erroMateriais } = await supabase
    .from('composicao_materiais')
    .select('id, descricao')
    .is('embedding', null)
    .limit(500)
  if (erroMateriais) return NextResponse.json({ error: erroMateriais.message }, { status: 500 })

  let materiaisAtualizados = 0
  for (const m of materiaisSemEmbedding ?? []) {
    const embedding = await gerarEmbedding(textoEmbeddingMaterial(m.descricao))
    if (!embedding) continue
    const { error } = await supabase.from('composicao_materiais').update({ embedding }).eq('id', m.id)
    if (!error) materiaisAtualizados++
  }

  return NextResponse.json({
    composicoes_processadas: composicoesSemEmbedding?.length ?? 0,
    composicoes_atualizadas: composicoesAtualizadas,
    materiais_processados: materiaisSemEmbedding?.length ?? 0,
    materiais_atualizados: materiaisAtualizados,
  })
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Verificação manual (requer `OPENAI_API_KEY`)**

Com `OPENAI_API_KEY` configurada e o servidor rodando, autenticado como admin: `POST /api/composicoes/backfill-embeddings`. Confirme que composições/materiais criados antes desta fase (sem embedding) passam a ter a coluna `embedding` preenchida. Rode de novo e confirme que `composicoes_processadas`/`materiais_processados` retornam 0 na segunda vez (nada mais pra processar).

- [ ] **Step 4: Commit**

```bash
git add app/api/composicoes/backfill-embeddings/route.ts
git commit -m "feat: rota de backfill de embeddings para composicoes existentes"
```

---

### Task 7: `GET /api/composicoes/semelhantes`

**Files:**
- Create: `app/api/composicoes/semelhantes/route.ts`

**Interfaces:**
- Consumes: `gerarEmbedding` (Task 2), `filtrarPorSimilaridade`/`LIMIAR_SIMILARIDADE` (Task 3), `match_composicoes` (Task 1, via RPC).
- Produces: endpoint `GET /api/composicoes/semelhantes?texto=&limite=` — usado pelas Tasks 10 (funcionalidade 3) e 12 (funcionalidade 1).

- [ ] **Step 1: Criar a rota**

```typescript
// app/api/composicoes/semelhantes/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { gerarEmbedding } from '@/lib/embeddings/gerar'
import { filtrarPorSimilaridade, LIMIAR_SIMILARIDADE } from '@/lib/composicoes/embeddings-texto'

// Busca composições semanticamente parecidas com o texto informado.
// ?limite= controla quantas mostrar no máximo (default 5; a funcionalidade
// 1, no editor de orçamento, pede limite=3).
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const texto = request.nextUrl.searchParams.get('texto')?.trim() ?? ''
  if (!texto) return NextResponse.json([])

  const limiteParam = Number(request.nextUrl.searchParams.get('limite'))
  const limite = Number.isFinite(limiteParam) && limiteParam > 0 ? limiteParam : 5

  const embedding = await gerarEmbedding(texto)
  if (!embedding) return NextResponse.json([])

  const { data, error } = await supabase.rpc('match_composicoes', { query_embedding: embedding, limite: 20 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(filtrarPorSimilaridade(data ?? [], LIMIAR_SIMILARIDADE, limite))
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Verificação manual (requer `OPENAI_API_KEY` e composições com embedding)**

Com o servidor rodando, autenticado, e ao menos uma composição já com embedding (Task 4 ou backfill da Task 6): `GET /api/composicoes/semelhantes?texto=<descrição parecida com uma composição existente>`. Confirme que retorna a composição esperada. Teste também `texto=<algo sem relação nenhuma>` e confirme que retorna lista vazia (abaixo do limiar).

- [ ] **Step 4: Commit**

```bash
git add app/api/composicoes/semelhantes/route.ts
git commit -m "feat: rota GET /api/composicoes/semelhantes"
```

---

### Task 8: `GET /api/composicoes/materiais-semelhantes`

**Files:**
- Create: `app/api/composicoes/materiais-semelhantes/route.ts`

**Interfaces:**
- Consumes: `gerarEmbedding` (Task 2), `filtrarPorSimilaridade`/`LIMIAR_SIMILARIDADE` (Task 3), `match_materiais` (Task 1, via RPC).
- Produces: endpoint `GET /api/composicoes/materiais-semelhantes?texto=&excluir_composicao_id=` — usado pela Task 11 (funcionalidade 2).

- [ ] **Step 1: Criar a rota**

```typescript
// app/api/composicoes/materiais-semelhantes/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { gerarEmbedding } from '@/lib/embeddings/gerar'
import { filtrarPorSimilaridade, LIMIAR_SIMILARIDADE } from '@/lib/composicoes/embeddings-texto'

// Busca materiais (de outras composições) semanticamente parecidos com o
// texto informado. ?excluir_composicao_id= evita sugerir os próprios
// materiais da composição sendo editada.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const texto = request.nextUrl.searchParams.get('texto')?.trim() ?? ''
  if (!texto) return NextResponse.json([])
  const excluirComposicaoId = request.nextUrl.searchParams.get('excluir_composicao_id') || null

  const embedding = await gerarEmbedding(texto)
  if (!embedding) return NextResponse.json([])

  const { data, error } = await supabase.rpc('match_materiais', {
    query_embedding: embedding,
    limite: 20,
    excluir_composicao_id: excluirComposicaoId,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(filtrarPorSimilaridade(data ?? [], LIMIAR_SIMILARIDADE, 5))
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Verificação manual (requer `OPENAI_API_KEY` e materiais com embedding)**

Com o servidor rodando, autenticado, e ao menos um material já com embedding: `GET /api/composicoes/materiais-semelhantes?texto=<descrição parecida com um material existente>`. Confirme o resultado esperado. Teste com `excluir_composicao_id=<id da composição desse material>` e confirme que ele não aparece mais no resultado.

- [ ] **Step 4: Commit**

```bash
git add app/api/composicoes/materiais-semelhantes/route.ts
git commit -m "feat: rota GET /api/composicoes/materiais-semelhantes"
```

---

### Task 9: `ListaSugestoesSemelhantes` — componente de sugestão reutilizável

**Files:**
- Create: `components/composicoes/ListaSugestoesSemelhantes.tsx`

**Interfaces:**
- Produces: `ListaSugestoesSemelhantes<T>` — usado pelas Tasks 10, 11 e 12.

- [ ] **Step 1: Criar o componente**

```typescript
// components/composicoes/ListaSugestoesSemelhantes.tsx
'use client'

interface Props<T> {
  titulo: string
  itens: T[]
  renderItem: (item: T) => React.ReactNode
  onSelecionar: (item: T) => void
  onDispensar: () => void
}

/** Lista dispensável de sugestões por similaridade — reaproveitada pelas 3
 * funcionalidades de IA da B5b (composições semelhantes, materiais
 * equivalentes, sugestão de composição no orçamento). Genérico em T pra
 * cada chamador decidir a forma exata do item e como renderizá-lo. */
export function ListaSugestoesSemelhantes<T>({ titulo, itens, renderItem, onSelecionar, onDispensar }: Props<T>) {
  if (itens.length === 0) return null
  return (
    <div className="space-y-1.5 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-blue-700 dark:text-blue-400">{titulo}</p>
        <button type="button" onClick={onDispensar} className="text-xs text-muted-foreground hover:text-foreground">
          Dispensar
        </button>
      </div>
      <ul className="space-y-1">
        {itens.map((item, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => onSelecionar(item)}
              className="w-full rounded-md px-2 py-1 text-left text-xs hover:bg-blue-500/10"
            >
              {renderItem(item)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add components/composicoes/ListaSugestoesSemelhantes.tsx
git commit -m "feat: componente reutilizavel de lista de sugestoes por similaridade"
```

---

### Task 10: Funcionalidade 3 — composições semelhantes no `ComposicaoModal`

**Files:**
- Modify: `components/composicoes/ComposicaoModal.tsx`

**Interfaces:**
- Consumes: `ListaSugestoesSemelhantes` (Task 9), `GET /api/composicoes/semelhantes` (Task 7).

- [ ] **Step 1: Adicionar estado**

Em `components/composicoes/ComposicaoModal.tsx`, logo após a linha `const [erro, setErro] = useState('')` (dentro do componente), adicione:

```typescript
  const [composicoesSemelhantes, setComposicoesSemelhantes] = useState<
    { id: string; codigo: string; nome: string; disciplina_nome: string | null }[]
  >([])
  const [semelhantesDispensado, setSemelhantesDispensado] = useState(false)
  const [composicaoParaVisualizar, setComposicaoParaVisualizar] = useState<string | null>(null)
```

- [ ] **Step 2: Resetar `semelhantesDispensado` quando o modal abre**

No `useEffect` existente:

```typescript
  useEffect(() => {
    if (aberto) {
      setErro('')
      carregar()
    }
  }, [aberto, carregar])
```

Substitua por:

```typescript
  useEffect(() => {
    if (aberto) {
      setErro('')
      setSemelhantesDispensado(false)
      carregar()
    }
  }, [aberto, carregar])
```

- [ ] **Step 3: Adicionar o efeito de busca por similaridade**

Logo após o `useEffect` acima, adicione:

```typescript
  useEffect(() => {
    if (composicaoId) { setComposicoesSemelhantes([]); return } // só ao criar
    if (semelhantesDispensado) return
    if (!form.nome.trim() || !form.descricao_tecnica.trim()) { setComposicoesSemelhantes([]); return }
    const timeout = setTimeout(async () => {
      const params = new URLSearchParams({ texto: `${form.nome} ${form.descricao_tecnica}` })
      const res = await fetch(`/api/composicoes/semelhantes?${params}`)
      if (res.ok) setComposicoesSemelhantes(await res.json())
    }, 300)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composicaoId, form.nome, form.descricao_tecnica, semelhantesDispensado])
```

- [ ] **Step 4: Renderizar a lista de sugestões**

Localize o campo de descrição técnica:

```tsx
            <div className="space-y-1">
              <Label htmlFor="descricao_tecnica">Descrição técnica *</Label>
              <Textarea
                id="descricao_tecnica"
                value={form.descricao_tecnica}
                onChange={e => setForm(p => ({ ...p, descricao_tecnica: e.target.value }))}
                placeholder="Ex: Instalação, configuração, alinhamento, testes e entrega operacional da câmera IP conforme normas técnicas e projeto executivo."
                rows={3}
              />
            </div>
```

Adicione logo depois (ainda antes do próximo `<div className="grid grid-cols-3 gap-4">`):

```tsx
            {!composicaoId && (
              <ListaSugestoesSemelhantes
                titulo="Composições parecidas já cadastradas"
                itens={composicoesSemelhantes}
                renderItem={c => (
                  <span>
                    <span className="font-mono text-[10px] text-muted-foreground">{c.codigo}</span>{' '}
                    {c.nome}
                    {c.disciplina_nome ? ` — ${c.disciplina_nome}` : ''}
                  </span>
                )}
                onSelecionar={c => setComposicaoParaVisualizar(c.id)}
                onDispensar={() => {
                  setSemelhantesDispensado(true)
                  setComposicoesSemelhantes([])
                }}
              />
            )}
```

- [ ] **Step 5: Renderizar o modal aninhado de visualização**

No fim do arquivo, logo antes do `</Dialog>` que fecha o componente (a última linha antes de `)` e `}`), adicione uma segunda instância do próprio `ComposicaoModal` pra visualizar a composição semelhante escolhida, sem sair do fluxo de criação atual:

```tsx
      <ComposicaoModal
        aberto={composicaoParaVisualizar !== null}
        onOpenChange={aberto => { if (!aberto) setComposicaoParaVisualizar(null) }}
        composicaoId={composicaoParaVisualizar}
        disciplinas={disciplinas}
        unidades={unidades}
        onSalvo={onSalvo}
      />
```

(Isso deve ficar dentro do `return (...)` do componente, como irmão do `<Dialog>` principal — não aninhado dentro dele.)

- [ ] **Step 6: Adicionar o import**

No topo do arquivo, junto aos outros imports de componentes:

```typescript
import { ListaSugestoesSemelhantes } from './ListaSugestoesSemelhantes'
```

- [ ] **Step 7: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 8: Verificação manual**

Com `OPENAI_API_KEY` configurada e ao menos uma composição já com embedding: abra "Nova composição", digite nome/descrição parecidos com uma composição existente, confirme que a seção "Composições parecidas já cadastradas" aparece. Clique numa sugestão e confirme que abre a composição encontrada num modal por cima, sem fechar o formulário de criação. Dispense a sugestão e confirme que ela some e não reaparece enquanto o modal estiver aberto. Abra "Editar" numa composição existente e confirme que a seção nunca aparece nesse fluxo.

- [ ] **Step 9: Commit**

```bash
git add components/composicoes/ComposicaoModal.tsx
git commit -m "feat: sugestao de composicoes semelhantes ao criar uma nova"
```

---

### Task 11: Funcionalidade 2 — materiais equivalentes no `ComposicaoModal`

**Files:**
- Modify: `components/composicoes/ComposicaoModal.tsx`

**Interfaces:**
- Consumes: `ListaSugestoesSemelhantes` (Task 9), `GET /api/composicoes/materiais-semelhantes` (Task 8).

- [ ] **Step 1: Adicionar estado**

Logo após o estado adicionado na Task 10 (`composicaoParaVisualizar`), adicione:

```typescript
  const [linhaAtivaMaterial, setLinhaAtivaMaterial] = useState<number | null>(null)
  const [materiaisSemelhantes, setMateriaisSemelhantes] = useState<
    Record<number, { descricao: string; fornecedor: string | null; preco_unitario: number }[]>
  >({})
  const [materiaisDispensados, setMateriaisDispensados] = useState<Set<number>>(new Set())
```

- [ ] **Step 2: Resetar ao abrir o modal**

No `useEffect` de abertura (já modificado na Task 10), adicione a limpeza desse estado também:

```typescript
  useEffect(() => {
    if (aberto) {
      setErro('')
      setSemelhantesDispensado(false)
      setLinhaAtivaMaterial(null)
      setMateriaisSemelhantes({})
      setMateriaisDispensados(new Set())
      carregar()
    }
  }, [aberto, carregar])
```

- [ ] **Step 3: Adicionar o efeito de busca por similaridade de material**

Logo após o efeito de composições semelhantes (adicionado na Task 10), adicione:

```typescript
  useEffect(() => {
    if (linhaAtivaMaterial === null) return
    if (materiaisDispensados.has(linhaAtivaMaterial)) return
    const material = materiais[linhaAtivaMaterial]
    const texto = material?.descricao.trim() ?? ''
    if (!texto) {
      setMateriaisSemelhantes(prev => ({ ...prev, [linhaAtivaMaterial]: [] }))
      return
    }
    const timeout = setTimeout(async () => {
      const params = new URLSearchParams({ texto })
      if (composicaoId) params.set('excluir_composicao_id', composicaoId)
      const res = await fetch(`/api/composicoes/materiais-semelhantes?${params}`)
      if (res.ok) {
        const resultado = await res.json()
        setMateriaisSemelhantes(prev => ({ ...prev, [linhaAtivaMaterial]: resultado }))
      }
    }, 300)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhaAtivaMaterial, materiais[linhaAtivaMaterial ?? -1]?.descricao, materiaisDispensados, composicaoId])
```

- [ ] **Step 4: Marcar a linha ativa e renderizar a lista de sugestões por material**

Localize o bloco inteiro que envolve cada linha de material (dentro do `materiais.map((m, i) => (...))`, dentro da seção "Materiais"):

```tsx
              {materiais.map((m, i) => (
                <div key={i} className="grid grid-cols-12 items-end gap-2 rounded-lg border border-border p-2">
                  <div className="col-span-4 space-y-1">
                    <Label className="text-xs">Descrição</Label>
                    <Input value={m.descricao} onChange={e => atualizarMaterial(i, 'descricao', e.target.value)} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Qtd.</Label>
                    <Input type="number" step="0.0001" value={m.quantidade} onChange={e => atualizarMaterial(i, 'quantidade', e.target.value)} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Unidade</Label>
                    <NativeSelect value={m.unidade_id} onChange={e => atualizarMaterial(i, 'unidade_id', e.target.value)}>
                      <option value="">—</option>
                      {unidades.map(u => <option key={u.id} value={u.id}>{u.sigla}</option>)}
                    </NativeSelect>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Fornecedor</Label>
                    <Input value={m.fornecedor} onChange={e => atualizarMaterial(i, 'fornecedor', e.target.value)} />
                  </div>
                  <div className="col-span-1 space-y-1">
                    <Label className="text-xs">Preço unit.</Label>
                    <Input type="number" step="0.0001" value={m.preco_unitario} onChange={e => atualizarMaterial(i, 'preco_unitario', e.target.value)} />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button type="button" aria-label="Remover material" onClick={() => removerMaterial(i)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
```

Substitua pelo bloco inteiro abaixo (envolve a linha existente — sem nenhuma mudança nas 6 colunas — num `<div key={i} className="space-y-1.5">` novo, junto com a lista de sugestões condicional; o campo de descrição ganha `onFocus`):

```tsx
              {materiais.map((m, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="grid grid-cols-12 items-end gap-2 rounded-lg border border-border p-2">
                    <div className="col-span-4 space-y-1">
                      <Label className="text-xs">Descrição</Label>
                      <Input
                        value={m.descricao}
                        onFocus={() => setLinhaAtivaMaterial(i)}
                        onChange={e => atualizarMaterial(i, 'descricao', e.target.value)}
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Qtd.</Label>
                      <Input type="number" step="0.0001" value={m.quantidade} onChange={e => atualizarMaterial(i, 'quantidade', e.target.value)} />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Unidade</Label>
                      <NativeSelect value={m.unidade_id} onChange={e => atualizarMaterial(i, 'unidade_id', e.target.value)}>
                        <option value="">—</option>
                        {unidades.map(u => <option key={u.id} value={u.id}>{u.sigla}</option>)}
                      </NativeSelect>
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Fornecedor</Label>
                      <Input value={m.fornecedor} onChange={e => atualizarMaterial(i, 'fornecedor', e.target.value)} />
                    </div>
                    <div className="col-span-1 space-y-1">
                      <Label className="text-xs">Preço unit.</Label>
                      <Input type="number" step="0.0001" value={m.preco_unitario} onChange={e => atualizarMaterial(i, 'preco_unitario', e.target.value)} />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <button type="button" aria-label="Remover material" onClick={() => removerMaterial(i)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                  {linhaAtivaMaterial === i && (materiaisSemelhantes[i]?.length ?? 0) > 0 && (
                    <ListaSugestoesSemelhantes
                      titulo="Materiais parecidos em outras composições"
                      itens={materiaisSemelhantes[i] ?? []}
                      renderItem={mat => (
                        <span>
                          {mat.descricao}
                          {mat.fornecedor ? ` — ${mat.fornecedor}` : ''} —{' '}
                          {mat.preco_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      )}
                      onSelecionar={mat => {
                        atualizarMaterial(i, 'descricao', mat.descricao)
                        atualizarMaterial(i, 'preco_unitario', String(mat.preco_unitario))
                        setMateriaisDispensados(prev => new Set(prev).add(i))
                        setMateriaisSemelhantes(prev => ({ ...prev, [i]: [] }))
                      }}
                      onDispensar={() => {
                        setMateriaisDispensados(prev => new Set(prev).add(i))
                        setMateriaisSemelhantes(prev => ({ ...prev, [i]: [] }))
                      }}
                    />
                  )}
                </div>
              ))}
```

(O único campo realmente novo nessa substituição é o `onFocus` no `Input` da descrição — as outras 5 colunas e o botão de remover ficam idênticos ao original.)

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 6: Verificação manual**

Com `OPENAI_API_KEY` configurada e ao menos um material já com embedding: abra uma composição (nova ou existente), clique no campo de descrição de uma linha de material e digite algo parecido com um material já cadastrado em outra composição. Confirme que a lista de sugestões aparece só embaixo daquela linha. Clique numa sugestão e confirme que descrição e preço unitário daquela linha são preenchidos. Confirme que focar noutra linha de material não mistura sugestões entre linhas.

- [ ] **Step 7: Commit**

```bash
git add components/composicoes/ComposicaoModal.tsx
git commit -m "feat: sugestao de materiais equivalentes ao digitar um material"
```

---

### Task 12: Funcionalidade 1 — sugerir composições ao criar um item no orçamento

**Files:**
- Modify: `components/orcamento/TabelaOrcamento.tsx`
- Modify: `components/orcamento/EditorOrcamento.tsx`

**Interfaces:**
- Consumes: `ListaSugestoesSemelhantes` (Task 9), `GET /api/composicoes/semelhantes` (Task 7).

- [ ] **Step 1: Adicionar a função de conversão em `EditorOrcamento.tsx`**

Logo após a função `itemInseridoPorComposicao` já existente, adicione:

```typescript
  async function converterItemParaComposicao(grupoId: string, itemId: string, composicaoId: string, quantidade: number) {
    // Insere a nova composição primeiro, remove a manual depois: se a
    // remoção falhar, sobra um item manual duplicado (recuperável — o
    // usuário só precisa apagar manualmente), o que é bem melhor do que
    // perder o item se a ordem fosse invertida e o insert falhasse depois
    // do delete. Mesmo princípio de tolerância a escrita não-transacional
    // já aceito em outros fluxos do projeto (ex.: criarComposicao).
    const resInsercao = await fetch(`/api/obras/${obra.id}/grupos/${grupoId}/itens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ composicao_id: composicaoId, quantidade }),
    })
    if (!resInsercao.ok) {
      alert('Não foi possível inserir a composição selecionada.')
      return
    }
    const novoItem = await resInsercao.json()
    await fetch(`/api/obras/${obra.id}/grupos/${grupoId}/itens/${itemId}`, { method: 'DELETE' })
    setGrupos(prev => prev.map(g =>
      g.id !== grupoId ? g : {
        ...g,
        itens_orcamento: [...g.itens_orcamento.filter(it => it.id !== itemId), novoItem],
      }
    ))
  }
```

- [ ] **Step 2: Passar a nova função pra `TabelaOrcamento`**

No JSX de `EditorOrcamento.tsx`, localize:

```tsx
      <TabelaOrcamento
        gruposCalculados={gruposCalculados}
        totais={totais}
        visao="tecnica"
        obraId={obra.id}
        disciplinas={disciplinasList}
        unidades={unidadesList}
        onUpdateItem={atualizarItem}
        onUpdateUnidade={atualizarUnidade}
        onAddDisciplina={adicionarDisciplina}
        onRemoveGrupo={removerGrupo}
        onAddItem={adicionarItem}
        onRemoveItem={removerItem}
      />
```

Substitua por (adiciona a prop `onConverterParaComposicao`):

```tsx
      <TabelaOrcamento
        gruposCalculados={gruposCalculados}
        totais={totais}
        visao="tecnica"
        obraId={obra.id}
        disciplinas={disciplinasList}
        unidades={unidadesList}
        onUpdateItem={atualizarItem}
        onUpdateUnidade={atualizarUnidade}
        onAddDisciplina={adicionarDisciplina}
        onRemoveGrupo={removerGrupo}
        onAddItem={adicionarItem}
        onRemoveItem={removerItem}
        onConverterParaComposicao={converterItemParaComposicao}
      />
```

- [ ] **Step 3: Adicionar a prop e o import em `TabelaOrcamento.tsx`**

No topo do arquivo, adicione o import do componente de sugestão:

```typescript
import { ListaSugestoesSemelhantes } from '@/components/composicoes/ListaSugestoesSemelhantes'
```

Na interface `Props`, adicione o novo campo (junto aos outros callbacks):

```typescript
  onConverterParaComposicao: (grupoId: string, itemId: string, composicaoId: string, quantidade: number) => Promise<void>
```

- [ ] **Step 4: Adicionar o estado de sugestão dentro do componente**

Logo após a assinatura da função do componente (onde os outros hooks já existentes começam), adicione:

```typescript
  const [sugestaoItemId, setSugestaoItemId] = useState<string | null>(null)
  const [sugestoesComposicoes, setSugestoesComposicoes] = useState<{ id: string; nome: string }[]>([])
  const [itensComSugestaoDispensada, setItensComSugestaoDispensada] = useState<Set<string>>(new Set())

  async function buscarSugestoesParaItem(itemId: string, descricao: string, composicaoId: string | null) {
    if (composicaoId) return // item já vinculado a uma composição, não sugere de novo
    if (itensComSugestaoDispensada.has(itemId)) return
    const texto = descricao.trim()
    if (!texto) return
    const params = new URLSearchParams({ texto, limite: '3' })
    const res = await fetch(`/api/composicoes/semelhantes?${params}`)
    if (!res.ok) return
    const resultados = await res.json()
    if (Array.isArray(resultados) && resultados.length > 0) {
      setSugestoesComposicoes(resultados)
      setSugestaoItemId(itemId)
    } else {
      setSugestaoItemId(prev => (prev === itemId ? null : prev))
    }
  }
```

- [ ] **Step 5: Visão comercial — envolver a linha do item num `Fragment` e adicionar a linha de sugestão**

Localize o bloco inteiro (visão comercial, por volta das linhas 188-252):

```tsx
                  {grupo.itens_calculados.map(item => (
                    <tr key={item.id} className="hover:bg-muted/50 border-b border-border/50">
                      <td className="px-2 py-1 text-muted-foreground">{grupo.letra}</td>
                      <td className="px-2 py-1 text-muted-foreground">{item.numero}</td>
                      <td className="px-2 py-1">
                        <div className="flex items-center gap-1">
                          <CelulaEditavel
                            valor={item.descricao}
                            tipo="text"
                            onSave={v => onUpdateItem(grupo.id, item.id, 'descricao', v)}
                          />
                          <IndicadorDesatualizado item={item} />
                        </div>
                      </td>
                      <td className="px-2 py-1">
                        <CelulaEditavel
                          valor={item.local ?? ''}
                          tipo="text"
                          onSave={v => onUpdateItem(grupo.id, item.id, 'local', v || null)}
                        />
                      </td>
                      <td className="px-2 py-1 text-center">
                        <input
                          key={item.unidade_id ?? 'sem-unidade'}
                          list="lista-unidades"
                          defaultValue={item.unidades_medida?.sigla ?? ''}
                          onBlur={e => {
                            const nova = e.target.value.trim().toUpperCase()
                            if (nova !== (item.unidades_medida?.sigla ?? '')) {
                              onUpdateUnidade(grupo.id, item.id, nova)
                            }
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                          placeholder="—"
                          className="w-14 h-6 rounded border border-input bg-background px-1 text-xs text-center uppercase"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <CelulaEditavel
                          valor={item.quantidade}
                          tipo="number"
                          className="text-right"
                          onSave={v => onUpdateItem(grupo.id, item.id, 'quantidade', parseFloat(v) || 0)}
                        />
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                        {fmt(item.preco_unit_mao_obra_venda)}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                        {fmt(item.preco_unit_material_venda)}
                      </td>
                      <td className="px-2 py-1 text-right font-mono">{fmt(item.subtotal_mao_obra_venda)}</td>
                      <td className="px-2 py-1 text-right font-mono">{fmt(item.subtotal_material_venda)}</td>
                      <td className="px-2 py-1 text-right font-mono font-semibold">{fmt(item.total_venda)}</td>
                      <td className="px-2 py-1 text-center">
                        <button
                          onClick={() => onRemoveItem(grupo.id, item.id)}
                          className="text-red-300 hover:text-red-500"
                          title="Remover item"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
```

Substitua pelo bloco inteiro abaixo (troca `key={item.id}` da `<tr>` por um `<Fragment key={item.id}>` envolvendo a linha existente — sem nenhuma outra mudança nas colunas — mais a `CelulaEditavel` da descrição com `onSave` estendido, mais a nova linha de sugestão condicional):

```tsx
                  {grupo.itens_calculados.map(item => (
                    <Fragment key={item.id}>
                      <tr className="hover:bg-muted/50 border-b border-border/50">
                        <td className="px-2 py-1 text-muted-foreground">{grupo.letra}</td>
                        <td className="px-2 py-1 text-muted-foreground">{item.numero}</td>
                        <td className="px-2 py-1">
                          <div className="flex items-center gap-1">
                            <CelulaEditavel
                              valor={item.descricao}
                              tipo="text"
                              onSave={v => {
                                onUpdateItem(grupo.id, item.id, 'descricao', v)
                                buscarSugestoesParaItem(item.id, v, item.composicao_id)
                              }}
                            />
                            <IndicadorDesatualizado item={item} />
                          </div>
                        </td>
                        <td className="px-2 py-1">
                          <CelulaEditavel
                            valor={item.local ?? ''}
                            tipo="text"
                            onSave={v => onUpdateItem(grupo.id, item.id, 'local', v || null)}
                          />
                        </td>
                        <td className="px-2 py-1 text-center">
                          <input
                            key={item.unidade_id ?? 'sem-unidade'}
                            list="lista-unidades"
                            defaultValue={item.unidades_medida?.sigla ?? ''}
                            onBlur={e => {
                              const nova = e.target.value.trim().toUpperCase()
                              if (nova !== (item.unidades_medida?.sigla ?? '')) {
                                onUpdateUnidade(grupo.id, item.id, nova)
                              }
                            }}
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                            placeholder="—"
                            className="w-14 h-6 rounded border border-input bg-background px-1 text-xs text-center uppercase"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <CelulaEditavel
                            valor={item.quantidade}
                            tipo="number"
                            className="text-right"
                            onSave={v => onUpdateItem(grupo.id, item.id, 'quantidade', parseFloat(v) || 0)}
                          />
                        </td>
                        <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                          {fmt(item.preco_unit_mao_obra_venda)}
                        </td>
                        <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                          {fmt(item.preco_unit_material_venda)}
                        </td>
                        <td className="px-2 py-1 text-right font-mono">{fmt(item.subtotal_mao_obra_venda)}</td>
                        <td className="px-2 py-1 text-right font-mono">{fmt(item.subtotal_material_venda)}</td>
                        <td className="px-2 py-1 text-right font-mono font-semibold">{fmt(item.total_venda)}</td>
                        <td className="px-2 py-1 text-center">
                          <button
                            onClick={() => onRemoveItem(grupo.id, item.id)}
                            className="text-red-300 hover:text-red-500"
                            title="Remover item"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                      {sugestaoItemId === item.id && (
                        <tr>
                          <td colSpan={colsComercial + 1} className="px-2 py-1">
                            <ListaSugestoesSemelhantes
                              titulo="Composições parecidas"
                              itens={sugestoesComposicoes}
                              renderItem={c => <span>{c.nome}</span>}
                              onSelecionar={c => {
                                onConverterParaComposicao(grupo.id, item.id, c.id, item.quantidade)
                                setSugestaoItemId(null)
                              }}
                              onDispensar={() => {
                                setItensComSugestaoDispensada(prev => new Set(prev).add(item.id))
                                setSugestaoItemId(null)
                              }}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
```

- [ ] **Step 6: Visão técnica — mesma mudança, com `colsTecnica`**

Localize o bloco inteiro (visão técnica, por volta das linhas 397-517):

```tsx
                {grupo.itens_calculados.map(item => (
                  <tr key={item.id} className="hover:bg-muted/50 border-b border-border/50">
                    <td className="px-2 py-1 text-muted-foreground">{grupo.letra}</td>
                    <td className="px-2 py-1 text-muted-foreground">{item.numero}</td>
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1">
                        <CelulaEditavel
                          valor={item.descricao}
                          tipo="text"
                          onSave={v => onUpdateItem(grupo.id, item.id, 'descricao', v)}
                        />
                        <IndicadorDesatualizado item={item} />
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <CelulaEditavel
                        valor={item.local ?? ''}
                        tipo="text"
                        onSave={v => onUpdateItem(grupo.id, item.id, 'local', v || null)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        key={item.unidade_id ?? 'sem-unidade'}
                        list="lista-unidades"
                        defaultValue={item.unidades_medida?.sigla ?? ''}
                        onBlur={e => {
                          const nova = e.target.value.trim().toUpperCase()
                          if (nova !== (item.unidades_medida?.sigla ?? '')) {
                            onUpdateUnidade(grupo.id, item.id, nova)
                          }
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                        placeholder="—"
                        className="w-14 h-6 rounded border border-input bg-background px-1 text-xs text-center uppercase"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <CelulaEditavel
                        valor={item.quantidade}
                        tipo="number"
                        className="text-right"
                        onSave={v => onUpdateItem(grupo.id, item.id, 'quantidade', parseFloat(v) || 0)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <CelulaEditavel
                        valor={item.custo_unit_mao_obra}
                        tipo="number"
                        className="text-right"
                        onSave={v => onUpdateItem(grupo.id, item.id, 'custo_unit_mao_obra', parseFloat(v) || 0)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <CelulaEditavel
                        valor={item.custo_unit_material}
                        tipo="number"
                        className="text-right"
                        onSave={v => onUpdateItem(grupo.id, item.id, 'custo_unit_material', parseFloat(v) || 0)}
                      />
                    </td>
                    <td className="px-2 py-1 text-right font-mono">{fmt(item.total_custo)}</td>
                    <td className="px-2 py-1">
                      <CelulaEditavel
                        valor={item.markup_mao_obra}
                        tipo="number"
                        className="text-right"
                        onSave={v => onUpdateItem(grupo.id, item.id, 'markup_mao_obra', parseFloat(v) || 1)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <CelulaEditavel
                        valor={item.markup_material}
                        tipo="number"
                        className="text-right"
                        onSave={v => onUpdateItem(grupo.id, item.id, 'markup_material', parseFloat(v) || 1)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <CelulaEditavel
                        valor={item.fee_mao_obra}
                        tipo="number"
                        className="text-right"
                        onSave={v => onUpdateItem(grupo.id, item.id, 'fee_mao_obra', v.trim() === '' ? null : parseFloat(v))}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <CelulaEditavel
                        valor={item.fee_material}
                        tipo="number"
                        className="text-right"
                        onSave={v => onUpdateItem(grupo.id, item.id, 'fee_material', v.trim() === '' ? null : parseFloat(v))}
                      />
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                      {fmt(item.fee_unit_mao_obra)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                      {fmt(item.preco_unit_mao_obra_venda)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                      {fmt(item.fee_unit_material)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                      {fmt(item.preco_unit_material_venda)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono">{fmt(item.subtotal_mao_obra_venda)}</td>
                    <td className="px-2 py-1 text-right font-mono">{fmt(item.subtotal_material_venda)}</td>
                    <td className="px-2 py-1 text-right font-mono font-semibold">{fmt(item.total_venda)}</td>
                    <td className="px-2 py-1 text-right font-mono">{fmt(item.lucro)}</td>
                    <td className="px-2 py-1 text-right font-mono">{fmtPct(item.margem_efetiva_pct)}</td>
                    <td className="px-2 py-1 text-center">
                      <button
                        onClick={() => onRemoveItem(grupo.id, item.id)}
                        className="text-red-300 hover:text-red-500"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
```

Substitua pelo bloco inteiro abaixo (mesma transformação da Step 5: `Fragment key={item.id}`, `onSave` estendido na descrição, linha de sugestão condicional — usando `colsTecnica + 1` no `colSpan`, não `colsComercial + 1`):

```tsx
                {grupo.itens_calculados.map(item => (
                  <Fragment key={item.id}>
                    <tr className="hover:bg-muted/50 border-b border-border/50">
                      <td className="px-2 py-1 text-muted-foreground">{grupo.letra}</td>
                      <td className="px-2 py-1 text-muted-foreground">{item.numero}</td>
                      <td className="px-2 py-1">
                        <div className="flex items-center gap-1">
                          <CelulaEditavel
                            valor={item.descricao}
                            tipo="text"
                            onSave={v => {
                              onUpdateItem(grupo.id, item.id, 'descricao', v)
                              buscarSugestoesParaItem(item.id, v, item.composicao_id)
                            }}
                          />
                          <IndicadorDesatualizado item={item} />
                        </div>
                      </td>
                      <td className="px-2 py-1">
                        <CelulaEditavel
                          valor={item.local ?? ''}
                          tipo="text"
                          onSave={v => onUpdateItem(grupo.id, item.id, 'local', v || null)}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          key={item.unidade_id ?? 'sem-unidade'}
                          list="lista-unidades"
                          defaultValue={item.unidades_medida?.sigla ?? ''}
                          onBlur={e => {
                            const nova = e.target.value.trim().toUpperCase()
                            if (nova !== (item.unidades_medida?.sigla ?? '')) {
                              onUpdateUnidade(grupo.id, item.id, nova)
                            }
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                          placeholder="—"
                          className="w-14 h-6 rounded border border-input bg-background px-1 text-xs text-center uppercase"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <CelulaEditavel
                          valor={item.quantidade}
                          tipo="number"
                          className="text-right"
                          onSave={v => onUpdateItem(grupo.id, item.id, 'quantidade', parseFloat(v) || 0)}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <CelulaEditavel
                          valor={item.custo_unit_mao_obra}
                          tipo="number"
                          className="text-right"
                          onSave={v => onUpdateItem(grupo.id, item.id, 'custo_unit_mao_obra', parseFloat(v) || 0)}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <CelulaEditavel
                          valor={item.custo_unit_material}
                          tipo="number"
                          className="text-right"
                          onSave={v => onUpdateItem(grupo.id, item.id, 'custo_unit_material', parseFloat(v) || 0)}
                        />
                      </td>
                      <td className="px-2 py-1 text-right font-mono">{fmt(item.total_custo)}</td>
                      <td className="px-2 py-1">
                        <CelulaEditavel
                          valor={item.markup_mao_obra}
                          tipo="number"
                          className="text-right"
                          onSave={v => onUpdateItem(grupo.id, item.id, 'markup_mao_obra', parseFloat(v) || 1)}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <CelulaEditavel
                          valor={item.markup_material}
                          tipo="number"
                          className="text-right"
                          onSave={v => onUpdateItem(grupo.id, item.id, 'markup_material', parseFloat(v) || 1)}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <CelulaEditavel
                          valor={item.fee_mao_obra}
                          tipo="number"
                          className="text-right"
                          onSave={v => onUpdateItem(grupo.id, item.id, 'fee_mao_obra', v.trim() === '' ? null : parseFloat(v))}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <CelulaEditavel
                          valor={item.fee_material}
                          tipo="number"
                          className="text-right"
                          onSave={v => onUpdateItem(grupo.id, item.id, 'fee_material', v.trim() === '' ? null : parseFloat(v))}
                        />
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                        {fmt(item.fee_unit_mao_obra)}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                        {fmt(item.preco_unit_mao_obra_venda)}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                        {fmt(item.fee_unit_material)}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                        {fmt(item.preco_unit_material_venda)}
                      </td>
                      <td className="px-2 py-1 text-right font-mono">{fmt(item.subtotal_mao_obra_venda)}</td>
                      <td className="px-2 py-1 text-right font-mono">{fmt(item.subtotal_material_venda)}</td>
                      <td className="px-2 py-1 text-right font-mono font-semibold">{fmt(item.total_venda)}</td>
                      <td className="px-2 py-1 text-right font-mono">{fmt(item.lucro)}</td>
                      <td className="px-2 py-1 text-right font-mono">{fmtPct(item.margem_efetiva_pct)}</td>
                      <td className="px-2 py-1 text-center">
                        <button
                          onClick={() => onRemoveItem(grupo.id, item.id)}
                          className="text-red-300 hover:text-red-500"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                    {sugestaoItemId === item.id && (
                      <tr>
                        <td colSpan={colsTecnica + 1} className="px-2 py-1">
                          <ListaSugestoesSemelhantes
                            titulo="Composições parecidas"
                            itens={sugestoesComposicoes}
                            renderItem={c => <span>{c.nome}</span>}
                            onSelecionar={c => {
                              onConverterParaComposicao(grupo.id, item.id, c.id, item.quantidade)
                              setSugestaoItemId(null)
                            }}
                            onDispensar={() => {
                              setItensComSugestaoDispensada(prev => new Set(prev).add(item.id))
                              setSugestaoItemId(null)
                            }}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
```

- [ ] **Step 7: Resetar sugestão ao remover ou converter um item**

Na função `onRemoveItem` (já uma prop existente, não precisa mudar a assinatura) — nenhuma mudança necessária aqui: quando um item é removido ou convertido, ele simplesmente deixa de existir em `grupo.itens_calculados`, então a condição `sugestaoItemId === item.id` nunca mais casa (o item não existe mais pra iterar). Não é preciso limpar `sugestaoItemId` manualmente.

- [ ] **Step 8: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 9: Verificação manual**

Com `OPENAI_API_KEY` configurada e ao menos uma composição já com embedding: abra uma obra, clique "+ Adicionar item", digite uma descrição parecida com uma composição existente, saia do campo. Confirme que aparece a sugestão embaixo da linha, com até 3 composições. Clique numa sugestão e confirme que o item manual é substituído pelo item vinculado à composição (com o mesmo comportamento de um item inserido via "+ Inserir Composição"). Dispense uma sugestão e confirme que ela não reaparece pra aquele item. Confirme que os outros 11 usos de `CelulaEditavel` na tabela (local, quantidade, preços, etc.) continuam funcionando exatamente como antes.

- [ ] **Step 10: Commit**

```bash
git add components/orcamento/TabelaOrcamento.tsx components/orcamento/EditorOrcamento.tsx
git commit -m "feat: sugestao de composicoes ao criar item manual no orcamento"
```

---

## Critérios de aceite (herdados da spec)

1. Composição nova ganha embedding automaticamente ao ser criada.
2. Composição editada com mudança em nome/descrição recalcula o embedding; sem mudança nesses campos, não recalcula.
3. Falha na chamada à API de embeddings nunca impede criar ou editar uma composição.
4. Backfill processa só composições/materiais com `embedding IS NULL` e é seguro rodar mais de uma vez.
5. As 3 sugestões (item no orçamento, composições semelhantes, materiais equivalentes) nunca bloqueiam a ação principal.
6. Nenhuma das 12 outras células editáveis de `TabelaOrcamento.tsx` muda de comportamento.
7. `npm run test:run` verde; `npx tsc --noEmit` sem erros novos.
