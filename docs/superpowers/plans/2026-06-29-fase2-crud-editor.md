# Sistema de Orçamento — Fase 2: CRUD + Editor de Orçamentos

> **Para execução:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar task por task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lista e editor de orçamentos funcionais com CRUD completo de obras/grupos/itens, toggle visão técnica/comercial e totais em tempo real.

**Architecture:** API routes Next.js 15 para todas as operações CRUD usando `createClient()` com JWT do usuário (RLS enforça permissões no Supabase). Estado do editor gerenciado localmente em React; cálculos derivados em tempo real via `lib/calculos.ts`; persistência via fetch para as API routes a cada edição. Lista de obras como Client Component com busca e filtro no cliente.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Tailwind CSS, shadcn/ui, Supabase PostgreSQL + RLS, Vitest

## Global Constraints

- Node.js ≥ 20
- Next.js 15 App Router only (nunca Pages Router)
- TypeScript strict mode — zero `any` implícito
- Todo texto de UI em **português brasileiro**
- `params` em Route Handlers e Pages é `Promise<{...}>` — sempre `await params`
- `searchParams` em Server Pages é `Promise<{...}>` — sempre `await searchParams`
- Preço de venda **nunca gravado** — sempre calculado de custo + margem em `lib/calculos.ts`
- API routes retornam `{ error: string }` com status HTTP correto em erros
- `SUPABASE_SERVICE_ROLE_KEY` server-only; Route Handlers usam `createClient()` (RLS ativo)
- `atualizado_em` de obras deve ser atualizado manualmente no PUT (sem trigger no banco)

---

## Mapa de arquivos

```
lib/
  calculos.ts               NOVO — todas as fórmulas de custo/venda/margem
  calculos.test.ts          NOVO — testes Vitest (unit)
  format.ts                 NOVO — helpers fmt() e fmtPct()
types/
  database.ts               MODIFICA — criado_por: string | null
app/
  api/
    clientes/
      route.ts              NOVO — GET, POST
    obras/
      route.ts              NOVO — GET (list+filter+totais), POST
      [id]/
        route.ts            NOVO — GET (full), PUT (header), DELETE
        grupos/
          route.ts          NOVO — POST (add grupo)
          [grupoId]/
            route.ts        NOVO — PUT (update disciplina), DELETE
            itens/
              route.ts      NOVO — POST (add item)
              [itemId]/
                route.ts    NOVO — PUT (update campos), DELETE
  (app)/
    obras/
      page.tsx              MODIFICA — lista real c/ busca/filtro/modal nova obra
      [id]/
        page.tsx            NOVO — server shell que busca obra e renderiza EditorOrcamento
components/
  orcamento/
    EditorOrcamento.tsx     NOVO — root client component: estado, calculos, handlers
    CabecalhoObra.tsx       NOVO — header editável (codigo, nome, cliente, data, status)
    ToggleVisao.tsx         NOVO — botão técnica | comercial
    TabelaOrcamento.tsx     NOVO — tabela editável com grupos, itens, totais
```

---

## Task 1: lib/calculos.ts + lib/format.ts + testes

**Files:**
- Create: `lib/calculos.ts`
- Create: `lib/format.ts`
- Create: `lib/calculos.test.ts`
- Modify: `types/database.ts` (linha 41: `criado_por: string | null`)

**Interfaces:**
- Produz:
  - `calcularItem(item: ItemOrcamento): ItemCalculado`
  - `calcularTotaisGrupo(itens: ItemCalculado[]): TotaisGrupo`
  - `calcularTotaisGerais(grupos: GrupoCalculado[]): TotaisGerais`
  - `calcularGrupo(grupo: GrupoOrcamento & { itens_orcamento: ItemOrcamento[] }): GrupoCalculado`
  - `fmt(n: number): string` — formata moeda pt-BR ("1.234,56")
  - `fmtPct(n: number): string` — formata porcentagem ("18,92%")

- [ ] **Step 1: Corrigir `types/database.ts`**

Abra `types/database.ts`. Na interface `Obra`, linha 41, mude:
```typescript
criado_por: string
```
para:
```typescript
criado_por: string | null
```

- [ ] **Step 2: Criar `lib/format.ts`**

```typescript
export function fmt(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtPct(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
}
```

- [ ] **Step 3: Criar `lib/calculos.ts`**

```typescript
import type { ItemOrcamento, GrupoOrcamento } from '@/types/database'
import type { ItemCalculado, TotaisGrupo, TotaisGerais, GrupoCalculado } from '@/types/orcamento'

export function calcularItem(item: ItemOrcamento): ItemCalculado {
  const subtotal_mao_obra_custo = item.custo_unit_mao_obra * item.quantidade
  const subtotal_material_custo = item.custo_unit_material * item.quantidade
  const total_custo = subtotal_mao_obra_custo + subtotal_material_custo

  const preco_unit_mao_obra_venda = item.custo_unit_mao_obra * (1 + item.margem_mao_obra_pct / 100)
  const preco_unit_material_venda = item.custo_unit_material * (1 + item.margem_material_pct / 100)
  const subtotal_mao_obra_venda = preco_unit_mao_obra_venda * item.quantidade
  const subtotal_material_venda = preco_unit_material_venda * item.quantidade
  const total_venda = subtotal_mao_obra_venda + subtotal_material_venda

  const lucro = total_venda - total_custo
  const margem_efetiva_pct = total_venda > 0 ? (lucro / total_venda) * 100 : 0

  return {
    ...item,
    subtotal_mao_obra_custo,
    subtotal_material_custo,
    total_custo,
    preco_unit_mao_obra_venda,
    preco_unit_material_venda,
    subtotal_mao_obra_venda,
    subtotal_material_venda,
    total_venda,
    lucro,
    margem_efetiva_pct,
  }
}

export function calcularTotaisGrupo(itens: ItemCalculado[]): TotaisGrupo {
  return itens.reduce(
    (acc, item) => ({
      subtotal_mao_obra_custo: acc.subtotal_mao_obra_custo + item.subtotal_mao_obra_custo,
      subtotal_material_custo: acc.subtotal_material_custo + item.subtotal_material_custo,
      total_custo: acc.total_custo + item.total_custo,
      subtotal_mao_obra_venda: acc.subtotal_mao_obra_venda + item.subtotal_mao_obra_venda,
      subtotal_material_venda: acc.subtotal_material_venda + item.subtotal_material_venda,
      total_venda: acc.total_venda + item.total_venda,
      lucro: acc.lucro + item.lucro,
    }),
    {
      subtotal_mao_obra_custo: 0,
      subtotal_material_custo: 0,
      total_custo: 0,
      subtotal_mao_obra_venda: 0,
      subtotal_material_venda: 0,
      total_venda: 0,
      lucro: 0,
    }
  )
}

export function calcularTotaisGerais(grupos: GrupoCalculado[]): TotaisGerais {
  const acc = grupos.reduce(
    (a, g) => ({
      total_mao_obra_custo: a.total_mao_obra_custo + g.totais.subtotal_mao_obra_custo,
      total_material_custo: a.total_material_custo + g.totais.subtotal_material_custo,
      total_custo: a.total_custo + g.totais.total_custo,
      total_mao_obra_venda: a.total_mao_obra_venda + g.totais.subtotal_mao_obra_venda,
      total_material_venda: a.total_material_venda + g.totais.subtotal_material_venda,
      total_venda: a.total_venda + g.totais.total_venda,
      lucro: a.lucro + g.totais.lucro,
    }),
    {
      total_mao_obra_custo: 0,
      total_material_custo: 0,
      total_custo: 0,
      total_mao_obra_venda: 0,
      total_material_venda: 0,
      total_venda: 0,
      lucro: 0,
    }
  )
  const margem_efetiva_pct = acc.total_venda > 0 ? (acc.lucro / acc.total_venda) * 100 : 0
  return { ...acc, margem_efetiva_pct }
}

export function calcularGrupo(
  grupo: GrupoOrcamento & { itens_orcamento: ItemOrcamento[] }
): GrupoCalculado {
  const itens_calculados = grupo.itens_orcamento.map(calcularItem)
  const totais = calcularTotaisGrupo(itens_calculados)
  return { ...grupo, itens_calculados, totais }
}
```

- [ ] **Step 4: Criar `lib/calculos.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { calcularItem, calcularTotaisGrupo, calcularTotaisGerais, calcularGrupo } from './calculos'
import type { ItemOrcamento, GrupoOrcamento } from '@/types/database'

const item: ItemOrcamento = {
  id: '1',
  grupo_id: 'g1',
  numero: 1,
  descricao: 'Limpeza',
  local: null,
  unidade_id: null,
  quantidade: 10,
  custo_unit_mao_obra: 100,
  custo_unit_material: 50,
  margem_mao_obra_pct: 20,
  margem_material_pct: 30,
  observacao: null,
  observacao_2: null,
  ordem: 1,
}

describe('calcularItem', () => {
  it('calcula subtotais de custo', () => {
    const r = calcularItem(item)
    expect(r.subtotal_mao_obra_custo).toBe(1000)
    expect(r.subtotal_material_custo).toBe(500)
    expect(r.total_custo).toBe(1500)
  })

  it('calcula preços e subtotais de venda com margem', () => {
    const r = calcularItem(item)
    expect(r.preco_unit_mao_obra_venda).toBe(120)   // 100 * 1.20
    expect(r.preco_unit_material_venda).toBe(65)    // 50 * 1.30
    expect(r.subtotal_mao_obra_venda).toBe(1200)    // 120 * 10
    expect(r.subtotal_material_venda).toBe(650)     // 65 * 10
    expect(r.total_venda).toBe(1850)
  })

  it('calcula lucro e margem efetiva', () => {
    const r = calcularItem(item)
    expect(r.lucro).toBe(350)
    expect(r.margem_efetiva_pct).toBeCloseTo(18.92, 1)  // 350/1850*100
  })

  it('margem_efetiva_pct é 0 quando total_venda é 0', () => {
    const r = calcularItem({ ...item, custo_unit_mao_obra: 0, custo_unit_material: 0 })
    expect(r.margem_efetiva_pct).toBe(0)
  })

  it('funciona com quantidade zero', () => {
    const r = calcularItem({ ...item, quantidade: 0 })
    expect(r.total_custo).toBe(0)
    expect(r.total_venda).toBe(0)
    expect(r.lucro).toBe(0)
  })
})

describe('calcularTotaisGrupo', () => {
  it('soma corretamente dois itens', () => {
    const item2: ItemOrcamento = { ...item, id: '2', custo_unit_mao_obra: 200, custo_unit_material: 100 }
    const itens = [calcularItem(item), calcularItem(item2)]
    const t = calcularTotaisGrupo(itens)
    expect(t.total_custo).toBe(1500 + 3000)
    expect(t.total_venda).toBe(1850 + 3750)  // item2: 240*10+130*10=3700... wait
    // item2: preco_mao=240, preco_mat=130, sub_mao=2400, sub_mat=1300, total=3700
    expect(t.total_venda).toBe(1850 + 3700)
    expect(t.lucro).toBe((1850 - 1500) + (3700 - 3000))
  })

  it('retorna zeros para lista vazia', () => {
    const t = calcularTotaisGrupo([])
    expect(t.total_custo).toBe(0)
    expect(t.total_venda).toBe(0)
  })
})

describe('calcularTotaisGerais', () => {
  it('agrega totais de múltiplos grupos', () => {
    const grupo: GrupoOrcamento & { itens_orcamento: ItemOrcamento[] } = {
      id: 'g1', obra_id: 'o1', disciplina_id: 'd1', letra: 'A', ordem: 1,
      itens_orcamento: [item],
    }
    const gc = calcularGrupo(grupo)
    const t = calcularTotaisGerais([gc])
    expect(t.total_custo).toBe(1500)
    expect(t.total_venda).toBe(1850)
    expect(t.margem_efetiva_pct).toBeCloseTo(18.92, 1)
  })
})
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

```bash
npx vitest run lib/calculos.test.ts
```

Esperado: todos os testes passando. Se `calcularTotaisGrupo` com dois itens falhar, ajuste os valores esperados conforme o cálculo real do item2 (200×10=2000 custo_mao, 100×10=1000 custo_mat → 240×10=2400 venda_mao, 130×10=1300 venda_mat → total_venda=3700).

- [ ] **Step 6: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: nenhum erro.

- [ ] **Step 7: Commit**

```bash
git add lib/calculos.ts lib/calculos.test.ts lib/format.ts types/database.ts
git commit -m "feat: lib/calculos.ts com fórmulas de custo/venda + testes"
```

---

## Task 2: API routes — CRUD completo

**Files:**
- Create: `app/api/clientes/route.ts`
- Create: `app/api/obras/route.ts`
- Create: `app/api/obras/[id]/route.ts`
- Create: `app/api/obras/[id]/grupos/route.ts`
- Create: `app/api/obras/[id]/grupos/[grupoId]/route.ts`
- Create: `app/api/obras/[id]/grupos/[grupoId]/itens/route.ts`
- Create: `app/api/obras/[id]/grupos/[grupoId]/itens/[itemId]/route.ts`

**Interfaces:**
- Consome: `lib/supabase/server.ts` → `createClient()`
- Produz todos os endpoints REST que as telas usarão:
  - `GET /api/clientes` → `Cliente[]`
  - `POST /api/clientes` → `Cliente` (201)
  - `GET /api/obras?busca=&status=` → `ObraListItem[]` (com total_venda calculado no cliente)
  - `POST /api/obras` → `Obra` (201)
  - `GET /api/obras/[id]` → `ObraCompleta` (obra + grupos + itens com relações)
  - `PUT /api/obras/[id]` → `Obra`
  - `DELETE /api/obras/[id]` → 204
  - `POST /api/obras/[id]/grupos` → `GrupoOrcamento` (201)
  - `PUT /api/obras/[id]/grupos/[grupoId]` → `GrupoOrcamento`
  - `DELETE /api/obras/[id]/grupos/[grupoId]` → 204
  - `POST /api/obras/[id]/grupos/[grupoId]/itens` → `ItemOrcamento` (201)
  - `PUT /api/obras/[id]/grupos/[grupoId]/itens/[itemId]` → `ItemOrcamento`
  - `DELETE /api/obras/[id]/grupos/[grupoId]/itens/[itemId]` → 204

- [ ] **Step 1: Criar `app/api/clientes/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .order('razao_social')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await request.json()
  const { razao_social, cnpj, endereco } = body

  if (!razao_social?.trim()) {
    return NextResponse.json({ error: 'Razão social é obrigatória' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('clientes')
    .insert({ razao_social: razao_social.trim(), cnpj: cnpj ?? null, endereco: endereco ?? null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Criar `app/api/obras/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const busca = searchParams.get('busca') ?? ''
  const status = searchParams.get('status') ?? ''

  let query = supabase
    .from('obras')
    .select(`
      id, codigo, nome, status, data_orcamento, criado_em, atualizado_em,
      clientes (id, razao_social),
      grupos_orcamento (
        itens_orcamento (
          quantidade, custo_unit_mao_obra, custo_unit_material,
          margem_mao_obra_pct, margem_material_pct
        )
      )
    `)
    .order('atualizado_em', { ascending: false })
    .limit(100)

  if (status) query = query.eq('status', status)
  if (busca) {
    query = query.or(`codigo.ilike.%${busca}%,nome.ilike.%${busca}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await request.json()
  const { codigo, nome, cliente_id, data_orcamento } = body

  if (!codigo?.trim() || !nome?.trim()) {
    return NextResponse.json({ error: 'Código e nome são obrigatórios' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('obras')
    .insert({
      codigo: codigo.trim(),
      nome: nome.trim(),
      cliente_id: cliente_id ?? null,
      data_orcamento: data_orcamento ?? null,
      criado_por: user.id,
    })
    .select('*, clientes(id, razao_social)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 3: Criar `app/api/obras/[id]/route.ts`**

```typescript
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
    .from('obras')
    .select(`
      *,
      clientes (*),
      usuarios (id, nome),
      grupos_orcamento (
        *,
        disciplinas (*),
        itens_orcamento (
          *,
          unidades_medida (*)
        )
      )
    `)
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Obra não encontrada' }, { status: 404 })

  // Ordenar grupos e itens
  if (data.grupos_orcamento) {
    data.grupos_orcamento.sort((a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem)
    data.grupos_orcamento.forEach((g: { itens_orcamento?: { ordem: number }[] }) => {
      g.itens_orcamento?.sort((a, b) => a.ordem - b.ordem)
    })
  }

  return NextResponse.json(data)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json()

  // Campos permitidos para atualização do cabeçalho
  const campos = ['codigo', 'nome', 'cliente_id', 'data_orcamento', 'status'] as const
  const updates: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  for (const campo of campos) {
    if (campo in body) updates[campo] = body[campo]
  }

  const { data, error } = await supabase
    .from('obras')
    .update(updates)
    .eq('id', id)
    .select('*, clientes(id, razao_social)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params

  const { error } = await supabase.from('obras').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 4: Criar `app/api/obras/[id]/grupos/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id: obra_id } = await params
  const body = await request.json()
  const { disciplina_id } = body

  if (!disciplina_id) {
    return NextResponse.json({ error: 'disciplina_id é obrigatório' }, { status: 400 })
  }

  // Próxima letra e ordem
  const { count } = await supabase
    .from('grupos_orcamento')
    .select('*', { count: 'exact', head: true })
    .eq('obra_id', obra_id)

  const ordem = (count ?? 0) + 1
  const letra = String.fromCharCode(64 + ordem)  // 1→A, 2→B, ...

  const { data, error } = await supabase
    .from('grupos_orcamento')
    .insert({ obra_id, disciplina_id, letra, ordem })
    .select('*, disciplinas(*), itens_orcamento(*, unidades_medida(*))')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 5: Criar `app/api/obras/[id]/grupos/[grupoId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; grupoId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { grupoId } = await params
  const body = await request.json()

  const updates: Record<string, unknown> = {}
  if ('disciplina_id' in body) updates.disciplina_id = body.disciplina_id

  const { data, error } = await supabase
    .from('grupos_orcamento')
    .update(updates)
    .eq('id', grupoId)
    .select('*, disciplinas(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; grupoId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { grupoId } = await params

  const { error } = await supabase.from('grupos_orcamento').delete().eq('id', grupoId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 6: Criar `app/api/obras/[id]/grupos/[grupoId]/itens/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; grupoId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { grupoId: grupo_id } = await params
  const body = await request.json()

  // Próximo número e ordem
  const { count } = await supabase
    .from('itens_orcamento')
    .select('*', { count: 'exact', head: true })
    .eq('grupo_id', grupo_id)

  const numero = (count ?? 0) + 1
  const ordem = numero

  const { data, error } = await supabase
    .from('itens_orcamento')
    .insert({
      grupo_id,
      numero,
      ordem,
      descricao: body.descricao ?? 'Novo item',
      local: body.local ?? null,
      unidade_id: body.unidade_id ?? null,
      quantidade: body.quantidade ?? 0,
      custo_unit_mao_obra: body.custo_unit_mao_obra ?? 0,
      custo_unit_material: body.custo_unit_material ?? 0,
      margem_mao_obra_pct: body.margem_mao_obra_pct ?? 0,
      margem_material_pct: body.margem_material_pct ?? 0,
      observacao: body.observacao ?? null,
      observacao_2: body.observacao_2 ?? null,
    })
    .select('*, unidades_medida(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 7: Criar `app/api/obras/[id]/grupos/[grupoId]/itens/[itemId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; grupoId: string; itemId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { itemId } = await params
  const body = await request.json()

  const campos = [
    'descricao', 'local', 'unidade_id', 'quantidade',
    'custo_unit_mao_obra', 'custo_unit_material',
    'margem_mao_obra_pct', 'margem_material_pct',
    'observacao', 'observacao_2',
  ] as const

  const updates: Record<string, unknown> = {}
  for (const campo of campos) {
    if (campo in body) updates[campo] = body[campo]
  }

  const { data, error } = await supabase
    .from('itens_orcamento')
    .update(updates)
    .eq('id', itemId)
    .select('*, unidades_medida(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; grupoId: string; itemId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { itemId } = await params

  const { error } = await supabase.from('itens_orcamento').delete().eq('id', itemId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 8: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: nenhum erro.

- [ ] **Step 9: Commit**

```bash
git add app/api/
git commit -m "feat: API routes CRUD para clientes, obras, grupos e itens"
```

---

## Task 3: Lista de obras (`/obras`)

**Files:**
- Modify: `app/(app)/obras/page.tsx`

**Interfaces:**
- Consome: `GET /api/obras?busca=&status=`, `POST /api/obras`, `GET /api/clientes`
- Produz: lista de obras com busca, filtro de status, badge de status, total venda calculado, modal "Nova obra"

- [ ] **Step 1: Substituir `app/(app)/obras/page.tsx`**

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { calcularItem } from '@/lib/calculos'
import { fmt } from '@/lib/format'
import type { StatusObra } from '@/types/database'

const STATUS_LABELS: Record<StatusObra, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
  em_execucao: 'Em execução',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

const STATUS_COLORS: Record<StatusObra, string> = {
  rascunho: 'bg-gray-100 text-gray-700',
  enviado: 'bg-blue-100 text-blue-700',
  aprovado: 'bg-green-100 text-green-700',
  em_execucao: 'bg-yellow-100 text-yellow-700',
  concluido: 'bg-emerald-100 text-emerald-700',
  cancelado: 'bg-red-100 text-red-700',
}

type ObraItem = {
  id: string
  codigo: string
  nome: string
  status: StatusObra
  data_orcamento: string | null
  clientes: { id: string; razao_social: string } | null
  grupos_orcamento: {
    itens_orcamento: {
      quantidade: number
      custo_unit_mao_obra: number
      custo_unit_material: number
      margem_mao_obra_pct: number
      margem_material_pct: number
    }[]
  }[]
}

type Cliente = { id: string; razao_social: string }

function calcularTotalVendaObra(obra: ObraItem): number {
  return obra.grupos_orcamento.flatMap(g => g.itens_orcamento).reduce((sum, item) => {
    const calc = calcularItem({
      id: '', grupo_id: '', numero: 0, descricao: '', local: null,
      unidade_id: null, observacao: null, observacao_2: null, ordem: 0,
      quantidade: item.quantidade,
      custo_unit_mao_obra: item.custo_unit_mao_obra,
      custo_unit_material: item.custo_unit_material,
      margem_mao_obra_pct: item.margem_mao_obra_pct,
      margem_material_pct: item.margem_material_pct,
    })
    return sum + calc.total_venda
  }, 0)
}

export default function ObrasPage() {
  const router = useRouter()
  const [obras, setObras] = useState<ObraItem[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [novaObra, setNovaObra] = useState({ codigo: '', nome: '', cliente_id: '', data_orcamento: '' })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const carregarObras = useCallback(async () => {
    setCarregando(true)
    const params = new URLSearchParams()
    if (busca) params.set('busca', busca)
    if (filtroStatus) params.set('status', filtroStatus)
    const res = await fetch(`/api/obras?${params}`)
    const data = await res.json()
    setObras(Array.isArray(data) ? data : [])
    setCarregando(false)
  }, [busca, filtroStatus])

  useEffect(() => {
    const t = setTimeout(carregarObras, 300)
    return () => clearTimeout(t)
  }, [carregarObras])

  async function abrirModal() {
    setModalAberto(true)
    setErro('')
    setNovaObra({ codigo: '', nome: '', cliente_id: '', data_orcamento: '' })
    if (clientes.length === 0) {
      const res = await fetch('/api/clientes')
      const data = await res.json()
      setClientes(Array.isArray(data) ? data : [])
    }
  }

  async function criarObra() {
    if (!novaObra.codigo.trim() || !novaObra.nome.trim()) {
      setErro('Código e nome são obrigatórios')
      return
    }
    setSalvando(true)
    setErro('')
    const res = await fetch('/api/obras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo: novaObra.codigo.trim(),
        nome: novaObra.nome.trim(),
        cliente_id: novaObra.cliente_id || null,
        data_orcamento: novaObra.data_orcamento || null,
      }),
    })
    const data = await res.json()
    setSalvando(false)
    if (!res.ok) { setErro(data.error ?? 'Erro ao criar obra'); return }
    setModalAberto(false)
    router.push(`/obras/${data.id}`)
  }

  return (
    <div className="p-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Obras</h1>
        <Button onClick={abrirModal}>+ Nova obra</Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-4">
        <Input
          placeholder="Buscar por código ou nome..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="max-w-sm"
        />
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todos</SelectItem>
            {(Object.keys(STATUS_LABELS) as StatusObra[]).map(s => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      {carregando ? (
        <p className="text-gray-500">Carregando...</p>
      ) : obras.length === 0 ? (
        <p className="text-gray-500">Nenhuma obra encontrada.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium text-right">Total Venda</th>
              </tr>
            </thead>
            <tbody>
              {obras.map(obra => (
                <tr
                  key={obra.id}
                  onClick={() => router.push(`/obras/${obra.id}`)}
                  className="border-t border-gray-100 hover:bg-blue-50 cursor-pointer"
                >
                  <td className="px-4 py-3 font-mono text-xs">{obra.codigo}</td>
                  <td className="px-4 py-3 font-medium">{obra.nome}</td>
                  <td className="px-4 py-3 text-gray-600">{obra.clientes?.razao_social ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[obra.status]}`}>
                      {STATUS_LABELS[obra.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {obra.data_orcamento
                      ? new Date(obra.data_orcamento + 'T00:00:00').toLocaleDateString('pt-BR')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    R$ {fmt(calcularTotalVendaObra(obra))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Nova Obra */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova obra</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="codigo">Código *</Label>
              <Input
                id="codigo"
                value={novaObra.codigo}
                onChange={e => setNovaObra(prev => ({ ...prev, codigo: e.target.value }))}
                placeholder="Ex: 08114"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={novaObra.nome}
                onChange={e => setNovaObra(prev => ({ ...prev, nome: e.target.value }))}
                placeholder="Ex: UNILEVER - WT"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cliente">Cliente</Label>
              <Select
                value={novaObra.cliente_id}
                onValueChange={v => setNovaObra(prev => ({ ...prev, cliente_id: v }))}
              >
                <SelectTrigger id="cliente">
                  <SelectValue placeholder="Selecionar cliente (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nenhum</SelectItem>
                  {clientes.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="data">Data do orçamento</Label>
              <Input
                id="data"
                type="date"
                value={novaObra.data_orcamento}
                onChange={e => setNovaObra(prev => ({ ...prev, data_orcamento: e.target.value }))}
              />
            </div>
            {erro && <p className="text-sm text-red-600">{erro}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button onClick={criarObra} disabled={salvando}>
              {salvando ? 'Criando...' : 'Criar obra'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: nenhum erro.

- [ ] **Step 3: Commit**

```bash
git add app/\(app\)/obras/page.tsx
git commit -m "feat: lista de obras com busca, filtro de status e modal nova obra"
```

---

## Task 4: Editor de orçamento — estrutura e leitura

**Files:**
- Create: `app/(app)/obras/[id]/page.tsx`
- Create: `components/orcamento/EditorOrcamento.tsx`
- Create: `components/orcamento/CabecalhoObra.tsx`
- Create: `components/orcamento/ToggleVisao.tsx`
- Create: `components/orcamento/TabelaOrcamento.tsx` (versão read-only)

**Interfaces:**
- Consome: `GET /api/obras/[id]` (via Supabase direto no server component), `calcularGrupo`, `calcularTotaisGerais`
- Produz: rota `/obras/[id]` com cabeçalho editável, toggle visão técnica/comercial, tabela de grupos/itens (leitura)

- [ ] **Step 1: Criar `components/orcamento/ToggleVisao.tsx`**

```typescript
'use client'

import type { TipoVisao } from '@/types/orcamento'

interface Props {
  visao: TipoVisao
  onChange: (v: TipoVisao) => void
}

export default function ToggleVisao({ visao, onChange }: Props) {
  return (
    <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm font-medium">
      <button
        onClick={() => onChange('comercial')}
        className={`px-4 py-2 transition-colors ${
          visao === 'comercial'
            ? 'bg-blue-600 text-white'
            : 'bg-white text-gray-600 hover:bg-gray-50'
        }`}
      >
        Comercial
      </button>
      <button
        onClick={() => onChange('tecnica')}
        className={`px-4 py-2 transition-colors border-l border-gray-300 ${
          visao === 'tecnica'
            ? 'bg-blue-600 text-white'
            : 'bg-white text-gray-600 hover:bg-gray-50'
        }`}
      >
        Técnica
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Criar `components/orcamento/CabecalhoObra.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { StatusObra } from '@/types/database'

const STATUS_LABELS: Record<StatusObra, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
  em_execucao: 'Em execução',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

interface ObraCabecalho {
  id: string
  codigo: string
  nome: string
  status: StatusObra
  data_orcamento: string | null
  clientes: { id: string; razao_social: string } | null
}

interface Props {
  obra: ObraCabecalho
  clientes: { id: string; razao_social: string }[]
}

export default function CabecalhoObra({ obra, clientes }: Props) {
  const [campos, setCampos] = useState({
    codigo: obra.codigo,
    nome: obra.nome,
    status: obra.status,
    cliente_id: obra.clientes?.id ?? '',
    data_orcamento: obra.data_orcamento ?? '',
  })

  async function salvar(campo: string, valor: string | null) {
    await fetch(`/api/obras/${obra.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [campo]: valor || null }),
    })
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">Código</Label>
          <Input
            value={campos.codigo}
            onChange={e => setCampos(p => ({ ...p, codigo: e.target.value }))}
            onBlur={() => salvar('codigo', campos.codigo)}
            className="font-mono text-sm"
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs text-gray-500">Nome da obra</Label>
          <Input
            value={campos.nome}
            onChange={e => setCampos(p => ({ ...p, nome: e.target.value }))}
            onBlur={() => salvar('nome', campos.nome)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">Cliente</Label>
          <Select
            value={campos.cliente_id}
            onValueChange={v => {
              setCampos(p => ({ ...p, cliente_id: v }))
              salvar('cliente_id', v || null)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecionar..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Nenhum</SelectItem>
              {clientes.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">Data do orçamento</Label>
          <Input
            type="date"
            value={campos.data_orcamento}
            onChange={e => setCampos(p => ({ ...p, data_orcamento: e.target.value }))}
            onBlur={() => salvar('data_orcamento', campos.data_orcamento)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">Status</Label>
          <Select
            value={campos.status}
            onValueChange={v => {
              setCampos(p => ({ ...p, status: v as StatusObra }))
              salvar('status', v)
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_LABELS) as StatusObra[]).map(s => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Criar `components/orcamento/TabelaOrcamento.tsx` (versão read-only)**

Esta versão exibe a tabela sem edição inline (Task 5 adiciona a edição):

```typescript
'use client'

import { fmt, fmtPct } from '@/lib/format'
import type { GrupoCalculado, TotaisGerais, TipoVisao } from '@/types/orcamento'

interface Props {
  gruposCalculados: GrupoCalculado[]
  totais: TotaisGerais
  visao: TipoVisao
}

export default function TabelaOrcamento({ gruposCalculados, totais, visao }: Props) {
  if (visao === 'comercial') {
    return (
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-gray-100 text-gray-600">
            <tr>
              <th className="px-2 py-2 text-left font-medium border-b border-gray-200 w-10">Item</th>
              <th className="px-2 py-2 text-left font-medium border-b border-gray-200 w-8">Nº</th>
              <th className="px-2 py-2 text-left font-medium border-b border-gray-200">Descrição</th>
              <th className="px-2 py-2 text-left font-medium border-b border-gray-200">Local</th>
              <th className="px-2 py-2 text-center font-medium border-b border-gray-200 w-12">UN</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-14">QT</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">P. Unit. MO</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">P. Unit. Mat.</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">Sub. MO</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">Sub. Mat.</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">Total</th>
            </tr>
          </thead>
          <tbody>
            {gruposCalculados.map(grupo => (
              <>
                {/* Linha de grupo */}
                <tr key={`grupo-${grupo.id}`} className="bg-gray-50 font-semibold text-gray-700">
                  <td className="px-2 py-1.5 border-b border-gray-200">{grupo.letra}</td>
                  <td className="px-2 py-1.5 border-b border-gray-200">{grupo.letra}</td>
                  <td className="px-2 py-1.5 border-b border-gray-200 uppercase text-xs">
                    {grupo.disciplinas?.nome ?? '—'}
                  </td>
                  <td colSpan={5} className="border-b border-gray-200" />
                  <td className="px-2 py-1.5 text-right border-b border-gray-200 font-mono">
                    {fmt(grupo.totais.subtotal_mao_obra_venda)}
                  </td>
                  <td className="px-2 py-1.5 text-right border-b border-gray-200 font-mono">
                    {fmt(grupo.totais.subtotal_material_venda)}
                  </td>
                  <td className="px-2 py-1.5 text-right border-b border-gray-200 font-mono">
                    {fmt(grupo.totais.total_venda)}
                  </td>
                </tr>
                {/* Linhas de item */}
                {grupo.itens_calculados.map(item => (
                  <tr key={item.id} className="hover:bg-blue-50 border-b border-gray-100">
                    <td className="px-2 py-1.5 text-gray-400">{grupo.letra}</td>
                    <td className="px-2 py-1.5 text-gray-500">{item.numero}</td>
                    <td className="px-2 py-1.5">{item.descricao}</td>
                    <td className="px-2 py-1.5 text-gray-500">{item.local ?? '—'}</td>
                    <td className="px-2 py-1.5 text-center text-gray-500">
                      {item.unidades_medida?.sigla ?? '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">{fmt(item.quantidade)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{fmt(item.preco_unit_mao_obra_venda)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{fmt(item.preco_unit_material_venda)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{fmt(item.subtotal_mao_obra_venda)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{fmt(item.subtotal_material_venda)}</td>
                    <td className="px-2 py-1.5 text-right font-mono font-semibold">{fmt(item.total_venda)}</td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
          <tfoot className="bg-gray-800 text-white font-semibold">
            <tr>
              <td colSpan={8} className="px-2 py-2 text-right uppercase text-xs tracking-wide">Total Geral</td>
              <td className="px-2 py-2 text-right font-mono">{fmt(totais.total_mao_obra_venda)}</td>
              <td className="px-2 py-2 text-right font-mono">{fmt(totais.total_material_venda)}</td>
              <td className="px-2 py-2 text-right font-mono">{fmt(totais.total_venda)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

  // Visão Técnica
  return (
    <div className="overflow-x-auto rounded border border-gray-200">
      <table className="w-full text-xs border-collapse">
        <thead className="bg-gray-100 text-gray-600">
          <tr>
            <th className="px-2 py-2 text-left font-medium border-b border-gray-200 w-10">Item</th>
            <th className="px-2 py-2 text-left font-medium border-b border-gray-200 w-8">Nº</th>
            <th className="px-2 py-2 text-left font-medium border-b border-gray-200">Descrição</th>
            <th className="px-2 py-2 text-left font-medium border-b border-gray-200">Local</th>
            <th className="px-2 py-2 text-center font-medium border-b border-gray-200 w-12">UN</th>
            <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-14">QT</th>
            <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">Custo MO</th>
            <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">Custo Mat.</th>
            <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">Total Custo</th>
            <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-16">Mg. MO%</th>
            <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-16">Mg. Mat%</th>
            <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">Total Venda</th>
            <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">Lucro</th>
            <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-16">Mg. Ef%</th>
          </tr>
        </thead>
        <tbody>
          {gruposCalculados.map(grupo => (
            <>
              <tr key={`grupo-${grupo.id}`} className="bg-gray-50 font-semibold text-gray-700">
                <td className="px-2 py-1.5 border-b border-gray-200">{grupo.letra}</td>
                <td className="px-2 py-1.5 border-b border-gray-200">{grupo.letra}</td>
                <td className="px-2 py-1.5 border-b border-gray-200 uppercase text-xs">
                  {grupo.disciplinas?.nome ?? '—'}
                </td>
                <td colSpan={5} className="border-b border-gray-200" />
                <td className="px-2 py-1.5 text-right border-b border-gray-200 font-mono">
                  {fmt(grupo.totais.total_custo)}
                </td>
                <td colSpan={2} className="border-b border-gray-200" />
                <td className="px-2 py-1.5 text-right border-b border-gray-200 font-mono">
                  {fmt(grupo.totais.total_venda)}
                </td>
                <td className="px-2 py-1.5 text-right border-b border-gray-200 font-mono">
                  {fmt(grupo.totais.lucro)}
                </td>
                <td className="border-b border-gray-200" />
              </tr>
              {grupo.itens_calculados.map(item => (
                <tr key={item.id} className="hover:bg-blue-50 border-b border-gray-100">
                  <td className="px-2 py-1.5 text-gray-400">{grupo.letra}</td>
                  <td className="px-2 py-1.5 text-gray-500">{item.numero}</td>
                  <td className="px-2 py-1.5">{item.descricao}</td>
                  <td className="px-2 py-1.5 text-gray-500">{item.local ?? '—'}</td>
                  <td className="px-2 py-1.5 text-center text-gray-500">
                    {item.unidades_medida?.sigla ?? '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmt(item.quantidade)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmt(item.custo_unit_mao_obra)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmt(item.custo_unit_material)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmt(item.total_custo)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmtPct(item.margem_mao_obra_pct)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmtPct(item.margem_material_pct)}</td>
                  <td className="px-2 py-1.5 text-right font-mono font-semibold">{fmt(item.total_venda)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmt(item.lucro)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmtPct(item.margem_efetiva_pct)}</td>
                </tr>
              ))}
            </>
          ))}
        </tbody>
        <tfoot className="bg-gray-800 text-white font-semibold">
          <tr>
            <td colSpan={8} className="px-2 py-2 text-right uppercase text-xs tracking-wide">Total Geral</td>
            <td className="px-2 py-2 text-right font-mono">{fmt(totais.total_custo)}</td>
            <td colSpan={2} />
            <td className="px-2 py-2 text-right font-mono">{fmt(totais.total_venda)}</td>
            <td className="px-2 py-2 text-right font-mono">{fmt(totais.lucro)}</td>
            <td className="px-2 py-2 text-right font-mono">{fmtPct(totais.margem_efetiva_pct)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Criar `components/orcamento/EditorOrcamento.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { calcularGrupo, calcularTotaisGerais } from '@/lib/calculos'
import type { Cliente, Disciplina, GrupoOrcamento, ItemOrcamento, UnidadeMedida } from '@/types/database'
import type { GrupoCalculado, TotaisGerais, TipoVisao } from '@/types/orcamento'
import CabecalhoObra from './CabecalhoObra'
import ToggleVisao from './ToggleVisao'
import TabelaOrcamento from './TabelaOrcamento'

type GrupoComItens = GrupoOrcamento & {
  disciplinas?: Disciplina | null
  itens_orcamento: (ItemOrcamento & { unidades_medida?: UnidadeMedida | null })[]
}

type ObraParaEditor = {
  id: string
  codigo: string
  nome: string
  status: import('@/types/database').StatusObra
  data_orcamento: string | null
  clientes: { id: string; razao_social: string } | null
  grupos_orcamento: GrupoComItens[]
}

interface Props {
  obra: ObraParaEditor
  clientes: Pick<Cliente, 'id' | 'razao_social'>[]
  disciplinas: Pick<Disciplina, 'id' | 'nome'>[]
  unidades: Pick<UnidadeMedida, 'id' | 'sigla'>[]
}

export default function EditorOrcamento({ obra, clientes, disciplinas, unidades }: Props) {
  const [grupos, setGrupos] = useState<GrupoComItens[]>(
    obra.grupos_orcamento.map(g => ({ ...g, itens_orcamento: g.itens_orcamento ?? [] }))
  )
  const [visao, setVisao] = useState<TipoVisao>('comercial')

  const gruposCalculados: GrupoCalculado[] = grupos.map(g => calcularGrupo(g))
  const totais: TotaisGerais = calcularTotaisGerais(gruposCalculados)

  return (
    <div className="p-6 space-y-4">
      <CabecalhoObra obra={obra} clientes={clientes} />
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Orçamento</h2>
        <ToggleVisao visao={visao} onChange={setVisao} />
      </div>
      <TabelaOrcamento
        gruposCalculados={gruposCalculados}
        totais={totais}
        visao={visao}
      />
    </div>
  )
}
```

- [ ] **Step 5: Criar `app/(app)/obras/[id]/page.tsx`**

```typescript
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EditorOrcamento from '@/components/orcamento/EditorOrcamento'

export default async function ObraPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [obraResult, clientesResult, disciplinasResult, unidadesResult] = await Promise.all([
    supabase
      .from('obras')
      .select(`
        id, codigo, nome, status, data_orcamento,
        clientes (id, razao_social),
        grupos_orcamento (
          id, obra_id, disciplina_id, letra, ordem,
          disciplinas (id, nome, ativo),
          itens_orcamento (
            id, grupo_id, numero, descricao, local, unidade_id,
            quantidade, custo_unit_mao_obra, custo_unit_material,
            margem_mao_obra_pct, margem_material_pct,
            observacao, observacao_2, ordem,
            unidades_medida (id, sigla, descricao)
          )
        )
      `)
      .eq('id', id)
      .single(),
    supabase.from('clientes').select('id, razao_social').order('razao_social'),
    supabase.from('disciplinas').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('unidades_medida').select('id, sigla').order('sigla'),
  ])

  if (obraResult.error || !obraResult.data) notFound()

  const obra = obraResult.data
  // Ordenar grupos e itens por ordem
  obra.grupos_orcamento?.sort((a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem)
  obra.grupos_orcamento?.forEach((g: { itens_orcamento?: { ordem: number }[] }) => {
    g.itens_orcamento?.sort((a, b) => a.ordem - b.ordem)
  })

  return (
    <EditorOrcamento
      obra={obra as Parameters<typeof EditorOrcamento>[0]['obra']}
      clientes={clientesResult.data ?? []}
      disciplinas={disciplinasResult.data ?? []}
      unidades={unidadesResult.data ?? []}
    />
  )
}
```

- [ ] **Step 6: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: nenhum erro. Se houver erros de tipo no `obra as ...`, ajuste o cast para `as unknown as ...`.

- [ ] **Step 7: Commit**

```bash
git add app/\(app\)/obras/\[id\]/ components/orcamento/
git commit -m "feat: editor de orçamento com cabeçalho, toggle visão e tabela read-only"
```

---

## Task 5: Editor — edição inline e add/remove de grupos/itens

**Files:**
- Modify: `components/orcamento/TabelaOrcamento.tsx` — adicionar edição inline, botões add/remove
- Modify: `components/orcamento/EditorOrcamento.tsx` — adicionar handlers de mutação

**Interfaces:**
- Consome: `PUT /api/obras/[id]/grupos/[grupoId]/itens/[itemId]`, `POST /api/obras/[id]/grupos`, `DELETE /api/obras/[id]/grupos/[grupoId]`, `POST /api/obras/[id]/grupos/[grupoId]/itens`, `DELETE /api/obras/[id]/grupos/[grupoId]/itens/[itemId]`
- Produz: tabela totalmente interativa com edição double-click, add/remove grupo e item, totais atualizando em tempo real

- [ ] **Step 1: Atualizar `components/orcamento/EditorOrcamento.tsx` com handlers de mutação**

Substitua o arquivo completo:

```typescript
'use client'

import { useState } from 'react'
import { calcularGrupo, calcularTotaisGerais } from '@/lib/calculos'
import type { Cliente, Disciplina, GrupoOrcamento, ItemOrcamento, UnidadeMedida } from '@/types/database'
import type { GrupoCalculado, TotaisGerais, TipoVisao } from '@/types/orcamento'
import CabecalhoObra from './CabecalhoObra'
import ToggleVisao from './ToggleVisao'
import TabelaOrcamento from './TabelaOrcamento'

type GrupoComItens = GrupoOrcamento & {
  disciplinas?: Disciplina | null
  itens_orcamento: (ItemOrcamento & { unidades_medida?: UnidadeMedida | null })[]
}

type ObraParaEditor = {
  id: string
  codigo: string
  nome: string
  status: import('@/types/database').StatusObra
  data_orcamento: string | null
  clientes: { id: string; razao_social: string } | null
  grupos_orcamento: GrupoComItens[]
}

interface Props {
  obra: ObraParaEditor
  clientes: Pick<Cliente, 'id' | 'razao_social'>[]
  disciplinas: Pick<Disciplina, 'id' | 'nome'>[]
  unidades: Pick<UnidadeMedida, 'id' | 'sigla'>[]
}

export default function EditorOrcamento({ obra, clientes, disciplinas, unidades }: Props) {
  const [grupos, setGrupos] = useState<GrupoComItens[]>(
    obra.grupos_orcamento.map(g => ({ ...g, itens_orcamento: g.itens_orcamento ?? [] }))
  )
  const [visao, setVisao] = useState<TipoVisao>('comercial')

  const gruposCalculados: GrupoCalculado[] = grupos.map(g => calcularGrupo(g))
  const totais: TotaisGerais = calcularTotaisGerais(gruposCalculados)

  async function atualizarItem(grupoId: string, itemId: string, campo: string, valor: unknown) {
    // Atualização otimista
    setGrupos(prev => prev.map(g =>
      g.id !== grupoId ? g : {
        ...g,
        itens_orcamento: g.itens_orcamento.map(item =>
          item.id !== itemId ? item : { ...item, [campo]: valor }
        ),
      }
    ))
    await fetch(`/api/obras/${obra.id}/grupos/${grupoId}/itens/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [campo]: valor }),
    })
  }

  async function adicionarGrupo(disciplina_id: string) {
    const res = await fetch(`/api/obras/${obra.id}/grupos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disciplina_id }),
    })
    if (!res.ok) return
    const novoGrupo = await res.json()
    setGrupos(prev => [...prev, { ...novoGrupo, itens_orcamento: novoGrupo.itens_orcamento ?? [] }])
  }

  async function removerGrupo(grupoId: string) {
    const res = await fetch(`/api/obras/${obra.id}/grupos/${grupoId}`, { method: 'DELETE' })
    if (!res.ok) return
    setGrupos(prev => prev.filter(g => g.id !== grupoId))
  }

  async function adicionarItem(grupoId: string) {
    const res = await fetch(`/api/obras/${obra.id}/grupos/${grupoId}/itens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (!res.ok) return
    const novoItem = await res.json()
    setGrupos(prev => prev.map(g =>
      g.id !== grupoId ? g : {
        ...g,
        itens_orcamento: [...g.itens_orcamento, novoItem],
      }
    ))
  }

  async function removerItem(grupoId: string, itemId: string) {
    const res = await fetch(`/api/obras/${obra.id}/grupos/${grupoId}/itens/${itemId}`, {
      method: 'DELETE',
    })
    if (!res.ok) return
    setGrupos(prev => prev.map(g =>
      g.id !== grupoId ? g : {
        ...g,
        itens_orcamento: g.itens_orcamento.filter(item => item.id !== itemId),
      }
    ))
  }

  return (
    <div className="p-6 space-y-4">
      <CabecalhoObra obra={obra} clientes={clientes} />
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Orçamento</h2>
        <ToggleVisao visao={visao} onChange={setVisao} />
      </div>
      <TabelaOrcamento
        gruposCalculados={gruposCalculados}
        totais={totais}
        visao={visao}
        obraId={obra.id}
        disciplinas={disciplinas}
        unidades={unidades}
        onUpdateItem={atualizarItem}
        onAddGrupo={adicionarGrupo}
        onRemoveGrupo={removerGrupo}
        onAddItem={adicionarItem}
        onRemoveItem={removerItem}
      />
    </div>
  )
}
```

- [ ] **Step 2: Atualizar `components/orcamento/TabelaOrcamento.tsx` com edição inline**

Substitua o arquivo completo:

```typescript
'use client'

import { useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fmt, fmtPct } from '@/lib/format'
import type { GrupoCalculado, TotaisGerais, TipoVisao } from '@/types/orcamento'
import type { Disciplina, UnidadeMedida } from '@/types/database'

interface Props {
  gruposCalculados: GrupoCalculado[]
  totais: TotaisGerais
  visao: TipoVisao
  obraId: string
  disciplinas: Pick<Disciplina, 'id' | 'nome'>[]
  unidades: Pick<UnidadeMedida, 'id' | 'sigla'>[]
  onUpdateItem: (grupoId: string, itemId: string, campo: string, valor: unknown) => Promise<void>
  onAddGrupo: (disciplina_id: string) => Promise<void>
  onRemoveGrupo: (grupoId: string) => Promise<void>
  onAddItem: (grupoId: string) => Promise<void>
  onRemoveItem: (grupoId: string, itemId: string) => Promise<void>
}

function CelulaEditavel({
  valor,
  tipo,
  className,
  onSave,
}: {
  valor: string | number
  tipo: 'text' | 'number'
  className?: string
  onSave: (v: string) => void
}) {
  const [editando, setEditando] = useState(false)
  const [draft, setDraft] = useState('')

  function abrir() {
    setDraft(String(valor))
    setEditando(true)
  }

  function confirmar() {
    onSave(draft)
    setEditando(false)
  }

  if (editando) {
    return (
      <input
        type={tipo}
        value={draft}
        autoFocus
        className={`w-full border border-blue-400 rounded px-1 py-0 text-xs bg-white ${tipo === 'number' ? 'text-right' : ''} ${className ?? ''}`}
        onChange={e => setDraft(e.target.value)}
        onBlur={confirmar}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setEditando(false)
        }}
      />
    )
  }

  return (
    <div
      onDoubleClick={abrir}
      className={`cursor-default hover:bg-blue-50 rounded px-1 select-none ${className ?? ''}`}
      title="Duplo clique para editar"
    >
      {tipo === 'number' ? fmt(Number(valor)) : String(valor || '—')}
    </div>
  )
}

export default function TabelaOrcamento({
  gruposCalculados,
  totais,
  visao,
  disciplinas,
  unidades,
  onUpdateItem,
  onAddGrupo,
  onRemoveGrupo,
  onAddItem,
  onRemoveItem,
}: Props) {
  const [adicionandoGrupo, setAdicionandoGrupo] = useState(false)
  const [disciplinaSelecionada, setDisciplinaSelecionada] = useState('')

  async function confirmarAdicionarGrupo() {
    if (!disciplinaSelecionada) return
    await onAddGrupo(disciplinaSelecionada)
    setAdicionandoGrupo(false)
    setDisciplinaSelecionada('')
  }

  const colsComercial = 11
  const colsTecnica = 14

  if (visao === 'comercial') {
    return (
      <div className="space-y-2">
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-gray-100 text-gray-600">
              <tr>
                <th className="px-2 py-2 text-left font-medium border-b border-gray-200 w-10">Item</th>
                <th className="px-2 py-2 text-left font-medium border-b border-gray-200 w-8">Nº</th>
                <th className="px-2 py-2 text-left font-medium border-b border-gray-200">Descrição</th>
                <th className="px-2 py-2 text-left font-medium border-b border-gray-200 w-32">Local</th>
                <th className="px-2 py-2 text-center font-medium border-b border-gray-200 w-16">UN</th>
                <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-16">QT</th>
                <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">P. Unit. MO</th>
                <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">P. Unit. Mat.</th>
                <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">Sub. MO</th>
                <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">Sub. Mat.</th>
                <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">Total</th>
                <th className="px-2 py-2 border-b border-gray-200 w-8" />
              </tr>
            </thead>
            <tbody>
              {gruposCalculados.map(grupo => (
                <>
                  <tr key={`grupo-${grupo.id}`} className="bg-gray-50 font-semibold text-gray-700">
                    <td className="px-2 py-1.5 border-b border-gray-200">{grupo.letra}</td>
                    <td className="px-2 py-1.5 border-b border-gray-200">{grupo.letra}</td>
                    <td className="px-2 py-1.5 border-b border-gray-200 uppercase">
                      {grupo.disciplinas?.nome ?? '—'}
                    </td>
                    <td colSpan={5} className="border-b border-gray-200" />
                    <td className="px-2 py-1.5 text-right border-b border-gray-200 font-mono">
                      {fmt(grupo.totais.subtotal_mao_obra_venda)}
                    </td>
                    <td className="px-2 py-1.5 text-right border-b border-gray-200 font-mono">
                      {fmt(grupo.totais.subtotal_material_venda)}
                    </td>
                    <td className="px-2 py-1.5 text-right border-b border-gray-200 font-mono">
                      {fmt(grupo.totais.total_venda)}
                    </td>
                    <td className="px-2 py-1.5 border-b border-gray-200 text-center">
                      <button
                        onClick={() => onRemoveGrupo(grupo.id)}
                        className="text-red-400 hover:text-red-600 font-bold"
                        title="Remover grupo"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                  {grupo.itens_calculados.map(item => (
                    <tr key={item.id} className="hover:bg-blue-50 border-b border-gray-100">
                      <td className="px-2 py-1 text-gray-400">{grupo.letra}</td>
                      <td className="px-2 py-1 text-gray-500">{item.numero}</td>
                      <td className="px-2 py-1">
                        <CelulaEditavel
                          valor={item.descricao}
                          tipo="text"
                          onSave={v => onUpdateItem(grupo.id, item.id, 'descricao', v)}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <CelulaEditavel
                          valor={item.local ?? ''}
                          tipo="text"
                          onSave={v => onUpdateItem(grupo.id, item.id, 'local', v || null)}
                        />
                      </td>
                      <td className="px-2 py-1 text-center">
                        <Select
                          value={item.unidade_id ?? ''}
                          onValueChange={v => onUpdateItem(grupo.id, item.id, 'unidade_id', v || null)}
                        >
                          <SelectTrigger className="h-6 text-xs">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">—</SelectItem>
                            {unidades.map(u => (
                              <SelectItem key={u.id} value={u.id}>{u.sigla}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1">
                        <CelulaEditavel
                          valor={item.quantidade}
                          tipo="number"
                          className="text-right"
                          onSave={v => onUpdateItem(grupo.id, item.id, 'quantidade', parseFloat(v) || 0)}
                        />
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-gray-500">
                        {fmt(item.preco_unit_mao_obra_venda)}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-gray-500">
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
                  <tr key={`add-item-${grupo.id}`}>
                    <td colSpan={colsComercial + 1} className="px-2 py-1 border-b border-gray-100">
                      <button
                        onClick={() => onAddItem(grupo.id)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        + Adicionar item
                      </button>
                    </td>
                  </tr>
                </>
              ))}
            </tbody>
            <tfoot className="bg-gray-800 text-white font-semibold">
              <tr>
                <td colSpan={8} className="px-2 py-2 text-right uppercase text-xs tracking-wide">Total Geral</td>
                <td className="px-2 py-2 text-right font-mono">{fmt(totais.total_mao_obra_venda)}</td>
                <td className="px-2 py-2 text-right font-mono">{fmt(totais.total_material_venda)}</td>
                <td className="px-2 py-2 text-right font-mono">{fmt(totais.total_venda)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Adicionar grupo */}
        <div className="flex items-center gap-2">
          {adicionandoGrupo ? (
            <>
              <Select value={disciplinaSelecionada} onValueChange={setDisciplinaSelecionada}>
                <SelectTrigger className="w-56 h-8 text-sm">
                  <SelectValue placeholder="Selecionar disciplina..." />
                </SelectTrigger>
                <SelectContent>
                  {disciplinas.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                onClick={confirmarAdicionarGrupo}
                className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Confirmar
              </button>
              <button
                onClick={() => { setAdicionandoGrupo(false); setDisciplinaSelecionada('') }}
                className="text-sm px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              onClick={() => setAdicionandoGrupo(true)}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              + Adicionar grupo
            </button>
          )}
        </div>
      </div>
    )
  }

  // Visão Técnica
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-gray-100 text-gray-600">
            <tr>
              <th className="px-2 py-2 text-left font-medium border-b border-gray-200 w-10">Item</th>
              <th className="px-2 py-2 text-left font-medium border-b border-gray-200 w-8">Nº</th>
              <th className="px-2 py-2 text-left font-medium border-b border-gray-200">Descrição</th>
              <th className="px-2 py-2 text-left font-medium border-b border-gray-200 w-28">Local</th>
              <th className="px-2 py-2 text-center font-medium border-b border-gray-200 w-16">UN</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-16">QT</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-22">Custo MO</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-22">Custo Mat.</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-22">Total Custo</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-16">Mg. MO%</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-16">Mg. Mat%</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-22">Total Venda</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-22">Lucro</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-16">Mg. Ef%</th>
              <th className="px-2 py-2 border-b border-gray-200 w-8" />
            </tr>
          </thead>
          <tbody>
            {gruposCalculados.map(grupo => (
              <>
                <tr key={`grupo-${grupo.id}`} className="bg-gray-50 font-semibold text-gray-700">
                  <td className="px-2 py-1.5 border-b border-gray-200">{grupo.letra}</td>
                  <td className="px-2 py-1.5 border-b border-gray-200">{grupo.letra}</td>
                  <td className="px-2 py-1.5 border-b border-gray-200 uppercase">
                    {grupo.disciplinas?.nome ?? '—'}
                  </td>
                  <td colSpan={5} className="border-b border-gray-200" />
                  <td className="px-2 py-1.5 text-right border-b border-gray-200 font-mono">
                    {fmt(grupo.totais.total_custo)}
                  </td>
                  <td colSpan={2} className="border-b border-gray-200" />
                  <td className="px-2 py-1.5 text-right border-b border-gray-200 font-mono">
                    {fmt(grupo.totais.total_venda)}
                  </td>
                  <td className="px-2 py-1.5 text-right border-b border-gray-200 font-mono">
                    {fmt(grupo.totais.lucro)}
                  </td>
                  <td className="border-b border-gray-200" />
                  <td className="px-2 py-1.5 border-b border-gray-200 text-center">
                    <button
                      onClick={() => onRemoveGrupo(grupo.id)}
                      className="text-red-400 hover:text-red-600 font-bold"
                    >
                      ×
                    </button>
                  </td>
                </tr>
                {grupo.itens_calculados.map(item => (
                  <tr key={item.id} className="hover:bg-blue-50 border-b border-gray-100">
                    <td className="px-2 py-1 text-gray-400">{grupo.letra}</td>
                    <td className="px-2 py-1 text-gray-500">{item.numero}</td>
                    <td className="px-2 py-1">
                      <CelulaEditavel
                        valor={item.descricao}
                        tipo="text"
                        onSave={v => onUpdateItem(grupo.id, item.id, 'descricao', v)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <CelulaEditavel
                        valor={item.local ?? ''}
                        tipo="text"
                        onSave={v => onUpdateItem(grupo.id, item.id, 'local', v || null)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Select
                        value={item.unidade_id ?? ''}
                        onValueChange={v => onUpdateItem(grupo.id, item.id, 'unidade_id', v || null)}
                      >
                        <SelectTrigger className="h-6 text-xs">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">—</SelectItem>
                          {unidades.map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.sigla}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                        valor={item.margem_mao_obra_pct}
                        tipo="number"
                        className="text-right"
                        onSave={v => onUpdateItem(grupo.id, item.id, 'margem_mao_obra_pct', parseFloat(v) || 0)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <CelulaEditavel
                        valor={item.margem_material_pct}
                        tipo="number"
                        className="text-right"
                        onSave={v => onUpdateItem(grupo.id, item.id, 'margem_material_pct', parseFloat(v) || 0)}
                      />
                    </td>
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
                <tr key={`add-item-${grupo.id}`}>
                  <td colSpan={colsTecnica + 1} className="px-2 py-1 border-b border-gray-100">
                    <button
                      onClick={() => onAddItem(grupo.id)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      + Adicionar item
                    </button>
                  </td>
                </tr>
              </>
            ))}
          </tbody>
          <tfoot className="bg-gray-800 text-white font-semibold">
            <tr>
              <td colSpan={8} className="px-2 py-2 text-right uppercase text-xs tracking-wide">Total Geral</td>
              <td className="px-2 py-2 text-right font-mono">{fmt(totais.total_custo)}</td>
              <td colSpan={2} />
              <td className="px-2 py-2 text-right font-mono">{fmt(totais.total_venda)}</td>
              <td className="px-2 py-2 text-right font-mono">{fmt(totais.lucro)}</td>
              <td className="px-2 py-2 text-right font-mono">{fmtPct(totais.margem_efetiva_pct)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Adicionar grupo */}
      <div className="flex items-center gap-2">
        {adicionandoGrupo ? (
          <>
            <Select value={disciplinaSelecionada} onValueChange={setDisciplinaSelecionada}>
              <SelectTrigger className="w-56 h-8 text-sm">
                <SelectValue placeholder="Selecionar disciplina..." />
              </SelectTrigger>
              <SelectContent>
                {disciplinas.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              onClick={confirmarAdicionarGrupo}
              className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Confirmar
            </button>
            <button
              onClick={() => { setAdicionandoGrupo(false); setDisciplinaSelecionada('') }}
              className="text-sm px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            onClick={() => setAdicionandoGrupo(true)}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            + Adicionar grupo
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: nenhum erro. Se houver erros de JSX com `<>` dentro de `<tbody>`, adicione `key` único no Fragment ou use `<React.Fragment key={...}>`.

- [ ] **Step 4: Subir o servidor e testar manualmente**

```bash
npm run dev
```

Teste o fluxo completo:
1. Acesse `localhost:3000/obras`
2. Confirme que a lista carrega (vazia se nenhuma obra criada)
3. Clique "+ Nova obra", preencha código e nome, clique "Criar obra"
4. Confirme que navega para `/obras/[id]`
5. No editor: mude o status via dropdown do cabeçalho
6. Clique "+ Adicionar grupo", selecione uma disciplina, confirme
7. No grupo criado, clique "+ Adicionar item"
8. Dê duplo clique na célula "Descrição" do item e edite o texto
9. Pressione Enter ou clique fora — confirme que o valor salva
10. Na visão Técnica: edite Custo MO e Margem MO% — confirme que o Total Venda e Margem Efetiva atualizam em tempo real
11. Clique "×" em um item para remover, confirme remoção
12. Clique "×" em um grupo para remover, confirme remoção

- [ ] **Step 5: Commit**

```bash
git add components/orcamento/
git commit -m "feat: editor com edição inline, add/remove grupos e itens, totais em tempo real"
```

---

## Checklist de conclusão da Fase 2

- [ ] `npm run test:run` — testes de calculos passando
- [ ] `npx tsc --noEmit` — sem erros de TypeScript
- [ ] Lista de obras carrega e filtra por busca/status
- [ ] Modal "Nova obra" cria e navega para o editor
- [ ] Editor: cabeçalho editável salva no banco (verificar no Supabase Table Editor)
- [ ] Toggle técnica/comercial muda as colunas exibidas
- [ ] Duplo clique numa célula abre edição inline
- [ ] Após edição, o total do grupo e total geral atualizam imediatamente
- [ ] Add grupo → selecionar disciplina → aparece na tabela
- [ ] Add item → aparece no grupo com zeros
- [ ] Remover item → some da tabela
- [ ] Remover grupo → some com todos seus itens

Fase 2 concluída. Prosseguir para `2026-06-29-fase3-excel-import-export.md`.
