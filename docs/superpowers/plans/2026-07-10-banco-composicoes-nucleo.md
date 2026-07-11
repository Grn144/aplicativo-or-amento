# Banco de Composições — Fase B1 (Núcleo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundational Banco de Composições — cadastro completo (materiais + mão de obra), biblioteca com busca/filtros/favoritos, inserção em um clique no orçamento, e versionamento por snapshot.

**Architecture:** Segue exatamente os padrões já usados no projeto (`clientes`, `obras`): migration SQL → tipos TypeScript em `types/database.ts` → função pura de cálculo em `lib/` com teste Vitest → rotas Route Handler em `app/api/` (Supabase + RLS fazem a autorização) → página Server Component que busca dados e repassa a um Client Component → componentes de UI com Tailwind + shadcn/ui (`Dialog`, `Input`, `NativeSelect`).

**Tech Stack:** Next.js 15 (App Router) + TypeScript, Supabase (Postgres + Auth + RLS), Tailwind + shadcn/ui, Vitest + Testing Library.

## Global Constraints

- Composição tem **só** Materiais e Mão de obra — sem Equipamentos nem Serviços Terceirizados (decisão do usuário, ver spec seção 1).
- "Categoria" = campo `disciplina_id`, reusando a tabela `disciplinas` já existente — nunca criar uma tabela de categorias separada.
- Só existe `markup_sugerido` (multiplicador) — nunca adicionar um campo de "margem %" na composição.
- `fornecedor` (material) e `cargo` (mão de obra) são texto livre — nunca criar tabelas `fornecedores`/`cargos`.
- Ao editar uma composição já usada em orçamentos, os itens já inseridos **não mudam** — `composicao_id`/`composicao_versao` no item são só rastreabilidade, nunca uma referência viva.
- Permissões: admin/engenheiro/orcamentista podem criar/editar/excluir composições e inserir no orçamento; visualizador só lê/busca — mesmo padrão de `disciplinas_write`/`unidades_write` em `002_rls_policies.sql`.
- Precisão numérica: seguir `itens_orcamento` — custos e quantidades em `numeric(18,6)`, markup em `numeric(18,10)` (ver `009_custo_precisao.sql` e `006_markup_precisao.sql`).
- Fora de escopo nesta fase: restaurar versão anterior, histórico de uso/aprovação, import/export Excel, dashboard de indicadores, IA integrada, anexos. Não implementar nada disso.

---

### Task 1: Migration — schema do Banco de Composições

**Files:**
- Create: `supabase/migrations/010_banco_composicoes.sql`

**Interfaces:**
- Produces: tabelas `composicoes`, `composicao_materiais`, `composicao_mao_obra`, `composicao_versoes`, `composicoes_favoritas`; colunas novas `itens_orcamento.composicao_id`, `itens_orcamento.composicao_versao`. Usadas por todas as tasks seguintes.
- Consumes: função `get_user_papel()` e tabelas `disciplinas`, `unidades_medida`, `usuarios`, `itens_orcamento` (já existentes, definidas em `001_initial_schema.sql`/`002_rls_policies.sql`).

- [ ] **Step 1: Escrever a migration**

```sql
-- 010_banco_composicoes.sql
-- Fase B1 do Banco de Composições Reutilizável: cadastro + estrutura
-- (materiais + mão de obra) + biblioteca (busca/favoritos) + versionamento
-- por snapshot + rastreabilidade em itens_orcamento.
-- Ver docs/superpowers/specs/2026-07-10-banco-composicoes-nucleo-design.md
--
-- Composição tem só Materiais e Mão de obra (sem Equipamentos/Serviços
-- Terceirizados) — casa com os dois buckets de custo que itens_orcamento
-- já tem (custo_unit_material/custo_unit_mao_obra).

CREATE TABLE composicoes (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo            text NOT NULL UNIQUE,
  nome              text NOT NULL,
  disciplina_id     uuid REFERENCES disciplinas(id),
  descricao_tecnica text NOT NULL,
  unidade_id        uuid REFERENCES unidades_medida(id),
  produtividade     text,
  custo_direto      numeric(18,6) NOT NULL DEFAULT 0,
  markup_sugerido   numeric(18,10) NOT NULL DEFAULT 1,
  observacoes       text,
  tags              text[] NOT NULL DEFAULT '{}',
  versao            integer NOT NULL DEFAULT 1,
  ativo             boolean NOT NULL DEFAULT true,
  responsavel_id    uuid REFERENCES usuarios(id),
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE composicao_materiais (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  composicao_id  uuid NOT NULL REFERENCES composicoes(id) ON DELETE CASCADE,
  descricao      text NOT NULL,
  quantidade     numeric(18,6) NOT NULL,
  unidade_id     uuid REFERENCES unidades_medida(id),
  fornecedor     text,
  preco_unitario numeric(18,6) NOT NULL,
  ordem          integer NOT NULL
);

CREATE TABLE composicao_mao_obra (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  composicao_id  uuid NOT NULL REFERENCES composicoes(id) ON DELETE CASCADE,
  cargo          text NOT NULL,
  horas          numeric(18,6) NOT NULL,
  custo_hora     numeric(18,6) NOT NULL,
  ordem          integer NOT NULL
);

CREATE TABLE composicao_versoes (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  composicao_id  uuid NOT NULL REFERENCES composicoes(id) ON DELETE CASCADE,
  versao         integer NOT NULL,
  snapshot       jsonb NOT NULL,
  usuario_id     uuid REFERENCES usuarios(id),
  criado_em      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE composicoes_favoritas (
  usuario_id     uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  composicao_id  uuid NOT NULL REFERENCES composicoes(id) ON DELETE CASCADE,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, composicao_id)
);

-- Rastreabilidade: item pode vir de uma composição (nullable — item digitado
-- manualmente continua sem referência). SET NULL: excluir a composição não
-- pode apagar nem travar itens já inseridos em orçamentos.
ALTER TABLE itens_orcamento
  ADD COLUMN composicao_id     uuid REFERENCES composicoes(id) ON DELETE SET NULL,
  ADD COLUMN composicao_versao integer;

CREATE INDEX ON composicao_materiais (composicao_id);
CREATE INDEX ON composicao_mao_obra (composicao_id);
CREATE INDEX ON composicao_versoes (composicao_id);
CREATE INDEX ON composicoes (disciplina_id);
CREATE INDEX ON itens_orcamento (composicao_id);

-- RLS: mesmo padrão de disciplinas/unidades_medida (leitura ampla para
-- autenticados, escrita restrita por papel). get_user_papel() já existe.
ALTER TABLE composicoes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE composicao_materiais   ENABLE ROW LEVEL SECURITY;
ALTER TABLE composicao_mao_obra    ENABLE ROW LEVEL SECURITY;
ALTER TABLE composicao_versoes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE composicoes_favoritas  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "composicoes_select" ON composicoes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "composicoes_write" ON composicoes
  FOR ALL TO authenticated
  USING (get_user_papel() IN ('admin','engenheiro','orcamentista'))
  WITH CHECK (get_user_papel() IN ('admin','engenheiro','orcamentista'));

CREATE POLICY "composicao_materiais_select" ON composicao_materiais
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "composicao_materiais_write" ON composicao_materiais
  FOR ALL TO authenticated
  USING (get_user_papel() IN ('admin','engenheiro','orcamentista'))
  WITH CHECK (get_user_papel() IN ('admin','engenheiro','orcamentista'));

CREATE POLICY "composicao_mao_obra_select" ON composicao_mao_obra
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "composicao_mao_obra_write" ON composicao_mao_obra
  FOR ALL TO authenticated
  USING (get_user_papel() IN ('admin','engenheiro','orcamentista'))
  WITH CHECK (get_user_papel() IN ('admin','engenheiro','orcamentista'));

CREATE POLICY "composicao_versoes_select" ON composicao_versoes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "composicao_versoes_insert" ON composicao_versoes
  FOR INSERT TO authenticated
  WITH CHECK (get_user_papel() IN ('admin','engenheiro','orcamentista'));

-- Favoritos: cada usuário só vê/gerencia os próprios
CREATE POLICY "composicoes_favoritas_own" ON composicoes_favoritas
  FOR ALL TO authenticated
  USING (usuario_id = auth.uid())
  WITH CHECK (usuario_id = auth.uid());
```

- [ ] **Step 2: Rodar a migration no Supabase SQL Editor**

O usuário roda migrations manualmente no Supabase SQL Editor (não há CLI de migration automatizada neste projeto). Cole o conteúdo de `010_banco_composicoes.sql` e execute. Confirme sem erros: `SELECT * FROM composicoes LIMIT 1;` deve retornar 0 linhas sem erro.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/010_banco_composicoes.sql
git commit -m "feat: migration do banco de composicoes (fase B1)"
```

---

### Task 2: Tipos TypeScript

**Files:**
- Modify: `types/database.ts`

**Interfaces:**
- Consumes: `Disciplina`, `UnidadeMedida`, `Usuario`, `ItemOrcamento` (já definidos no mesmo arquivo).
- Produces: `Composicao`, `ComposicaoMaterial`, `ComposicaoMaoObra`, `ComposicaoVersao` — usados por todas as rotas de API e componentes das tasks seguintes. `ItemOrcamento` ganha `composicao_id`/`composicao_versao`.

- [ ] **Step 1: Adicionar os tipos ao final de `types/database.ts`**

Primeiro, adicione os dois campos novos na interface `ItemOrcamento` já existente (logo após `ordem: number`):

```typescript
export interface ItemOrcamento {
  id: string
  grupo_id: string
  numero: number
  descricao: string
  local: string | null
  unidade_id: string | null
  quantidade: number
  custo_unit_mao_obra: number
  custo_unit_material: number
  markup_mao_obra: number
  markup_material: number
  fee_mao_obra: number | null
  fee_material: number | null
  observacao: string | null
  observacao_2: string | null
  ordem: number
  composicao_id: string | null
  composicao_versao: number | null
  unidades_medida?: UnidadeMedida
}
```

Depois, adicione ao final do arquivo (após `HistoricoAlteracao`):

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
}

export interface ComposicaoMaterial {
  id: string
  composicao_id: string
  descricao: string
  quantidade: number
  unidade_id: string | null
  fornecedor: string | null
  preco_unitario: number
  ordem: number
  unidades_medida?: Pick<UnidadeMedida, 'id' | 'sigla'> | null
}

export interface ComposicaoMaoObra {
  id: string
  composicao_id: string
  cargo: string
  horas: number
  custo_hora: number
  ordem: number
}

export interface ComposicaoVersao {
  id: string
  composicao_id: string
  versao: number
  usuario_id: string | null
  criado_em: string
  usuarios?: Pick<Usuario, 'nome'> | null
}

export interface ComposicaoCompleta extends Composicao {
  composicao_materiais: ComposicaoMaterial[]
  composicao_mao_obra: ComposicaoMaoObra[]
}
```

- [ ] **Step 2: Verificar que o projeto compila**

Run: `npm run build`
Expected: build sem erros de tipo (nenhum código ainda usa os tipos novos, então isso só confirma que a sintaxe está correta).

- [ ] **Step 3: Commit**

```bash
git add types/database.ts
git commit -m "feat: tipos TypeScript do banco de composicoes"
```

---

### Task 3: Cálculo de composição (`lib/composicoes/calculos.ts`)

**Files:**
- Create: `lib/composicoes/calculos.ts`
- Create: `lib/composicoes/calculos.test.ts`

**Interfaces:**
- Consumes: nada (funções puras, sem dependência de banco).
- Produces: `calcularCustoDireto(materiais, maoDeObra): number`, `mapearComposicaoParaItem(composicao, materiais, maoDeObra): CamposItemDeComposicao` e `composicaoMudou(antiga, nova): boolean` — usados pelas rotas de API das Tasks 4, 5 e 8.

- [ ] **Step 1: Escrever os testes (falhando)**

```typescript
// lib/composicoes/calculos.test.ts
import { describe, it, expect } from 'vitest'
import { calcularCustoDireto, mapearComposicaoParaItem, composicaoMudou } from './calculos'

describe('calcularCustoDireto', () => {
  it('soma materiais e mão de obra por 1 unidade de referência', () => {
    const materiais = [
      { quantidade: 2, preco_unitario: 10 },   // 20
      { quantidade: 0.5, preco_unitario: 100 }, // 50
    ]
    const maoDeObra = [
      { horas: 1, custo_hora: 30 },  // 30
      { horas: 2, custo_hora: 15 },  // 30
    ]
    expect(calcularCustoDireto(materiais, maoDeObra)).toBeCloseTo(130)
  })

  it('retorna 0 para composição sem materiais nem mão de obra', () => {
    expect(calcularCustoDireto([], [])).toBe(0)
  })
})

describe('mapearComposicaoParaItem', () => {
  it('agrega custo de material e mão de obra e replica o markup sugerido nos dois campos', () => {
    const composicao = {
      descricao_tecnica: 'Instalação, configuração e testes de câmera IP',
      unidade_id: 'un-1',
      markup_sugerido: 1.65,
    }
    const materiais = [{ quantidade: 1, preco_unitario: 250 }]
    const maoDeObra = [
      { horas: 2, custo_hora: 40 },
      { horas: 1, custo_hora: 25 },
    ]
    const campos = mapearComposicaoParaItem(composicao, materiais, maoDeObra)
    expect(campos.descricao).toBe('Instalação, configuração e testes de câmera IP')
    expect(campos.unidade_id).toBe('un-1')
    expect(campos.custo_unit_material).toBeCloseTo(250)
    expect(campos.custo_unit_mao_obra).toBeCloseTo(105)
    expect(campos.markup_material).toBe(1.65)
    expect(campos.markup_mao_obra).toBe(1.65)
  })
})

describe('composicaoMudou', () => {
  it('retorna false quando campos, materiais e mão de obra são idênticos', () => {
    const snapshot = {
      campos: { nome: 'Instalação de câmera' },
      materiais: [{ preco_unitario: 250 }],
      maoDeObra: [{ horas: 2 }],
    }
    expect(composicaoMudou(snapshot, { ...snapshot })).toBe(false)
  })

  it('retorna true quando um campo simples muda', () => {
    const antiga = { campos: { nome: 'X' }, materiais: [], maoDeObra: [] }
    const nova = { campos: { nome: 'Y' }, materiais: [], maoDeObra: [] }
    expect(composicaoMudou(antiga, nova)).toBe(true)
  })

  it('retorna true quando o preço de um material muda', () => {
    const antiga = { campos: {}, materiais: [{ preco_unitario: 10 }], maoDeObra: [] }
    const nova = { campos: {}, materiais: [{ preco_unitario: 12 }], maoDeObra: [] }
    expect(composicaoMudou(antiga, nova)).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run lib/composicoes/calculos.test.ts`
Expected: FAIL — `Cannot find module './calculos'`

- [ ] **Step 3: Implementar**

```typescript
// lib/composicoes/calculos.ts

export interface MaterialParaCalculo {
  quantidade: number
  preco_unitario: number
}

export interface MaoObraParaCalculo {
  horas: number
  custo_hora: number
}

export function calcularCustoDireto(
  materiais: MaterialParaCalculo[],
  maoDeObra: MaoObraParaCalculo[]
): number {
  const totalMateriais = materiais.reduce((acc, m) => acc + m.quantidade * m.preco_unitario, 0)
  const totalMaoDeObra = maoDeObra.reduce((acc, m) => acc + m.horas * m.custo_hora, 0)
  return totalMateriais + totalMaoDeObra
}

export interface ComposicaoParaMapear {
  descricao_tecnica: string
  unidade_id: string | null
  markup_sugerido: number
}

export interface CamposItemDeComposicao {
  descricao: string
  unidade_id: string | null
  custo_unit_material: number
  custo_unit_mao_obra: number
  markup_material: number
  markup_mao_obra: number
}

export function mapearComposicaoParaItem(
  composicao: ComposicaoParaMapear,
  materiais: MaterialParaCalculo[],
  maoDeObra: MaoObraParaCalculo[]
): CamposItemDeComposicao {
  const custo_unit_material = materiais.reduce((acc, m) => acc + m.quantidade * m.preco_unitario, 0)
  const custo_unit_mao_obra = maoDeObra.reduce((acc, m) => acc + m.horas * m.custo_hora, 0)
  return {
    descricao: composicao.descricao_tecnica,
    unidade_id: composicao.unidade_id,
    custo_unit_material,
    custo_unit_mao_obra,
    markup_material: composicao.markup_sugerido,
    markup_mao_obra: composicao.markup_sugerido,
  }
}

export interface SnapshotComparavel {
  campos: Record<string, unknown>
  materiais: Record<string, unknown>[]
  maoDeObra: Record<string, unknown>[]
}

/** Compara dois snapshots (campos simples + listas de materiais/mão de obra
 * normalizadas) para decidir se uma nova versão deve ser gravada ao salvar. */
export function composicaoMudou(antiga: SnapshotComparavel, nova: SnapshotComparavel): boolean {
  return (
    JSON.stringify(antiga.campos) !== JSON.stringify(nova.campos) ||
    JSON.stringify(antiga.materiais) !== JSON.stringify(nova.materiais) ||
    JSON.stringify(antiga.maoDeObra) !== JSON.stringify(nova.maoDeObra)
  )
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run lib/composicoes/calculos.test.ts`
Expected: PASS (7 testes)

- [ ] **Step 5: Commit**

```bash
git add lib/composicoes/calculos.ts lib/composicoes/calculos.test.ts
git commit -m "feat: calculo de custo direto e mapeamento composicao->item"
```

---

### Task 4: API — listar e criar composições

**Files:**
- Create: `app/api/composicoes/route.ts`

**Interfaces:**
- Consumes: `createClient` (`@/lib/supabase/server`), `lerJson` (`@/lib/http`), `calcularCustoDireto` (`@/lib/composicoes/calculos`).
- Produces: `GET /api/composicoes` e `POST /api/composicoes`, consumidos pelo componente da Task 10 e pelo modal da Task 9.

- [ ] **Step 1: Implementar**

```typescript
// app/api/composicoes/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lerJson } from '@/lib/http'
import { calcularCustoDireto } from '@/lib/composicoes/calculos'

type MaterialBody = { descricao?: string; quantidade?: number; unidade_id?: string | null; fornecedor?: string | null; preco_unitario?: number }
type MaoObraBody = { cargo?: string; horas?: number; custo_hora?: number }
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
  materiais?: MaterialBody[]
  mao_obra?: MaoObraBody[]
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const busca = searchParams.get('busca') ?? ''
  const buscaSanitizada = busca.replace(/[(),]/g, '')
  const disciplinaId = searchParams.get('disciplina_id') ?? ''
  const tag = searchParams.get('tag') ?? ''
  const somenteFavoritos = searchParams.get('favoritos') === 'true'

  const { data: favoritas } = await supabase
    .from('composicoes_favoritas')
    .select('composicao_id')
    .eq('usuario_id', user.id)
  const idsFavoritos = new Set((favoritas ?? []).map(f => f.composicao_id))

  let query = supabase
    .from('composicoes')
    .select('*, disciplinas(id, nome), unidades_medida(id, sigla)')
    .eq('ativo', true)
    .order('nome')

  if (buscaSanitizada) {
    query = query.or(
      `nome.ilike.%${buscaSanitizada}%,codigo.ilike.%${buscaSanitizada}%,descricao_tecnica.ilike.%${buscaSanitizada}%`
    )
  }
  if (disciplinaId) query = query.eq('disciplina_id', disciplinaId)
  if (tag) query = query.contains('tags', [tag])
  if (somenteFavoritos) {
    const ids = Array.from(idsFavoritos)
    if (ids.length === 0) return NextResponse.json([])
    query = query.in('id', ids)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const comFavorito = (data ?? []).map(c => ({ ...c, favorito: idsFavoritos.has(c.id) }))
  return NextResponse.json(comFavorito)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await lerJson<ComposicaoBody>(request)
  if (!body) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 })

  if (!body.codigo?.trim() || !body.nome?.trim() || !body.descricao_tecnica?.trim()) {
    return NextResponse.json({ error: 'Código, nome e descrição técnica são obrigatórios' }, { status: 400 })
  }
  const materiais = body.materiais ?? []
  const maoObra = body.mao_obra ?? []
  if (materiais.length === 0 && maoObra.length === 0) {
    return NextResponse.json(
      { error: 'A composição precisa ter ao menos um material ou item de mão de obra' },
      { status: 400 }
    )
  }

  const custo_direto = calcularCustoDireto(
    materiais.map(m => ({ quantidade: m.quantidade ?? 0, preco_unitario: m.preco_unitario ?? 0 })),
    maoObra.map(m => ({ horas: m.horas ?? 0, custo_hora: m.custo_hora ?? 0 }))
  )

  const { data: composicao, error: erroComposicao } = await supabase
    .from('composicoes')
    .insert({
      codigo: body.codigo.trim(),
      nome: body.nome.trim(),
      disciplina_id: body.disciplina_id || null,
      descricao_tecnica: body.descricao_tecnica.trim(),
      unidade_id: body.unidade_id || null,
      produtividade: body.produtividade?.trim() || null,
      custo_direto,
      markup_sugerido: body.markup_sugerido ?? 1,
      observacoes: body.observacoes?.trim() || null,
      tags: body.tags ?? [],
      versao: 1,
      responsavel_id: user.id,
    })
    .select('*, disciplinas(id, nome), unidades_medida(id, sigla)')
    .single()

  if (erroComposicao) return NextResponse.json({ error: erroComposicao.message }, { status: 500 })

  const materiaisParaInserir = materiais.map((m, i) => ({
    composicao_id: composicao.id,
    descricao: m.descricao ?? '',
    quantidade: m.quantidade ?? 0,
    unidade_id: m.unidade_id || null,
    fornecedor: m.fornecedor?.trim() || null,
    preco_unitario: m.preco_unitario ?? 0,
    ordem: i + 1,
  }))
  const maoObraParaInserir = maoObra.map((m, i) => ({
    composicao_id: composicao.id,
    cargo: m.cargo ?? '',
    horas: m.horas ?? 0,
    custo_hora: m.custo_hora ?? 0,
    ordem: i + 1,
  }))

  const [resMateriais, resMaoObra] = await Promise.all([
    materiaisParaInserir.length > 0
      ? supabase.from('composicao_materiais').insert(materiaisParaInserir).select('*, unidades_medida(id, sigla)')
      : Promise.resolve({ data: [], error: null }),
    maoObraParaInserir.length > 0
      ? supabase.from('composicao_mao_obra').insert(maoObraParaInserir).select('*')
      : Promise.resolve({ data: [], error: null }),
  ])
  if (resMateriais.error) return NextResponse.json({ error: resMateriais.error.message }, { status: 500 })
  if (resMaoObra.error) return NextResponse.json({ error: resMaoObra.error.message }, { status: 500 })

  await supabase.from('composicao_versoes').insert({
    composicao_id: composicao.id,
    versao: 1,
    snapshot: { composicao, materiais: resMateriais.data, mao_obra: resMaoObra.data },
    usuario_id: user.id,
  })

  return NextResponse.json(
    { ...composicao, composicao_materiais: resMateriais.data, composicao_mao_obra: resMaoObra.data },
    { status: 201 }
  )
}
```

- [ ] **Step 2: Verificar que o projeto compila**

Run: `npm run build`
Expected: build sem erros de tipo.

- [ ] **Step 3: Commit**

```bash
git add app/api/composicoes/route.ts
git commit -m "feat: rota GET/POST /api/composicoes (listar e criar)"
```

---

### Task 5: API — detalhe, atualizar (com versionamento) e excluir composição

**Files:**
- Create: `app/api/composicoes/[id]/route.ts`

**Interfaces:**
- Consumes: mesmos imports da Task 4, mais `composicaoMudou` (`@/lib/composicoes/calculos`, Task 3) e o tipo `ComposicaoBody` (redefinido localmente, igual ao de `route.ts` — arquivos de rota não compartilham módulo entre si neste projeto, ver `app/api/clientes/route.ts` vs `app/api/clientes/[id]/route.ts`).
- Produces: `GET/PUT/DELETE /api/composicoes/[id]`, consumidos pelo modal da Task 9.

- [ ] **Step 1: Implementar**

```typescript
// app/api/composicoes/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lerJson } from '@/lib/http'
import { calcularCustoDireto, composicaoMudou } from '@/lib/composicoes/calculos'

type MaterialBody = { descricao?: string; quantidade?: number; unidade_id?: string | null; fornecedor?: string | null; preco_unitario?: number }
type MaoObraBody = { cargo?: string; horas?: number; custo_hora?: number }
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

async function carregarComposicaoCompleta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string
) {
  const [composicaoRes, materiaisRes, maoObraRes] = await Promise.all([
    supabase.from('composicoes').select('*, disciplinas(id, nome), unidades_medida(id, sigla)').eq('id', id).single(),
    supabase.from('composicao_materiais').select('*, unidades_medida(id, sigla)').eq('composicao_id', id).order('ordem'),
    supabase.from('composicao_mao_obra').select('*').eq('composicao_id', id).order('ordem'),
  ])
  return { composicaoRes, materiaisRes, maoObraRes }
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

  const { composicaoRes: atual, materiaisRes: materiaisAtuais, maoObraRes: maoObraAtual } =
    await carregarComposicaoCompleta(supabase, id)
  if (atual.error) {
    if (atual.error.code === 'PGRST116') return NextResponse.json({ error: 'Composição não encontrada' }, { status: 404 })
    return NextResponse.json({ error: atual.error.message }, { status: 500 })
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
  const materiaisNovos = materiaisBody.map((m, i) => ({
    descricao: m.descricao ?? '',
    quantidade: m.quantidade ?? 0,
    unidade_id: m.unidade_id || null,
    fornecedor: m.fornecedor?.trim() || null,
    preco_unitario: m.preco_unitario ?? 0,
    ordem: i + 1,
  }))
  const maoObraNova = maoObraBody.map((m, i) => ({
    cargo: m.cargo ?? '',
    horas: m.horas ?? 0,
    custo_hora: m.custo_hora ?? 0,
    ordem: i + 1,
  }))

  const camposAntigos = {
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
    return NextResponse.json({
      ...atual.data,
      composicao_materiais: materiaisAtuais.data ?? [],
      composicao_mao_obra: maoObraAtual.data ?? [],
    })
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
  if (erroUpdate) return NextResponse.json({ error: erroUpdate.message }, { status: 500 })

  await supabase.from('composicao_materiais').delete().eq('composicao_id', id)
  await supabase.from('composicao_mao_obra').delete().eq('composicao_id', id)

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
  if (resMateriais.error) return NextResponse.json({ error: resMateriais.error.message }, { status: 500 })
  if (resMaoObra.error) return NextResponse.json({ error: resMaoObra.error.message }, { status: 500 })

  await supabase.from('composicao_versoes').insert({
    composicao_id: id,
    versao: novaVersao,
    snapshot: { composicao: composicaoAtualizada, materiais: resMateriais.data, mao_obra: resMaoObra.data },
    usuario_id: user.id,
  })

  return NextResponse.json({
    ...composicaoAtualizada,
    composicao_materiais: resMateriais.data,
    composicao_mao_obra: resMaoObra.data,
  })
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

- [ ] **Step 2: Verificar que o projeto compila**

Run: `npm run build`
Expected: build sem erros de tipo.

- [ ] **Step 3: Commit**

```bash
git add app/api/composicoes/[id]/route.ts
git commit -m "feat: rota GET/PUT/DELETE /api/composicoes/[id] com versionamento por snapshot"
```

---

### Task 6: API — histórico de versões

**Files:**
- Create: `app/api/composicoes/[id]/versoes/route.ts`

**Interfaces:**
- Consumes: `createClient`.
- Produces: `GET /api/composicoes/[id]/versoes`, consumido pelo modal da Task 9.

- [ ] **Step 1: Implementar**

```typescript
// app/api/composicoes/[id]/versoes/route.ts
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
    .from('composicao_versoes')
    .select('id, composicao_id, versao, usuario_id, criado_em, usuarios(nome)')
    .eq('composicao_id', id)
    .order('versao', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Verificar que o projeto compila**

Run: `npm run build`
Expected: build sem erros de tipo.

- [ ] **Step 3: Commit**

```bash
git add app/api/composicoes/[id]/versoes/route.ts
git commit -m "feat: rota GET /api/composicoes/[id]/versoes (historico)"
```

---

### Task 7: API — favoritar/desfavoritar

**Files:**
- Create: `app/api/composicoes/[id]/favorito/route.ts`

**Interfaces:**
- Consumes: `createClient`.
- Produces: `POST/DELETE /api/composicoes/[id]/favorito`, consumido pelos componentes das Tasks 9 e 10.

- [ ] **Step 1: Implementar**

```typescript
// app/api/composicoes/[id]/favorito/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const { error } = await supabase
    .from('composicoes_favoritas')
    .upsert({ usuario_id: user.id, composicao_id: id }, { onConflict: 'usuario_id,composicao_id', ignoreDuplicates: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const { error } = await supabase
    .from('composicoes_favoritas')
    .delete()
    .eq('usuario_id', user.id)
    .eq('composicao_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 2: Verificar que o projeto compila**

Run: `npm run build`
Expected: build sem erros de tipo.

- [ ] **Step 3: Commit**

```bash
git add app/api/composicoes/[id]/favorito/route.ts
git commit -m "feat: rota POST/DELETE /api/composicoes/[id]/favorito"
```

---

### Task 8: Inserir composição no orçamento (modifica rota de itens existente)

**Files:**
- Modify: `app/api/obras/[id]/grupos/[grupoId]/itens/route.ts`

**Interfaces:**
- Consumes: `mapearComposicaoParaItem` (`@/lib/composicoes/calculos`), tabelas `composicoes`/`composicao_materiais`/`composicao_mao_obra`.
- Produces: `POST` da mesma rota aceita agora `composicao_id` opcional no corpo — consumido pelo componente da Task 11.

- [ ] **Step 1: Reescrever o handler POST**

Substituir todo o conteúdo de `app/api/obras/[id]/grupos/[grupoId]/itens/route.ts`:

```typescript
// app/api/obras/[id]/grupos/[grupoId]/itens/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lerJson } from '@/lib/http'
import { mapearComposicaoParaItem } from '@/lib/composicoes/calculos'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; grupoId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { grupoId: grupo_id } = await params
  const body = await lerJson<{ composicao_id?: string; quantidade?: number }>(request)
  if (!body) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 })

  // Próximo número e ordem
  const { count } = await supabase
    .from('itens_orcamento')
    .select('*', { count: 'exact', head: true })
    .eq('grupo_id', grupo_id)

  const numero = (count ?? 0) + 1
  const ordem = numero

  if (body.composicao_id) {
    if (!body.quantidade || body.quantidade <= 0) {
      return NextResponse.json(
        { error: 'Quantidade deve ser maior que zero para inserir uma composição' },
        { status: 400 }
      )
    }

    const [composicaoRes, materiaisRes, maoObraRes] = await Promise.all([
      supabase.from('composicoes').select('*').eq('id', body.composicao_id).single(),
      supabase.from('composicao_materiais').select('*').eq('composicao_id', body.composicao_id),
      supabase.from('composicao_mao_obra').select('*').eq('composicao_id', body.composicao_id),
    ])
    if (composicaoRes.error || !composicaoRes.data) {
      return NextResponse.json({ error: 'Composição não encontrada' }, { status: 404 })
    }

    const campos = mapearComposicaoParaItem(
      composicaoRes.data,
      (materiaisRes.data ?? []).map(m => ({ quantidade: m.quantidade, preco_unitario: m.preco_unitario })),
      (maoObraRes.data ?? []).map(m => ({ horas: m.horas, custo_hora: m.custo_hora }))
    )

    const { data, error } = await supabase
      .from('itens_orcamento')
      .insert({
        grupo_id,
        numero,
        ordem,
        descricao: campos.descricao,
        unidade_id: campos.unidade_id,
        quantidade: body.quantidade,
        custo_unit_mao_obra: campos.custo_unit_mao_obra,
        custo_unit_material: campos.custo_unit_material,
        markup_mao_obra: campos.markup_mao_obra,
        markup_material: campos.markup_material,
        composicao_id: composicaoRes.data.id,
        composicao_versao: composicaoRes.data.versao,
      })
      .select('*, unidades_medida(*)')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }

  const bodyGenerico = body as Record<string, unknown>
  const { data, error } = await supabase
    .from('itens_orcamento')
    .insert({
      grupo_id,
      numero,
      ordem,
      descricao: bodyGenerico.descricao ?? 'Novo item',
      local: bodyGenerico.local ?? null,
      unidade_id: bodyGenerico.unidade_id ?? null,
      quantidade: bodyGenerico.quantidade ?? 0,
      custo_unit_mao_obra: bodyGenerico.custo_unit_mao_obra ?? 0,
      custo_unit_material: bodyGenerico.custo_unit_material ?? 0,
      observacao: bodyGenerico.observacao ?? null,
      observacao_2: bodyGenerico.observacao_2 ?? null,
    })
    .select('*, unidades_medida(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Verificar que o projeto compila**

Run: `npm run build`
Expected: build sem erros de tipo.

- [ ] **Step 3: Commit**

```bash
git add app/api/obras/[id]/grupos/[grupoId]/itens/route.ts
git commit -m "feat: inserir composicao no orcamento via POST de itens"
```

---

### Task 9: Componente `ComposicaoModal` (criar/editar)

**Files:**
- Create: `components/composicoes/ComposicaoModal.tsx`

**Interfaces:**
- Consumes: `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter` (`@/components/ui/dialog`), `Button`, `Input`, `Label`, `Textarea`, `NativeSelect`; tipos `Composicao`, `ComposicaoCompleta` (`@/types/database`); `calcularCustoDireto` (`@/lib/composicoes/calculos`).
- Produces: componente `ComposicaoModal` com props `{ aberto, onOpenChange, composicaoId, disciplinas, unidades, onSalvo }` — usado pela Task 10.

- [ ] **Step 1: Implementar**

```typescript
// components/composicoes/ComposicaoModal.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { calcularCustoDireto } from '@/lib/composicoes/calculos'
import type { ComposicaoCompleta, ComposicaoVersao } from '@/types/database'

type MaterialForm = { descricao: string; quantidade: string; unidade_id: string; fornecedor: string; preco_unitario: string }
type MaoObraForm = { cargo: string; horas: string; custo_hora: string }

type FormComposicao = {
  codigo: string
  nome: string
  disciplina_id: string
  descricao_tecnica: string
  unidade_id: string
  produtividade: string
  markup_sugerido: string
  observacoes: string
  tags: string
}

const FORM_VAZIO: FormComposicao = {
  codigo: '', nome: '', disciplina_id: '', descricao_tecnica: '',
  unidade_id: '', produtividade: '', markup_sugerido: '1', observacoes: '', tags: '',
}

interface Props {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  composicaoId: string | null
  disciplinas: { id: string; nome: string }[]
  unidades: { id: string; sigla: string }[]
  onSalvo: () => void
}

export default function ComposicaoModal({ aberto, onOpenChange, composicaoId, disciplinas, unidades, onSalvo }: Props) {
  const [form, setForm] = useState<FormComposicao>(FORM_VAZIO)
  const [materiais, setMateriais] = useState<MaterialForm[]>([])
  const [maoDeObra, setMaoDeObra] = useState<MaoObraForm[]>([])
  const [versoes, setVersoes] = useState<ComposicaoVersao[]>([])
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    if (!composicaoId) {
      setForm(FORM_VAZIO)
      setMateriais([])
      setMaoDeObra([])
      setVersoes([])
      return
    }
    setCarregando(true)
    const [resComposicao, resVersoes] = await Promise.all([
      fetch(`/api/composicoes/${composicaoId}`),
      fetch(`/api/composicoes/${composicaoId}/versoes`),
    ])
    const composicao: ComposicaoCompleta = await resComposicao.json()
    const listaVersoes: ComposicaoVersao[] = await resVersoes.json()
    setForm({
      codigo: composicao.codigo,
      nome: composicao.nome,
      disciplina_id: composicao.disciplina_id ?? '',
      descricao_tecnica: composicao.descricao_tecnica,
      unidade_id: composicao.unidade_id ?? '',
      produtividade: composicao.produtividade ?? '',
      markup_sugerido: String(composicao.markup_sugerido),
      observacoes: composicao.observacoes ?? '',
      tags: (composicao.tags ?? []).join(', '),
    })
    setMateriais(
      composicao.composicao_materiais.map(m => ({
        descricao: m.descricao,
        quantidade: String(m.quantidade),
        unidade_id: m.unidade_id ?? '',
        fornecedor: m.fornecedor ?? '',
        preco_unitario: String(m.preco_unitario),
      }))
    )
    setMaoDeObra(
      composicao.composicao_mao_obra.map(m => ({
        cargo: m.cargo, horas: String(m.horas), custo_hora: String(m.custo_hora),
      }))
    )
    setVersoes(Array.isArray(listaVersoes) ? listaVersoes : [])
    setCarregando(false)
  }, [composicaoId])

  useEffect(() => {
    if (aberto) {
      setErro('')
      carregar()
    }
  }, [aberto, carregar])

  const custoDiretoPreview = calcularCustoDireto(
    materiais.map(m => ({ quantidade: Number(m.quantidade) || 0, preco_unitario: Number(m.preco_unitario) || 0 })),
    maoDeObra.map(m => ({ horas: Number(m.horas) || 0, custo_hora: Number(m.custo_hora) || 0 }))
  )

  function adicionarMaterial() {
    setMateriais(prev => [...prev, { descricao: '', quantidade: '', unidade_id: '', fornecedor: '', preco_unitario: '' }])
  }
  function removerMaterial(index: number) {
    setMateriais(prev => prev.filter((_, i) => i !== index))
  }
  function atualizarMaterial(index: number, campo: keyof MaterialForm, valor: string) {
    setMateriais(prev => prev.map((m, i) => (i === index ? { ...m, [campo]: valor } : m)))
  }

  function adicionarMaoDeObra() {
    setMaoDeObra(prev => [...prev, { cargo: '', horas: '', custo_hora: '' }])
  }
  function removerMaoDeObra(index: number) {
    setMaoDeObra(prev => prev.filter((_, i) => i !== index))
  }
  function atualizarMaoDeObra(index: number, campo: keyof MaoObraForm, valor: string) {
    setMaoDeObra(prev => prev.map((m, i) => (i === index ? { ...m, [campo]: valor } : m)))
  }

  async function salvar() {
    if (!form.codigo.trim() || !form.nome.trim() || !form.descricao_tecnica.trim()) {
      setErro('Código, nome e descrição técnica são obrigatórios')
      return
    }
    if (materiais.length === 0 && maoDeObra.length === 0) {
      setErro('Adicione ao menos um material ou item de mão de obra')
      return
    }

    setSalvando(true)
    setErro('')
    const payload = {
      codigo: form.codigo.trim(),
      nome: form.nome.trim(),
      disciplina_id: form.disciplina_id || null,
      descricao_tecnica: form.descricao_tecnica.trim(),
      unidade_id: form.unidade_id || null,
      produtividade: form.produtividade.trim() || null,
      markup_sugerido: Number(form.markup_sugerido) || 1,
      observacoes: form.observacoes.trim() || null,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      materiais: materiais.map(m => ({
        descricao: m.descricao.trim(),
        quantidade: Number(m.quantidade) || 0,
        unidade_id: m.unidade_id || null,
        fornecedor: m.fornecedor.trim() || null,
        preco_unitario: Number(m.preco_unitario) || 0,
      })),
      mao_obra: maoDeObra.map(m => ({
        cargo: m.cargo.trim(),
        horas: Number(m.horas) || 0,
        custo_hora: Number(m.custo_hora) || 0,
      })),
    }

    const url = composicaoId ? `/api/composicoes/${composicaoId}` : '/api/composicoes'
    const metodo = composicaoId ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSalvando(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setErro(data.error ?? 'Erro ao salvar composição')
      return
    }
    onOpenChange(false)
    onSalvo()
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-full max-w-2xl overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{composicaoId ? 'Editar composição' : 'Nova composição'}</DialogTitle>
        </DialogHeader>

        {carregando ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <div className="space-y-6 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="codigo">Código *</Label>
                <Input id="codigo" value={form.codigo} onChange={e => setForm(p => ({ ...p, codigo: e.target.value }))} placeholder="Ex: 1024" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="nome">Nome *</Label>
                <Input id="nome" value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Instalação de câmera IP" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="disciplina">Disciplina</Label>
                <NativeSelect id="disciplina" value={form.disciplina_id} onChange={e => setForm(p => ({ ...p, disciplina_id: e.target.value }))}>
                  <option value="">—</option>
                  {disciplinas.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label htmlFor="unidade">Unidade</Label>
                <NativeSelect id="unidade" value={form.unidade_id} onChange={e => setForm(p => ({ ...p, unidade_id: e.target.value }))}>
                  <option value="">—</option>
                  {unidades.map(u => <option key={u.id} value={u.id}>{u.sigla}</option>)}
                </NativeSelect>
              </div>
            </div>

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

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label htmlFor="produtividade">Produtividade</Label>
                <Input id="produtividade" value={form.produtividade} onChange={e => setForm(p => ({ ...p, produtividade: e.target.value }))} placeholder="Ex: 0,5 m²/h" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="markup">Markup sugerido</Label>
                <Input id="markup" type="number" step="0.01" value={form.markup_sugerido} onChange={e => setForm(p => ({ ...p, markup_sugerido: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tags">Tags (separadas por vírgula)</Label>
                <Input id="tags" value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))} placeholder="Ex: cftv, infra" />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea id="observacoes" value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} rows={2} />
            </div>

            {/* Materiais */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Materiais</h3>
                <Button type="button" variant="ghost" size="sm" onClick={adicionarMaterial}>
                  <Plus className="size-4" /> Adicionar material
                </Button>
              </div>
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
            </div>

            {/* Mão de obra */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Mão de obra</h3>
                <Button type="button" variant="ghost" size="sm" onClick={adicionarMaoDeObra}>
                  <Plus className="size-4" /> Adicionar cargo
                </Button>
              </div>
              {maoDeObra.map((m, i) => (
                <div key={i} className="grid grid-cols-12 items-end gap-2 rounded-lg border border-border p-2">
                  <div className="col-span-6 space-y-1">
                    <Label className="text-xs">Cargo</Label>
                    <Input value={m.cargo} onChange={e => atualizarMaoDeObra(i, 'cargo', e.target.value)} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Horas (por unid.)</Label>
                    <Input type="number" step="0.0001" value={m.horas} onChange={e => atualizarMaoDeObra(i, 'horas', e.target.value)} />
                  </div>
                  <div className="col-span-3 space-y-1">
                    <Label className="text-xs">Custo-hora</Label>
                    <Input type="number" step="0.0001" value={m.custo_hora} onChange={e => atualizarMaoDeObra(i, 'custo_hora', e.target.value)} />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button type="button" aria-label="Remover cargo" onClick={() => removerMaoDeObra(i)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-sm font-medium">
              Custo direto (por 1 unidade): {custoDiretoPreview.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>

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

            {erro && <p className="text-sm text-red-600">{erro}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || carregando}>
            {salvando ? 'Salvando...' : composicaoId ? 'Salvar' : 'Criar composição'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verificar que o projeto compila**

Run: `npm run build`
Expected: build sem erros de tipo (o componente ainda não é importado em nenhuma página — isso é esperado até a Task 10).

- [ ] **Step 3: Commit**

```bash
git add components/composicoes/ComposicaoModal.tsx
git commit -m "feat: modal de criar/editar composicao"
```

---

### Task 10: Página `/composicoes` (biblioteca)

**Files:**
- Create: `app/(app)/composicoes/page.tsx`
- Create: `components/composicoes/ComposicoesPageClient.tsx`

**Interfaces:**
- Consumes: `ComposicaoModal` (Task 9), tipo `Composicao` (`@/types/database`), `createClient` (`@/lib/supabase/server`).
- Produces: página navegável em `/composicoes`, link adicionado à sidebar na Task 12.

- [ ] **Step 1: Criar o Server Component que busca disciplinas/unidades**

```typescript
// app/(app)/composicoes/page.tsx
import { createClient } from '@/lib/supabase/server'
import ComposicoesPageClient from '@/components/composicoes/ComposicoesPageClient'

export default async function ComposicoesPage() {
  const supabase = await createClient()
  const [disciplinasResult, unidadesResult] = await Promise.all([
    supabase.from('disciplinas').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('unidades_medida').select('id, sigla').order('sigla'),
  ])

  return (
    <ComposicoesPageClient
      disciplinas={disciplinasResult.data ?? []}
      unidades={unidadesResult.data ?? []}
    />
  )
}
```

- [ ] **Step 2: Criar o Client Component com busca/filtros/favoritos/tabela**

```typescript
// components/composicoes/ComposicoesPageClient.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Pencil, Trash2, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import ComposicaoModal from './ComposicaoModal'
import type { Composicao } from '@/types/database'

interface Props {
  disciplinas: { id: string; nome: string }[]
  unidades: { id: string; sigla: string }[]
}

export default function ComposicoesPageClient({ disciplinas, unidades }: Props) {
  const [composicoes, setComposicoes] = useState<Composicao[]>([])
  const [busca, setBusca] = useState('')
  const [disciplinaId, setDisciplinaId] = useState('')
  const [somenteFavoritos, setSomenteFavoritos] = useState(false)
  const [carregando, setCarregando] = useState(true)

  const [modalAberto, setModalAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState<Composicao | null>(null)
  const [removendo, setRemovendo] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const params = new URLSearchParams()
    if (busca.trim()) params.set('busca', busca.trim())
    if (disciplinaId) params.set('disciplina_id', disciplinaId)
    if (somenteFavoritos) params.set('favoritos', 'true')
    const res = await fetch(`/api/composicoes?${params.toString()}`)
    const data = await res.json()
    setComposicoes(Array.isArray(data) ? data : [])
    setCarregando(false)
  }, [busca, disciplinaId, somenteFavoritos])

  useEffect(() => {
    const timeout = setTimeout(carregar, 300)
    return () => clearTimeout(timeout)
  }, [carregar])

  function abrirNovo() {
    setEditandoId(null)
    setModalAberto(true)
  }
  function abrirEdicao(c: Composicao) {
    setEditandoId(c.id)
    setModalAberto(true)
  }

  async function alternarFavorito(c: Composicao) {
    setComposicoes(prev => prev.map(x => (x.id === c.id ? { ...x, favorito: !x.favorito } : x)))
    await fetch(`/api/composicoes/${c.id}/favorito`, { method: c.favorito ? 'DELETE' : 'POST' })
  }

  async function confirmarExclusao() {
    if (!excluindo) return
    setRemovendo(true)
    const res = await fetch(`/api/composicoes/${excluindo.id}`, { method: 'DELETE' })
    setRemovendo(false)
    if (!res.ok) {
      alert('Não foi possível excluir a composição.')
      return
    }
    setComposicoes(prev => prev.filter(c => c.id !== excluindo.id))
    setExcluindo(null)
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Composições</h1>
        <Button onClick={abrirNovo}>+ Nova composição</Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar por nome, código ou descrição..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="max-w-sm"
        />
        <NativeSelect value={disciplinaId} onChange={e => setDisciplinaId(e.target.value)} className="max-w-[200px]">
          <option value="">Todas as disciplinas</option>
          {disciplinas.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
        </NativeSelect>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={somenteFavoritos} onChange={e => setSomenteFavoritos(e.target.checked)} />
          Só favoritos
        </label>
      </div>

      {carregando ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : composicoes.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma composição encontrada.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="w-10 px-4 py-3"></th>
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Disciplina</th>
                <th className="px-4 py-3 font-medium">Unidade</th>
                <th className="px-4 py-3 font-medium text-right">Custo direto</th>
                <th className="px-4 py-3 font-medium text-right">Markup</th>
                <th className="px-4 py-3 font-medium text-center">Versão</th>
                <th className="w-24 px-4 py-3 font-medium text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {composicoes.map(c => (
                <tr key={c.id} className="border-t border-border/50 hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <button type="button" aria-label="Favoritar" onClick={() => alternarFavorito(c)}>
                      <Star className={`size-4 ${c.favorito ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{c.codigo}</td>
                  <td className="px-4 py-3 font-medium">{c.nome}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.disciplinas?.nome ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.unidades_medida?.sigla ?? '—'}</td>
                  <td className="px-4 py-3 text-right">{c.custo_direto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  <td className="px-4 py-3 text-right">{c.markup_sugerido}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">v{c.versao}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-1">
                      <button type="button" aria-label={`Editar ${c.nome}`} onClick={() => abrirEdicao(c)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                        <Pencil className="size-4" />
                      </button>
                      <button type="button" aria-label={`Excluir ${c.nome}`} onClick={() => setExcluindo(c)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ComposicaoModal
        aberto={modalAberto}
        onOpenChange={setModalAberto}
        composicaoId={editandoId}
        disciplinas={disciplinas}
        unidades={unidades}
        onSalvo={carregar}
      />

      <Dialog open={excluindo !== null} onOpenChange={aberto => !aberto && setExcluindo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir composição</DialogTitle>
          </DialogHeader>
          <p className="py-2 text-sm text-muted-foreground">
            Excluir a composição <strong className="text-foreground">{excluindo?.nome}</strong>?
            Itens já inseridos em orçamentos não são afetados.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExcluindo(null)}>Cancelar</Button>
            <Button onClick={confirmarExclusao} disabled={removendo} className="bg-red-600 text-white hover:bg-red-700">
              {removendo ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 3: Verificar que o projeto compila**

Run: `npm run build`
Expected: build sem erros de tipo.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/composicoes/page.tsx" components/composicoes/ComposicoesPageClient.tsx
git commit -m "feat: pagina /composicoes (biblioteca com busca, filtros e favoritos)"
```

---

### Task 11: Componente `InserirComposicaoModal`

**Files:**
- Create: `components/composicoes/InserirComposicaoModal.tsx`

**Interfaces:**
- Consumes: `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter`, `Button`, `Input`, `NativeSelect`; tipo `Composicao`, `ItemOrcamento`, `UnidadeMedida` (`@/types/database`).
- Produces: componente `InserirComposicaoModal` com props `{ aberto, onOpenChange, obraId, grupos, onInserido }` — usado pela Task 12.

- [ ] **Step 1: Implementar**

```typescript
// components/composicoes/InserirComposicaoModal.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type { Composicao, ItemOrcamento, UnidadeMedida } from '@/types/database'

interface Props {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  obraId: string
  grupos: { id: string; letra: string; disciplinas?: { nome: string } | null }[]
  onInserido: (grupoId: string, item: ItemOrcamento & { unidades_medida?: UnidadeMedida | null }) => void
}

export default function InserirComposicaoModal({ aberto, onOpenChange, obraId, grupos, onInserido }: Props) {
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<Composicao[]>([])
  const [buscando, setBuscando] = useState(false)
  const [selecionada, setSelecionada] = useState<Composicao | null>(null)
  const [grupoDestinoId, setGrupoDestinoId] = useState(grupos[0]?.id ?? '')
  const [quantidade, setQuantidade] = useState('1')
  const [inserindo, setInserindo] = useState(false)
  const [erro, setErro] = useState('')

  const buscar = useCallback(async () => {
    setBuscando(true)
    const params = new URLSearchParams()
    if (busca.trim()) params.set('busca', busca.trim())
    const res = await fetch(`/api/composicoes?${params.toString()}`)
    const data = await res.json()
    setResultados(Array.isArray(data) ? data : [])
    setBuscando(false)
  }, [busca])

  useEffect(() => {
    if (!aberto) return
    setErro('')
    setSelecionada(null)
    setGrupoDestinoId(grupos[0]?.id ?? '')
    const timeout = setTimeout(buscar, 300)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, busca])

  async function inserir() {
    if (!selecionada) {
      setErro('Selecione uma composição')
      return
    }
    if (!grupoDestinoId) {
      setErro('Selecione o grupo de destino')
      return
    }
    const quantidadeNumero = Number(quantidade)
    if (!quantidadeNumero || quantidadeNumero <= 0) {
      setErro('Informe uma quantidade maior que zero')
      return
    }

    setInserindo(true)
    setErro('')
    const res = await fetch(`/api/obras/${obraId}/grupos/${grupoDestinoId}/itens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ composicao_id: selecionada.id, quantidade: quantidadeNumero }),
    })
    setInserindo(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setErro(data.error ?? 'Erro ao inserir composição')
      return
    }
    const novoItem = await res.json()
    onInserido(grupoDestinoId, novoItem)
    onOpenChange(false)
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-full max-w-xl overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Inserir composição no orçamento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="busca-composicao">Buscar composição</Label>
            <Input
              id="busca-composicao"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Nome, código ou descrição..."
            />
          </div>

          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border">
            {buscando ? (
              <p className="p-3 text-sm text-muted-foreground">Buscando...</p>
            ) : resultados.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Nenhuma composição encontrada.</p>
            ) : (
              resultados.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelecionada(c)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                    selecionada?.id === c.id ? 'bg-blue-600/10' : 'hover:bg-muted/50'
                  }`}
                >
                  <span>
                    <span className="font-mono text-xs text-muted-foreground">{c.codigo}</span> — {c.nome}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {c.custo_direto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </button>
              ))
            )}
          </div>

          {selecionada && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="grupo-destino">Grupo de destino</Label>
                <NativeSelect id="grupo-destino" value={grupoDestinoId} onChange={e => setGrupoDestinoId(e.target.value)}>
                  {grupos.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.letra} — {g.disciplinas?.nome ?? 'Sem disciplina'}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label htmlFor="quantidade">Quantidade</Label>
                <Input id="quantidade" type="number" step="0.0001" value={quantidade} onChange={e => setQuantidade(e.target.value)} />
              </div>
            </div>
          )}

          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={inserir} disabled={inserindo || !selecionada}>
            {inserindo ? 'Inserindo...' : 'Inserir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verificar que o projeto compila**

Run: `npm run build`
Expected: build sem erros de tipo.

- [ ] **Step 3: Commit**

```bash
git add components/composicoes/InserirComposicaoModal.tsx
git commit -m "feat: modal de inserir composicao no orcamento"
```

---

### Task 12: Ligar tudo — botão no editor de orçamento e link na sidebar

**Files:**
- Modify: `components/orcamento/EditorOrcamento.tsx`
- Modify: `components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `InserirComposicaoModal` (Task 11).
- Produces: fluxo completo ponta-a-ponta (o usuário consegue navegar para `/composicoes`, cadastrar, e inserir no orçamento).

- [ ] **Step 1: Adicionar o botão e o modal em `EditorOrcamento.tsx`**

Adicionar o import no topo do arquivo (junto aos demais imports):

```typescript
import InserirComposicaoModal from '@/components/composicoes/InserirComposicaoModal'
```

Adicionar o estado, logo após a linha `const [importando, setImportando] = useState(false)`:

```typescript
  const [modalComposicaoAberto, setModalComposicaoAberto] = useState(false)
```

Adicionar a função de callback, logo após a função `adicionarItem`:

```typescript
  function itemInseridoPorComposicao(grupoId: string, novoItem: ItemOrcamento & { unidades_medida?: UnidadeMedida | null }) {
    setGrupos(prev => prev.map(g =>
      g.id !== grupoId ? g : {
        ...g,
        itens_orcamento: [...g.itens_orcamento, novoItem],
      }
    ))
  }
```

No JSX, adicionar o botão dentro da `div` de botões (antes do botão "Importar Planilha"):

```typescript
          <button
            onClick={() => setModalComposicaoAberto(true)}
            disabled={grupos.length === 0}
            className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 transition-colors"
            title={grupos.length === 0 ? 'Adicione uma disciplina primeiro' : undefined}
          >
            + Inserir Composição
          </button>
```

E, ao final do JSX (logo antes do fechamento da `div` raiz, depois de `<TabelaOrcamento .../>`):

```typescript
      <InserirComposicaoModal
        aberto={modalComposicaoAberto}
        onOpenChange={setModalComposicaoAberto}
        obraId={obra.id}
        grupos={grupos.map(g => ({ id: g.id, letra: g.letra, disciplinas: g.disciplinas }))}
        onInserido={itemInseridoPorComposicao}
      />
```

- [ ] **Step 2: Adicionar o link na sidebar**

Em `components/layout/Sidebar.tsx`, adicionar `Boxes` ao import de ícones:

```typescript
import {
  Boxes, Building2, LayoutDashboard, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun, Users, X,
} from 'lucide-react'
```

E adicionar a entrada no array `ITENS` (após "Obras"):

```typescript
const ITENS = [
  { href: '/dashboard', label: 'Dashboard', Icone: LayoutDashboard },
  { href: '/obras', label: 'Obras', Icone: Building2 },
  { href: '/composicoes', label: 'Composições', Icone: Boxes },
  { href: '/clientes', label: 'Clientes', Icone: Users },
]
```

- [ ] **Step 3: Verificar que o projeto compila**

Run: `npm run build`
Expected: build sem erros de tipo.

- [ ] **Step 4: Rodar toda a suíte de testes**

Run: `npm run test:run`
Expected: todos os testes passam, incluindo os novos de `lib/composicoes/calculos.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add components/orcamento/EditorOrcamento.tsx components/layout/Sidebar.tsx
git commit -m "feat: liga banco de composicoes ao editor de orcamento e a navegacao"
```

---

## Verificação manual final (fluxo ponta-a-ponta)

Depois de rodar a migration (Task 1) e concluir todas as tasks:

1. Rodar `npm run dev`, logar como usuário com papel `admin` ou `engenheiro`.
2. Ir em **Composições** → **Nova composição**: preencher código, nome, disciplina, descrição técnica, unidade, adicionar 1 material e 1 cargo de mão de obra, salvar. Conferir que a linha aparece na tabela com `custo_direto` correto e `v1`.
3. Editar a composição criada (mudar o preço de um material), salvar. Conferir que a versão virou `v2` e que o histórico de versões no modal lista as duas.
4. Salvar de novo sem mudar nada — conferir que a versão **não** incrementa (continua `v2`).
5. Marcar como favorita (estrela) e filtrar por "Só favoritos" — deve aparecer.
6. Abrir uma obra em `/obras/[id]`, clicar **+ Inserir Composição**, buscar a composição criada, escolher grupo e quantidade, inserir. Conferir que o item aparece na tabela do orçamento com custo/markup corretos e escala ao mudar a quantidade.
7. Excluir a composição em `/composicoes` — conferir que o item já inserido no orçamento continua existindo e com os mesmos valores.
8. Logar como usuário `visualizador` e confirmar que os botões de criar/editar/excluir composição e "+ Inserir Composição" não têm efeito (RLS bloqueia a escrita — a UI ainda não esconde os botões nesta fase, mas a operação deve falhar com erro 500/403 do Supabase em vez de gravar).
