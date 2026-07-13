# Banco de Composições — Fase B2 (Restaurar Versão + Histórico de Uso) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir restaurar uma versão anterior de uma composição (criando sempre uma nova versão) e mostrar histórico de uso (contagem, último uso, usuário) na biblioteca e no modal de composição.

**Architecture:** Reaproveita 100% da infraestrutura de versionamento da Fase B1. A lógica de "aplicar atualização se algo mudou" (hoje só dentro do handler PUT) é extraída para `lib/composicoes/atualizar.ts`, e passa a ser chamada tanto pelo PUT quanto pela nova rota de restaurar — restaurar é, na prática, um PUT cujo corpo vem de um snapshot arquivado em vez do corpo da requisição. Histórico de uso é um log append-only (`composicao_usos`), gravado no mesmo request que já insere a composição no orçamento (rota da B1), sem tocar em `itens_orcamento`.

**Tech Stack:** Next.js 15 (App Router) + TypeScript, Supabase (Postgres + Auth + RLS), Tailwind + shadcn/ui, Vitest.

## Global Constraints

- Restaurar uma versão **sempre cria uma nova versão** com o conteúdo da versão restaurada — nunca apaga nem reescreve versões existentes (mesmo modelo append-only de `composicao_versoes` já usado na B1).
- Restaurar uma versão que já é idêntica à atual **não incrementa a versão** — mesma regra "sem alteração" da B1, reaproveitando `composicaoMudou` sem duplicar a comparação.
- Histórico de uso é um **log append-only** (`composicao_usos`) — nunca é atualizado ou apagado. Se um item for depois removido do orçamento, a linha de uso permanece (a métrica é "quantas vezes já foi usada", não "quantas vezes está em uso agora").
- **Sem "taxa de aprovação"** — não existe fluxo de aprovação por item no sistema, só status de obra inteira. Não inventar essa métrica.
- O log de uso é gravado no mesmo request de `POST .../itens` que já insere o item (rota da B1) — **nunca** bloqueia a criação do item se a gravação do log falhar (é um dado suplementar, não crítico ao fluxo principal do orçamento). Ver Task 6 para a justificativa completa — não tratar isso como "erro não checado" no mesmo sentido que os achados de erro-silencioso da B1 (aqueles eram sobre dados centrais da composição; aqui é telemetria supletiva depois que o dado principal já foi commitado com sucesso).
- Precisão numérica e nomenclatura seguem exatamente o que já foi estabelecido na B1 — não redefinir nada.
- Fora de escopo nesta fase (permanece para B3+): import/export Excel, dashboard de indicadores, IA integrada, anexos.

---

### Task 1: Migration — tabela `composicao_usos`

**Files:**
- Create: `supabase/migrations/011_composicao_usos.sql`

**Interfaces:**
- Produces: tabela `composicao_usos`. Usada pelas Tasks 6, 7 e 8.
- Consumes: tabelas `composicoes`, `obras`, `usuarios` e função `get_user_papel()` (já existentes).

- [ ] **Step 1: Escrever a migration**

```sql
-- 011_composicao_usos.sql
-- Fase B2 do Banco de Composições: histórico de uso (contagem, último uso,
-- usuário) por composição. Log append-only — nunca é atualizado ou apagado.
-- Ver docs/superpowers/specs/2026-07-13-banco-composicoes-b2-design.md

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

-- RLS: mesmo padrão de itens_write (leitura ampla, escrita restrita aos
-- mesmos papéis que podem inserir itens no orçamento). Sem política de
-- UPDATE/DELETE — o log é imutável, mesmo padrão de composicao_versoes.
ALTER TABLE composicao_usos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "composicao_usos_select" ON composicao_usos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "composicao_usos_insert" ON composicao_usos
  FOR INSERT TO authenticated
  WITH CHECK (get_user_papel() IN ('admin','engenheiro','orcamentista'));
```

- [ ] **Step 2: Rodar a migration no Supabase SQL Editor**

O usuário roda migrations manualmente no Supabase SQL Editor. Cole o conteúdo de `011_composicao_usos.sql` e execute. Confirme sem erros: `SELECT * FROM composicao_usos LIMIT 1;` deve retornar 0 linhas sem erro.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/011_composicao_usos.sql
git commit -m "feat: migration da tabela composicao_usos (fase B2)"
```

---

### Task 2: Tipos TypeScript

**Files:**
- Modify: `types/database.ts`

**Interfaces:**
- Consumes: `Obra`, `Usuario` (já definidos no mesmo arquivo).
- Produces: `ComposicaoUso`; `Composicao` ganha `total_usos`/`ultimo_uso` opcionais. Usados pelas Tasks 7, 8, 9 e 10.

- [ ] **Step 1: Adicionar `total_usos`/`ultimo_uso` à interface `Composicao` existente**

Em `types/database.ts`, na interface `Composicao`, adicione as duas linhas logo após `favorito?: boolean`:

```typescript
export interface Composicao {
  id: string
  codigo: string
  nome: string
  disciplina_id: string | null
  descricao_tecnica: string
  unidade_id: string | null
  produtividade: string | null
  custo_direto: number
  markup_sugerido: number
  observacoes: string | null
  tags: string[]
  versao: number
  ativo: boolean
  responsavel_id: string | null
  criado_em: string
  atualizado_em: string
  disciplinas?: Pick<Disciplina, 'id' | 'nome'> | null
  unidades_medida?: Pick<UnidadeMedida, 'id' | 'sigla'> | null
  favorito?: boolean
  total_usos?: number
  ultimo_uso?: string | null
}
```

- [ ] **Step 2: Adicionar a interface `ComposicaoUso`**

Adicione ao final do arquivo (após `ComposicaoCompleta`):

```typescript
export interface ComposicaoUso {
  id: string
  composicao_id: string
  composicao_versao: number
  obra_id: string
  usuario_id: string | null
  criado_em: string
  obras?: Pick<Obra, 'codigo' | 'nome'> | null
  usuarios?: Pick<Usuario, 'nome'> | null
}
```

- [ ] **Step 3: Verificar que o projeto compila**

Run: `npx tsc --noEmit`
Expected: nenhum erro novo envolvendo `types/database.ts` (este projeto tem um problema de ambiente conhecido e não relacionado com `npm run build` — se ele falhar com `EINVAL: invalid argument, readlink`, use `npx tsc --noEmit` como verificação confiável).

- [ ] **Step 4: Commit**

```bash
git add types/database.ts
git commit -m "feat: tipos TypeScript de composicao_usos e total_usos/ultimo_uso"
```

---

### Task 3: `extrairCamposDeSnapshot` (lib/composicoes/normalizar.ts)

**Files:**
- Modify: `lib/composicoes/normalizar.ts`
- Modify: `lib/composicoes/calculos.test.ts` (ou crie `lib/composicoes/normalizar.test.ts` — ver Step 1, use o arquivo indicado)

**Interfaces:**
- Consumes: nada novo.
- Produces: `CamposEditaveisComposicao` (interface) e `extrairCamposDeSnapshot(composicao): CamposEditaveisComposicao` — usados pelas Tasks 4 e 5.

- [ ] **Step 1: Escrever o teste (falhando)**

Crie `lib/composicoes/normalizar.test.ts`:

```typescript
// lib/composicoes/normalizar.test.ts
import { describe, it, expect } from 'vitest'
import { normalizarMateriais, normalizarMaoObra, extrairCamposDeSnapshot } from './normalizar'

describe('normalizarMateriais', () => {
  it('aplica defaults e ordem sequencial', () => {
    const resultado = normalizarMateriais([
      { descricao: 'Cabo', quantidade: 2, unidade_id: 'un-1', fornecedor: '  Fornecedor A  ', preco_unitario: 10 },
      { descricao: 'Conector' },
    ])
    expect(resultado).toEqual([
      { descricao: 'Cabo', quantidade: 2, unidade_id: 'un-1', fornecedor: 'Fornecedor A', preco_unitario: 10, ordem: 1 },
      { descricao: 'Conector', quantidade: 0, unidade_id: null, fornecedor: null, preco_unitario: 0, ordem: 2 },
    ])
  })
})

describe('normalizarMaoObra', () => {
  it('aplica defaults e ordem sequencial', () => {
    const resultado = normalizarMaoObra([{ cargo: 'Técnico', horas: 2, custo_hora: 40 }])
    expect(resultado).toEqual([{ cargo: 'Técnico', horas: 2, custo_hora: 40, ordem: 1 }])
  })
})

describe('extrairCamposDeSnapshot', () => {
  it('extrai apenas os campos editáveis, descartando os derivados/imutáveis', () => {
    const snapshotComposicao = {
      id: 'comp-1',
      codigo: 'C1',
      nome: 'Composição X',
      disciplina_id: 'disc-1',
      descricao_tecnica: 'Descrição técnica',
      unidade_id: 'un-1',
      produtividade: '0,5 m²/h',
      custo_direto: 500,
      markup_sugerido: 1.5,
      observacoes: 'obs',
      tags: ['a', 'b'],
      versao: 3,
      ativo: true,
      responsavel_id: 'user-1',
      criado_em: '2026-01-01T00:00:00Z',
      atualizado_em: '2026-01-02T00:00:00Z',
    }
    expect(extrairCamposDeSnapshot(snapshotComposicao)).toEqual({
      codigo: 'C1',
      nome: 'Composição X',
      disciplina_id: 'disc-1',
      descricao_tecnica: 'Descrição técnica',
      unidade_id: 'un-1',
      produtividade: '0,5 m²/h',
      markup_sugerido: 1.5,
      observacoes: 'obs',
      tags: ['a', 'b'],
      ativo: true,
    })
  })

  it('preenche tags/ativo com defaults quando ausentes no snapshot', () => {
    const snapshotComposicao = {
      codigo: 'C2',
      nome: 'Composição Y',
      disciplina_id: null,
      descricao_tecnica: 'Descrição',
      unidade_id: null,
      produtividade: null,
      markup_sugerido: 1,
      observacoes: null,
      tags: undefined,
      ativo: undefined,
    }
    const campos = extrairCamposDeSnapshot(snapshotComposicao)
    expect(campos.tags).toEqual([])
    expect(campos.ativo).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run lib/composicoes/normalizar.test.ts`
Expected: FAIL — `extrairCamposDeSnapshot` não existe em `./normalizar` (as duas primeiras `describe` de `normalizarMateriais`/`normalizarMaoObra` devem passar, já que essas funções já existem desde a B1 — só a nova função falha).

- [ ] **Step 3: Adicionar `CamposEditaveisComposicao` e `extrairCamposDeSnapshot` a `lib/composicoes/normalizar.ts`**

Adicione ao final do arquivo (mantendo tudo que já existe: `MaterialBody`, `MaoObraBody`, `MaterialNormalizado`, `MaoObraNormalizada`, `normalizarMateriais`, `normalizarMaoObra`):

```typescript
export interface CamposEditaveisComposicao {
  codigo: string
  nome: string
  disciplina_id: string | null
  descricao_tecnica: string
  unidade_id: string | null
  produtividade: string | null
  markup_sugerido: number
  observacoes: string | null
  tags: string[]
  ativo: boolean
}

type SnapshotComposicaoParcial = {
  codigo: string
  nome: string
  disciplina_id: string | null
  descricao_tecnica: string
  unidade_id: string | null
  produtividade: string | null
  markup_sugerido: number
  observacoes: string | null
  tags?: string[]
  ativo?: boolean
}

/** Extrai os campos editáveis de uma composição a partir de um snapshot
 * arquivado (composicao_versoes.snapshot.composicao), descartando campos
 * derivados/imutáveis (id, custo_direto, versao, responsavel_id, criado_em,
 * atualizado_em, relações). Usado ao restaurar uma versão anterior. */
export function extrairCamposDeSnapshot(composicao: SnapshotComposicaoParcial): CamposEditaveisComposicao {
  return {
    codigo: composicao.codigo,
    nome: composicao.nome,
    disciplina_id: composicao.disciplina_id,
    descricao_tecnica: composicao.descricao_tecnica,
    unidade_id: composicao.unidade_id,
    produtividade: composicao.produtividade,
    markup_sugerido: composicao.markup_sugerido,
    observacoes: composicao.observacoes,
    tags: composicao.tags ?? [],
    ativo: composicao.ativo ?? true,
  }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run lib/composicoes/normalizar.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Rodar a suíte completa**

Run: `npm run test:run`
Expected: todos os testes passam (99 da B1 + 4 novos = 103), output limpo.

- [ ] **Step 6: Commit**

```bash
git add lib/composicoes/normalizar.ts lib/composicoes/normalizar.test.ts
git commit -m "feat: extrairCamposDeSnapshot para restaurar versao de composicao"
```

---

### Task 4: Refatorar — extrair lógica de atualização compartilhada (lib/composicoes/atualizar.ts)

**Files:**
- Create: `lib/composicoes/atualizar.ts`
- Modify: `app/api/composicoes/[id]/route.ts`

**Interfaces:**
- Consumes: `CamposEditaveisComposicao`, `MaterialNormalizado`, `MaoObraNormalizada` (Task 3 e já existentes em `normalizar.ts`), `calcularCustoDireto`/`composicaoMudou` (`@/lib/composicoes/calculos`).
- Produces: `carregarComposicaoCompleta(supabase, id)` e `atualizarComposicaoSeMudou(supabase, usuarioId, id, camposNovos, materiaisNovos, maoObraNova): Promise<{status, body}>` — usados pela Task 5 (restaurar) além do PUT já existente.

**Contexto crítico:** este task move código de um arquivo **existente e já aprovado** (`app/api/composicoes/[id]/route.ts`, da B1) para um novo módulo. O comportamento do GET, PUT e DELETE dessa rota **não pode mudar em nada** — é uma extração pura, não uma reescrita. O corpo da função `atualizarComposicaoSeMudou` deve ser **idêntico** à lógica que já existe hoje entre `carregarComposicaoCompleta(supabase, id)` (linha ~92 do PUT atual) e o `return NextResponse.json(...)` final do PUT (linha ~193) — só muda a forma de retornar (objeto `{status, body}` em vez de `NextResponse.json(...)` direto, porque agora duas rotas diferentes vão chamar essa função e cada uma decide como embrulhar a resposta).

- [ ] **Step 1: Ler o arquivo atual por completo**

Leia `app/api/composicoes/[id]/route.ts` inteiro antes de tocar nele — a extração abaixo assume exatamente o conteúdo que já existe lá desde a B1 (função local `carregarComposicaoCompleta`, e o corpo do handler `PUT`).

- [ ] **Step 2: Criar `lib/composicoes/atualizar.ts`**

```typescript
// lib/composicoes/atualizar.ts
import { createClient } from '@/lib/supabase/server'
import { calcularCustoDireto, composicaoMudou } from './calculos'
import type { CamposEditaveisComposicao, MaterialNormalizado, MaoObraNormalizada } from './normalizar'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export async function carregarComposicaoCompleta(supabase: SupabaseClient, id: string) {
  const [composicaoRes, materiaisRes, maoObraRes] = await Promise.all([
    supabase.from('composicoes').select('*, disciplinas(id, nome), unidades_medida(id, sigla)').eq('id', id).single(),
    supabase.from('composicao_materiais').select('*, unidades_medida(id, sigla)').eq('composicao_id', id).order('ordem'),
    supabase.from('composicao_mao_obra').select('*').eq('composicao_id', id).order('ordem'),
  ])
  return { composicaoRes, materiaisRes, maoObraRes }
}

export interface ResultadoAtualizacao {
  status: number
  body: Record<string, unknown>
}

/** Atualiza uma composição só se algo realmente mudou (campos simples ou as
 * listas de materiais/mão de obra) em relação ao estado atual no banco — se
 * nada mudou, não grava nada e retorna o estado atual sem incrementar a
 * versão. Reaproveitada por PUT /api/composicoes/[id] (corpo vem da
 * requisição) e por restaurar versão (corpo vem de um snapshot arquivado). */
export async function atualizarComposicaoSeMudou(
  supabase: SupabaseClient,
  usuarioId: string,
  id: string,
  camposNovos: CamposEditaveisComposicao,
  materiaisNovos: MaterialNormalizado[],
  maoObraNova: MaoObraNormalizada[]
): Promise<ResultadoAtualizacao> {
  const { composicaoRes: atual, materiaisRes: materiaisAtuais, maoObraRes: maoObraAtual } =
    await carregarComposicaoCompleta(supabase, id)
  if (atual.error) {
    if (atual.error.code === 'PGRST116') return { status: 404, body: { error: 'Composição não encontrada' } }
    return { status: 500, body: { error: atual.error.message } }
  }

  const camposAntigos: CamposEditaveisComposicao = {
    codigo: atual.data.codigo,
    nome: atual.data.nome,
    disciplina_id: atual.data.disciplina_id,
    descricao_tecnica: atual.data.descricao_tecnica,
    unidade_id: atual.data.unidade_id,
    produtividade: atual.data.produtividade,
    markup_sugerido: atual.data.markup_sugerido,
    observacoes: atual.data.observacoes,
    tags: atual.data.tags,
    ativo: atual.data.ativo,
  }
  const materiaisAntigosNormalizados = (materiaisAtuais.data ?? []).map(m => ({
    descricao: m.descricao, quantidade: m.quantidade, unidade_id: m.unidade_id,
    fornecedor: m.fornecedor, preco_unitario: m.preco_unitario, ordem: m.ordem,
  }))
  const maoObraAntigaNormalizada = (maoObraAtual.data ?? []).map(m => ({
    cargo: m.cargo, horas: m.horas, custo_hora: m.custo_hora, ordem: m.ordem,
  }))

  const mudou = composicaoMudou(
    { campos: camposAntigos, materiais: materiaisAntigosNormalizados, maoDeObra: maoObraAntigaNormalizada },
    { campos: camposNovos, materiais: materiaisNovos, maoDeObra: maoObraNova }
  )

  if (!mudou) {
    return {
      status: 200,
      body: {
        ...atual.data,
        composicao_materiais: materiaisAtuais.data ?? [],
        composicao_mao_obra: maoObraAtual.data ?? [],
      },
    }
  }

  const custo_direto = calcularCustoDireto(
    materiaisNovos.map(m => ({ quantidade: m.quantidade, preco_unitario: m.preco_unitario })),
    maoObraNova.map(m => ({ horas: m.horas, custo_hora: m.custo_hora }))
  )
  const novaVersao = atual.data.versao + 1

  const { data: composicaoAtualizada, error: erroUpdate } = await supabase
    .from('composicoes')
    .update({ ...camposNovos, custo_direto, versao: novaVersao, atualizado_em: new Date().toISOString() })
    .eq('id', id)
    .select('*, disciplinas(id, nome), unidades_medida(id, sigla)')
    .single()
  if (erroUpdate) return { status: 500, body: { error: erroUpdate.message } }

  const { error: erroDeleteMateriais } = await supabase.from('composicao_materiais').delete().eq('composicao_id', id)
  if (erroDeleteMateriais) return { status: 500, body: { error: erroDeleteMateriais.message } }
  const { error: erroDeleteMaoObra } = await supabase.from('composicao_mao_obra').delete().eq('composicao_id', id)
  if (erroDeleteMaoObra) return { status: 500, body: { error: erroDeleteMaoObra.message } }

  const [resMateriais, resMaoObra] = await Promise.all([
    materiaisNovos.length > 0
      ? supabase.from('composicao_materiais')
          .insert(materiaisNovos.map(m => ({ ...m, composicao_id: id })))
          .select('*, unidades_medida(id, sigla)')
      : Promise.resolve({ data: [], error: null }),
    maoObraNova.length > 0
      ? supabase.from('composicao_mao_obra')
          .insert(maoObraNova.map(m => ({ ...m, composicao_id: id })))
          .select('*')
      : Promise.resolve({ data: [], error: null }),
  ])
  if (resMateriais.error) return { status: 500, body: { error: resMateriais.error.message } }
  if (resMaoObra.error) return { status: 500, body: { error: resMaoObra.error.message } }

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

- [ ] **Step 3: Reescrever `app/api/composicoes/[id]/route.ts` para usar o módulo compartilhado**

Substitua todo o conteúdo do arquivo por:

```typescript
// app/api/composicoes/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lerJson } from '@/lib/http'
import { normalizarMateriais, normalizarMaoObra, type MaterialBody, type MaoObraBody } from '@/lib/composicoes/normalizar'
import { carregarComposicaoCompleta, atualizarComposicaoSeMudou } from '@/lib/composicoes/atualizar'

type ComposicaoBody = {
  codigo?: string
  nome?: string
  disciplina_id?: string | null
  descricao_tecnica?: string
  unidade_id?: string | null
  produtividade?: string | null
  markup_sugerido?: number
  observacoes?: string | null
  tags?: string[]
  ativo?: boolean
  materiais?: MaterialBody[]
  mao_obra?: MaoObraBody[]
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const { composicaoRes, materiaisRes, maoObraRes } = await carregarComposicaoCompleta(supabase, id)

  if (composicaoRes.error) {
    if (composicaoRes.error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Composição não encontrada' }, { status: 404 })
    }
    return NextResponse.json({ error: composicaoRes.error.message }, { status: 500 })
  }

  const { data: favorito } = await supabase
    .from('composicoes_favoritas')
    .select('composicao_id')
    .eq('usuario_id', user.id)
    .eq('composicao_id', id)
    .maybeSingle()

  return NextResponse.json({
    ...composicaoRes.data,
    favorito: !!favorito,
    composicao_materiais: materiaisRes.data ?? [],
    composicao_mao_obra: maoObraRes.data ?? [],
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const body = await lerJson<ComposicaoBody>(request)
  if (!body) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 })

  if (!body.codigo?.trim() || !body.nome?.trim() || !body.descricao_tecnica?.trim()) {
    return NextResponse.json({ error: 'Código, nome e descrição técnica são obrigatórios' }, { status: 400 })
  }
  const materiaisBody = body.materiais ?? []
  const maoObraBody = body.mao_obra ?? []
  if (materiaisBody.length === 0 && maoObraBody.length === 0) {
    return NextResponse.json(
      { error: 'A composição precisa ter ao menos um material ou item de mão de obra' },
      { status: 400 }
    )
  }

  const camposNovos = {
    codigo: body.codigo.trim(),
    nome: body.nome.trim(),
    disciplina_id: body.disciplina_id || null,
    descricao_tecnica: body.descricao_tecnica.trim(),
    unidade_id: body.unidade_id || null,
    produtividade: body.produtividade?.trim() || null,
    markup_sugerido: body.markup_sugerido ?? 1,
    observacoes: body.observacoes?.trim() || null,
    tags: body.tags ?? [],
    ativo: body.ativo ?? true,
  }
  const materiaisNovos = normalizarMateriais(materiaisBody)
  const maoObraNova = normalizarMaoObra(maoObraBody)

  const resultado = await atualizarComposicaoSeMudou(supabase, user.id, id, camposNovos, materiaisNovos, maoObraNova)
  return NextResponse.json(resultado.body, { status: resultado.status })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const { error } = await supabase.from('composicoes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 4: Verificar que o comportamento não mudou**

Run: `npx tsc --noEmit`
Expected: zero erros envolvendo `lib/composicoes/atualizar.ts` ou `app/api/composicoes/[id]/route.ts`.

Run: `npm run test:run`
Expected: todos os testes continuam passando (nenhum teste existente cobre esta rota diretamente — a garantia de não-regressão aqui vem de comparar o corpo da função extraída contra o código original linha a linha, não de testes automatizados).

- [ ] **Step 5: Commit**

```bash
git add lib/composicoes/atualizar.ts "app/api/composicoes/[id]/route.ts"
git commit -m "refactor: extrai logica de atualizacao de composicao para lib/composicoes/atualizar.ts"
```

---

### Task 5: API — restaurar versão anterior

**Files:**
- Create: `app/api/composicoes/[id]/versoes/[versaoId]/restaurar/route.ts`

**Interfaces:**
- Consumes: `extrairCamposDeSnapshot` (Task 3), `normalizarMateriais`/`normalizarMaoObra` (já existentes), `atualizarComposicaoSeMudou` (Task 4).
- Produces: `POST /api/composicoes/[id]/versoes/[versaoId]/restaurar`, consumido pela Task 9.

- [ ] **Step 1: Implementar**

```typescript
// app/api/composicoes/[id]/versoes/[versaoId]/restaurar/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizarMateriais, normalizarMaoObra, extrairCamposDeSnapshot, type MaterialBody, type MaoObraBody } from '@/lib/composicoes/normalizar'
import { atualizarComposicaoSeMudou } from '@/lib/composicoes/atualizar'

interface SnapshotArquivado {
  composicao: {
    codigo: string
    nome: string
    disciplina_id: string | null
    descricao_tecnica: string
    unidade_id: string | null
    produtividade: string | null
    markup_sugerido: number
    observacoes: string | null
    tags?: string[]
    ativo?: boolean
  }
  materiais: MaterialBody[]
  mao_obra: MaoObraBody[]
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; versaoId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id, versaoId } = await params

  const { data: versaoRes, error: erroBusca } = await supabase
    .from('composicao_versoes')
    .select('snapshot')
    .eq('id', versaoId)
    .eq('composicao_id', id)
    .maybeSingle()
  if (erroBusca) return NextResponse.json({ error: erroBusca.message }, { status: 500 })
  if (!versaoRes) return NextResponse.json({ error: 'Versão não encontrada' }, { status: 404 })

  const snapshot = versaoRes.snapshot as SnapshotArquivado
  const camposNovos = extrairCamposDeSnapshot(snapshot.composicao)
  const materiaisNovos = normalizarMateriais(snapshot.materiais ?? [])
  const maoObraNova = normalizarMaoObra(snapshot.mao_obra ?? [])

  const resultado = await atualizarComposicaoSeMudou(supabase, user.id, id, camposNovos, materiaisNovos, maoObraNova)
  return NextResponse.json(resultado.body, { status: resultado.status })
}
```

- [ ] **Step 2: Verificar que o projeto compila**

Run: `npx tsc --noEmit`
Expected: zero erros envolvendo este arquivo.

- [ ] **Step 3: Commit**

```bash
git add "app/api/composicoes/[id]/versoes/[versaoId]/restaurar/route.ts"
git commit -m "feat: rota POST para restaurar versao anterior de composicao"
```

---

### Task 6: API — registrar uso ao inserir composição no orçamento

**Files:**
- Modify: `app/api/obras/[id]/grupos/[grupoId]/itens/route.ts`

**Interfaces:**
- Consumes: tabela `composicao_usos` (Task 1).
- Produces: efeito colateral (log de uso) no `POST` já existente dessa rota — nenhuma interface nova exposta a outras tasks.

**Contexto:** esta rota já existe desde a B1 e insere itens no orçamento (com ou sem `composicao_id`). Esta task só adiciona a gravação do log de uso dentro do branch que já trata `composicao_id`, sem alterar mais nada no arquivo.

- [ ] **Step 1: Ler o arquivo atual por completo**

Leia `app/api/obras/[id]/grupos/[grupoId]/itens/route.ts` inteiro antes de editar.

- [ ] **Step 2: Adicionar `id: obra_id` à desestruturação de `params`**

Troque:

```typescript
  const { grupoId: grupo_id } = await params
```

Por:

```typescript
  const { id: obra_id, grupoId: grupo_id } = await params
```

- [ ] **Step 3: Gravar o log de uso após inserir o item, dentro do branch `if (body.composicao_id)`**

Logo após o bloco:

```typescript
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
```

(o que fecha o branch `if (body.composicao_id) { ... }`), insira a gravação do log ANTES do `return`:

```typescript
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Log de uso — não bloqueia a criação do item, que já foi commitada com
    // sucesso acima. É telemetria suplementar (histórico "quantas vezes essa
    // composição já foi usada"), não um dado crítico do orçamento.
    const { error: erroUso } = await supabase.from('composicao_usos').insert({
      composicao_id: composicaoRes.data.id,
      composicao_versao: composicaoRes.data.versao,
      obra_id,
      usuario_id: user.id,
    })
    if (erroUso) {
      console.error('Falha ao registrar uso da composição:', erroUso.message)
    }

    return NextResponse.json(data, { status: 201 })
```

Não altere nada no branch `else` (item genérico sem `composicao_id`) nem na lógica de `numero`/`ordem` no topo do arquivo.

- [ ] **Step 4: Verificar que o comportamento genérico (sem composição) não mudou**

Run: `npx tsc --noEmit`
Expected: zero erros envolvendo este arquivo.

Releia o arquivo final e confirme: o branch sem `composicao_id` (linhas do `bodyGenerico` em diante) está byte-a-byte igual ao que já existia — só o branch `if (body.composicao_id)` ganhou as linhas novas do log.

- [ ] **Step 5: Commit**

```bash
git add "app/api/obras/[id]/grupos/[grupoId]/itens/route.ts"
git commit -m "feat: registra uso da composicao ao inserir no orcamento"
```

---

### Task 7: API — expor `total_usos`/`ultimo_uso` no detalhe + rota de lista de usos

**Files:**
- Modify: `app/api/composicoes/[id]/route.ts` (handler `GET`)
- Create: `app/api/composicoes/[id]/usos/route.ts`

**Interfaces:**
- Consumes: tabela `composicao_usos` (Task 1).
- Produces: `GET /api/composicoes/[id]` ganha `total_usos`/`ultimo_uso` na resposta; `GET /api/composicoes/[id]/usos` (lista detalhada) — ambos consumidos pela Task 9.

- [ ] **Step 1: Adicionar `total_usos`/`ultimo_uso` ao handler `GET` de `app/api/composicoes/[id]/route.ts`**

Localize o handler `GET` (reescrito na Task 4) e substitua o bloco entre a busca de `favorito` e o `return`:

De:

```typescript
  const { data: favorito } = await supabase
    .from('composicoes_favoritas')
    .select('composicao_id')
    .eq('usuario_id', user.id)
    .eq('composicao_id', id)
    .maybeSingle()

  return NextResponse.json({
    ...composicaoRes.data,
    favorito: !!favorito,
    composicao_materiais: materiaisRes.data ?? [],
    composicao_mao_obra: maoObraRes.data ?? [],
  })
```

Para:

```typescript
  const [{ data: favorito }, { count: totalUsos }, { data: ultimoUsoRows }] = await Promise.all([
    supabase
      .from('composicoes_favoritas')
      .select('composicao_id')
      .eq('usuario_id', user.id)
      .eq('composicao_id', id)
      .maybeSingle(),
    supabase
      .from('composicao_usos')
      .select('*', { count: 'exact', head: true })
      .eq('composicao_id', id),
    supabase
      .from('composicao_usos')
      .select('criado_em')
      .eq('composicao_id', id)
      .order('criado_em', { ascending: false })
      .limit(1),
  ])

  return NextResponse.json({
    ...composicaoRes.data,
    favorito: !!favorito,
    total_usos: totalUsos ?? 0,
    ultimo_uso: ultimoUsoRows?.[0]?.criado_em ?? null,
    composicao_materiais: materiaisRes.data ?? [],
    composicao_mao_obra: maoObraRes.data ?? [],
  })
```

Não altere o handler `PUT` nem `DELETE` neste arquivo.

- [ ] **Step 2: Criar a rota de lista detalhada de usos**

```typescript
// app/api/composicoes/[id]/usos/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const { data, error } = await supabase
    .from('composicao_usos')
    .select('id, composicao_id, composicao_versao, obra_id, usuario_id, criado_em, obras(codigo, nome), usuarios(nome)')
    .eq('composicao_id', id)
    .order('criado_em', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 3: Verificar que o projeto compila**

Run: `npx tsc --noEmit`
Expected: zero erros envolvendo os dois arquivos.

- [ ] **Step 4: Commit**

```bash
git add "app/api/composicoes/[id]/route.ts" "app/api/composicoes/[id]/usos/route.ts"
git commit -m "feat: expoe total_usos/ultimo_uso e lista detalhada de usos"
```

---

### Task 8: API — expor contagem de usos na biblioteca (lista)

**Files:**
- Modify: `app/api/composicoes/route.ts` (handler `GET`)

**Interfaces:**
- Consumes: tabela `composicao_usos` (Task 1).
- Produces: `GET /api/composicoes` (lista) ganha `total_usos`/`ultimo_uso` em cada item — consumido pela Task 10.

- [ ] **Step 1: Adicionar agregação de usos ao handler `GET` de `app/api/composicoes/route.ts`**

Localize o trecho final do handler `GET`:

```typescript
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const comFavorito = (data ?? []).map(c => ({ ...c, favorito: idsFavoritos.has(c.id) }))
  return NextResponse.json(comFavorito)
```

Substitua por:

```typescript
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const idsResultado = (data ?? []).map(c => c.id)
  const { data: usos, error: erroUsos } = idsResultado.length > 0
    ? await supabase.from('composicao_usos').select('composicao_id, criado_em').in('composicao_id', idsResultado)
    : { data: [], error: null }
  if (erroUsos) return NextResponse.json({ error: erroUsos.message }, { status: 500 })

  const usosPorComposicao = new Map<string, { total: number; ultimo: string }>()
  for (const uso of usos ?? []) {
    const atual = usosPorComposicao.get(uso.composicao_id)
    if (!atual) {
      usosPorComposicao.set(uso.composicao_id, { total: 1, ultimo: uso.criado_em })
    } else {
      atual.total += 1
      if (uso.criado_em > atual.ultimo) atual.ultimo = uso.criado_em
    }
  }

  const comFavoritoEUsos = (data ?? []).map(c => ({
    ...c,
    favorito: idsFavoritos.has(c.id),
    total_usos: usosPorComposicao.get(c.id)?.total ?? 0,
    ultimo_uso: usosPorComposicao.get(c.id)?.ultimo ?? null,
  }))
  return NextResponse.json(comFavoritoEUsos)
```

Não altere o handler `POST` neste arquivo.

- [ ] **Step 2: Verificar que o projeto compila**

Run: `npx tsc --noEmit`
Expected: zero erros envolvendo este arquivo.

- [ ] **Step 3: Commit**

```bash
git add app/api/composicoes/route.ts
git commit -m "feat: expoe contagem de usos na listagem de composicoes"
```

---

### Task 9: UI — restaurar versão e histórico de uso no `ComposicaoModal`

**Files:**
- Modify: `components/composicoes/ComposicaoModal.tsx`

**Interfaces:**
- Consumes: `POST /api/composicoes/[id]/versoes/[versaoId]/restaurar` (Task 5), `GET /api/composicoes/[id]/usos` (Task 7), `ComposicaoUso` (Task 2).
- Produces: nenhuma interface nova exposta a outros arquivos — só UI.

- [ ] **Step 1: Ler o arquivo atual por completo**

Leia `components/composicoes/ComposicaoModal.tsx` inteiro antes de editar — as mudanças abaixo assumem exatamente o conteúdo que já existe lá desde a B1.

- [ ] **Step 2: Adicionar import, estado e funções de restaurar/carregar usos**

Adicione ao import de tipos (linha com `import type { ComposicaoCompleta, ComposicaoVersao } from '@/types/database'`):

```typescript
import type { ComposicaoCompleta, ComposicaoVersao, ComposicaoUso } from '@/types/database'
```

Adicione um novo estado logo após `const [versoes, setVersoes] = useState<ComposicaoVersao[]>([])`:

```typescript
  const [usos, setUsos] = useState<ComposicaoUso[]>([])
  const [restaurando, setRestaurando] = useState<string | null>(null)
```

Na função `carregar`, adicione a busca de usos ao `Promise.all` existente. Troque:

```typescript
    const [resComposicao, resVersoes] = await Promise.all([
      fetch(`/api/composicoes/${composicaoId}`),
      fetch(`/api/composicoes/${composicaoId}/versoes`),
    ])
```

Por:

```typescript
    const [resComposicao, resVersoes, resUsos] = await Promise.all([
      fetch(`/api/composicoes/${composicaoId}`),
      fetch(`/api/composicoes/${composicaoId}/versoes`),
      fetch(`/api/composicoes/${composicaoId}/usos`),
    ])
```

E, logo após `setVersoes(Array.isArray(listaVersoes) ? listaVersoes : [])` (ainda dentro de `carregar`, antes de `setCarregando(false)`), adicione:

```typescript
    const listaUsos: ComposicaoUso[] = resUsos.ok ? await resUsos.json() : []
    setUsos(Array.isArray(listaUsos) ? listaUsos : [])
```

No branch de composição nova, dentro de `carregar`, troque:

```typescript
    if (!composicaoId) {
      setForm(FORM_VAZIO)
      setMateriais([])
      setMaoDeObra([])
      setVersoes([])
      return
    }
```

Por:

```typescript
    if (!composicaoId) {
      setForm(FORM_VAZIO)
      setMateriais([])
      setMaoDeObra([])
      setVersoes([])
      setUsos([])
      return
    }
```

Adicione a função `restaurarVersao`, logo após a função `carregar` (antes de `useEffect`):

```typescript
  async function restaurarVersao(versaoId: string) {
    if (!composicaoId) return
    if (!confirm('Restaurar esta versão? Isso cria uma nova versão com o conteúdo da versão selecionada.')) return
    setRestaurando(versaoId)
    const res = await fetch(`/api/composicoes/${composicaoId}/versoes/${versaoId}/restaurar`, { method: 'POST' })
    setRestaurando(null)
    if (!res.ok) {
      alert('Não foi possível restaurar essa versão. Tente novamente.')
      return
    }
    await carregar()
    onSalvo()
  }
```

- [ ] **Step 3: Adicionar o botão "Restaurar" no histórico de versões e a seção de histórico de uso**

Localize o bloco JSX do histórico de versões:

```typescript
            {versoes.length > 0 && (
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Histórico de versões</h3>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {versoes.map(v => (
                    <li key={v.id}>
                      v{v.versao} — {v.usuarios?.nome ?? 'usuário removido'} — {new Date(v.criado_em).toLocaleString('pt-BR')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
```

Substitua por (o botão "Restaurar" só aparece para versões que não são a mais recente — `versoes[0]`, já que a query em `versoes/route.ts` ordena por `versao` decrescente):

```typescript
            {versoes.length > 0 && (
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Histórico de versões</h3>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {versoes.map((v, i) => (
                    <li key={v.id} className="flex items-center justify-between gap-2">
                      <span>
                        v{v.versao} — {v.usuarios?.nome ?? 'usuário removido'} — {new Date(v.criado_em).toLocaleString('pt-BR')}
                      </span>
                      {i > 0 && (
                        <button
                          type="button"
                          onClick={() => restaurarVersao(v.id)}
                          disabled={restaurando !== null}
                          className="shrink-0 text-blue-600 hover:underline disabled:opacity-50"
                        >
                          {restaurando === v.id ? 'Restaurando...' : 'Restaurar esta versão'}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {composicaoId && (
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Histórico de uso</h3>
                {usos.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Ainda não foi usada em nenhum orçamento.</p>
                ) : (
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {usos.map(u => (
                      <li key={u.id}>
                        {u.obras?.codigo ?? '—'} {u.obras?.nome ?? ''} — {u.usuarios?.nome ?? 'usuário removido'} — {new Date(u.criado_em).toLocaleString('pt-BR')}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
```

- [ ] **Step 4: Verificar que o projeto compila**

Run: `npx tsc --noEmit`
Expected: zero erros envolvendo este arquivo.

- [ ] **Step 5: Commit**

```bash
git add components/composicoes/ComposicaoModal.tsx
git commit -m "feat: restaurar versao e historico de uso no modal de composicao"
```

---

### Task 10: UI — colunas "Usos" e "Último uso" na biblioteca

**Files:**
- Modify: `components/composicoes/ComposicoesPageClient.tsx`

**Interfaces:**
- Consumes: `total_usos`/`ultimo_uso` de `Composicao` (Task 2, já preenchidos pela Task 8 na resposta de `GET /api/composicoes`).
- Produces: nenhuma interface nova — só UI.

- [ ] **Step 1: Ler o arquivo atual por completo**

Leia `components/composicoes/ComposicoesPageClient.tsx` inteiro antes de editar.

- [ ] **Step 2: Adicionar as colunas ao cabeçalho da tabela**

Localize o `<thead>` e adicione duas colunas novas logo após a coluna "Versão":

De:

```typescript
                <th className="px-4 py-3 font-medium text-center">Versão</th>
                <th className="w-24 px-4 py-3 font-medium text-center">Ações</th>
```

Para:

```typescript
                <th className="px-4 py-3 font-medium text-center">Versão</th>
                <th className="px-4 py-3 font-medium text-center">Usos</th>
                <th className="px-4 py-3 font-medium">Último uso</th>
                <th className="w-24 px-4 py-3 font-medium text-center">Ações</th>
```

- [ ] **Step 3: Adicionar as células correspondentes no corpo da tabela**

Localize a célula da coluna "Versão" dentro do `.map(c => ...)`:

De:

```typescript
                  <td className="px-4 py-3 text-center text-muted-foreground">v{c.versao}</td>
```

Para:

```typescript
                  <td className="px-4 py-3 text-center text-muted-foreground">v{c.versao}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{c.total_usos ?? 0}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.ultimo_uso ? new Date(c.ultimo_uso).toLocaleDateString('pt-BR') : '—'}
                  </td>
```

- [ ] **Step 4: Verificar que o projeto compila**

Run: `npx tsc --noEmit`
Expected: zero erros envolvendo este arquivo.

- [ ] **Step 5: Rodar a suíte completa e o typecheck geral**

Run: `npm run test:run`
Expected: todos os testes passam (103 no total: 99 da B1 + 4 novos da Task 3), output limpo.

Run: `npx tsc --noEmit`
Expected: nenhum erro novo em qualquer arquivo tocado neste plano (erros pré-existentes em `*.test.tsx` por falta de tipos globais do vitest, se houver, não são deste plano).

- [ ] **Step 6: Commit**

```bash
git add components/composicoes/ComposicoesPageClient.tsx
git commit -m "feat: colunas de usos e ultimo uso na biblioteca de composicoes"
```

---

## Verificação manual final (fluxo ponta-a-ponta)

Depois de rodar a migration (Task 1) e concluir todas as tasks:

1. Rodar `npm run dev`, logar como usuário `admin` ou `engenheiro`.
2. Em `/composicoes`, abrir uma composição existente e editá-la 2 vezes (gerando v2 e v3). Confirmar que o histórico de versões lista v1/v2/v3.
3. Clicar "Restaurar esta versão" na v1. Confirmar que vira v4, com o conteúdo (materiais/mão de obra/campos) idêntico ao da v1.
4. Restaurar a mesma v1 de novo imediatamente (sem editar nada entre as restaurações) — se o conteúdo já é idêntico ao atual (v4, que acabou de ser restaurada da v1), confirmar que **não** cria v5.
5. Inserir essa composição em um orçamento (fluxo já existente desde a B1). Voltar em `/composicoes` e conferir que a coluna "Usos" foi de 0 para 1, e "Último uso" mostra a data de hoje.
6. Abrir a composição de novo e conferir a seção "Histórico de uso" — deve listar a obra, o usuário logado, e a data/hora da inserção.
7. Inserir a mesma composição em outro orçamento (ou de novo no mesmo) — conferir que "Usos" incrementa para 2 e "Último uso" atualiza.
8. Logar como `visualizador` e confirmar que o botão "Restaurar esta versão" não tem efeito (RLS bloqueia a escrita em `composicao_versoes`/`composicoes`/`composicao_materiais`/`composicao_mao_obra`).
