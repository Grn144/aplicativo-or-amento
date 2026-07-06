# Modelo de Orçamento da Empresa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o modelo de orçamento custo+margem% pelo modelo real da empresa — custo → FEE → markup → venda, com resumo de rentabilidade (comissão/imposto/líquido) — mantendo a nomenclatura da planilha `08092.01`.

**Architecture:** Toda a matemática vive em `lib/calculos.ts` (fonte única). `calcularItem(item, feeFator)` passa a receber o fator de FEE da obra. Uma nova `calcularRentabilidade(itens, obra)` produz o P&L. Os fatores (fee, comissão, imposto) ficam na tabela `obras`; o markup por item substitui a margem em `itens_orcamento`. As mudanças de tipo rompem consumidores, então a Task 2 troca tipos+cálculo+todos os consumidores num único passo para manter o build verde.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Supabase (PostgreSQL), exceljs, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-06-modelo-orcamento-empresa-design.md`

## Global Constraints

- Todo texto de UI em português brasileiro.
- TypeScript strict; alias `@/*`.
- **Nenhuma fórmula duplicada** — custo/FEE/venda/rentabilidade só em `lib/calculos.ts`.
- Fatores padrão: `fee_fator=1.02`, `comissao_pct=12`, `imposto_pct=30`; markup padrão `1.0`.
- Fórmulas exatas (verbatim da spec):
  - `fee_unit = custo_unit × fee_fator`
  - `preco_venda_unit = fee_unit × markup`
  - `subtotal_custo = custo_unit × qt`; `subtotal_venda = preco_venda_unit × qt`
  - `comissao = faturamento × comissao_pct/100`
  - `imposto = (faturamento − comissao) × imposto_pct/100`
  - `custo_com_fee = custo_total × fee_fator`
  - `liquido = faturamento − comissao − imposto − custo_com_fee`
  - `liquido_pct = faturamento>0 ? liquido/faturamento×100 : null`
- Nomenclatura da planilha: ITEM, Nº, DESCRIÇÃO, DISCIPLINA, LOCAL, UN., QT., M. OBRA, MAT, SUB TOTAL, TOTAL, FEE M.OBRA, $ M.OBRA, FEE MAT, $ MAT, OBS.
- Commits em português no padrão `feat:`/`fix:`/`test:`.
- Verificação de build: se `npm run build` falhar com EINVAL/readlink em `.next` (artefato OneDrive), rodar `Remove-Item -Recurse -Force .next` **com o dev server parado** e repetir.
- PowerShell: sem `&&`; paths com colchetes precisam de `-LiteralPath` no Remove-Item.

---

### Task 1: Migration do modelo markup

**Files:**
- Create: `supabase/migrations/005_modelo_markup.sql`

**Interfaces:**
- Produces: colunas `obras.fee_fator/comissao_pct/imposto_pct` e `itens_orcamento.markup_mao_obra/markup_material`; remove `itens_orcamento.margem_mao_obra_pct/margem_material_pct`.

- [ ] **Step 1: Criar `supabase/migrations/005_modelo_markup.sql`**

```sql
-- 005_modelo_markup.sql
-- Modelo FEE + markup por item + fatores de rentabilidade por obra.

ALTER TABLE obras
  ADD COLUMN fee_fator    numeric(8,4) NOT NULL DEFAULT 1.02,
  ADD COLUMN comissao_pct numeric(8,4) NOT NULL DEFAULT 12,
  ADD COLUMN imposto_pct  numeric(8,4) NOT NULL DEFAULT 30;

ALTER TABLE itens_orcamento
  ADD COLUMN markup_mao_obra numeric(8,4) NOT NULL DEFAULT 1,
  ADD COLUMN markup_material numeric(8,4) NOT NULL DEFAULT 1;

ALTER TABLE itens_orcamento
  DROP COLUMN margem_mao_obra_pct,
  DROP COLUMN margem_material_pct;
```

- [ ] **Step 2: Executar no Supabase**

No painel Supabase → SQL Editor, colar e executar o arquivo. Esperado: "Success. No rows returned". Conferir em Table Editor que `obras` tem as 3 colunas novas e `itens_orcamento` tem markup (sem margem).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/005_modelo_markup.sql
git commit -m "feat: migration do modelo FEE + markup + fatores de rentabilidade"
```

---

### Task 2: Núcleo — tipos + `lib/calculos.ts` + consumidores (TDD)

**Files:**
- Modify: `types/database.ts`, `types/orcamento.ts`, `lib/calculos.ts`
- Test: `lib/calculos.test.ts` (reescrito)
- Modify (compilar): `app/api/obras/[id]/export/route.ts`, `lib/dashboard/metricas.ts`, `app/(app)/obras/page.tsx`, `components/orcamento/EditorOrcamento.tsx`

**Interfaces:**
- Produces:
  - `Obra` ganha `fee_fator: number; comissao_pct: number; imposto_pct: number`.
  - `ItemOrcamento`: remove `margem_mao_obra_pct/margem_material_pct`; adiciona `markup_mao_obra: number; markup_material: number`.
  - `ItemCalculado` ganha `fee_unit_mao_obra: number; fee_unit_material: number` (mantém `preco_unit_mao_obra_venda`, `preco_unit_material_venda`, subtotais, `total_custo`, `total_venda`, `lucro`).
  - `calcularItem(item: ItemOrcamento, feeFator: number): ItemCalculado`
  - `calcularGrupo(grupo, feeFator): GrupoCalculado`
  - `interface Rentabilidade { faturamento; custo_total; comissao; imposto; custo_com_fee; liquido; liquido_pct: number | null }`
  - `calcularRentabilidade(grupos: GrupoCalculado[], fatores: { fee_fator; comissao_pct; imposto_pct }): Rentabilidade`

- [ ] **Step 1: Reescrever `lib/calculos.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { calcularItem, calcularRentabilidade, calcularGrupo } from './calculos'
import type { ItemOrcamento } from '@/types/database'

function item(over: Partial<ItemOrcamento> = {}): ItemOrcamento {
  return {
    id: '', grupo_id: '', numero: 1, descricao: '', local: null,
    unidade_id: null, observacao: null, observacao_2: null, ordem: 1,
    quantidade: 1, custo_unit_mao_obra: 0, custo_unit_material: 0,
    markup_mao_obra: 1, markup_material: 1, ...over,
  }
}

describe('calcularItem (modelo FEE + markup)', () => {
  it('reproduz o item da planilha: custo 200/100, markup 2.5/2.0, fee 1.02', () => {
    const c = calcularItem(item({
      quantidade: 1, custo_unit_mao_obra: 200, custo_unit_material: 100,
      markup_mao_obra: 2.5, markup_material: 2,
    }), 1.02)
    expect(c.fee_unit_mao_obra).toBeCloseTo(204)
    expect(c.fee_unit_material).toBeCloseTo(102)
    expect(c.preco_unit_mao_obra_venda).toBeCloseTo(510)
    expect(c.preco_unit_material_venda).toBeCloseTo(204)
    expect(c.total_custo).toBeCloseTo(300)
    expect(c.total_venda).toBeCloseTo(714)
    expect(c.lucro).toBeCloseTo(414)
  })

  it('reproduz item com markup fracionário: custo 25/18 qt 87, markup 1.65/1.45', () => {
    const c = calcularItem(item({
      quantidade: 87, custo_unit_mao_obra: 25, custo_unit_material: 18,
      markup_mao_obra: 1.65, markup_material: 1.45,
    }), 1.02)
    expect(c.preco_unit_mao_obra_venda).toBeCloseTo(42.075)
    expect(c.preco_unit_material_venda).toBeCloseTo(26.622)
    expect(c.subtotal_mao_obra_venda).toBeCloseTo(42.075 * 87)
  })

  it('markup 1.0 → venda = custo × fee', () => {
    const c = calcularItem(item({ custo_unit_mao_obra: 100, quantidade: 1 }), 1.02)
    expect(c.preco_unit_mao_obra_venda).toBeCloseTo(102)
  })
})

describe('calcularRentabilidade', () => {
  it('comissão, imposto sobre (fat−comissão), custo com fee e líquido', () => {
    const grupo = calcularGrupo({
      id: 'g', obra_id: '', disciplina_id: '', letra: 'A', ordem: 1,
      itens_orcamento: [item({
        quantidade: 1, custo_unit_mao_obra: 200, custo_unit_material: 100,
        markup_mao_obra: 2.5, markup_material: 2,
      })],
    }, 1.02)
    const r = calcularRentabilidade([grupo], { fee_fator: 1.02, comissao_pct: 12, imposto_pct: 30 })
    expect(r.faturamento).toBeCloseTo(714)
    expect(r.custo_total).toBeCloseTo(300)
    expect(r.comissao).toBeCloseTo(714 * 0.12)             // 85.68
    expect(r.imposto).toBeCloseTo((714 - 85.68) * 0.30)    // 188.496
    expect(r.custo_com_fee).toBeCloseTo(300 * 1.02)        // 306
    expect(r.liquido).toBeCloseTo(714 - 85.68 - 188.496 - 306)
    expect(r.liquido_pct).toBeCloseTo(r.liquido / 714 * 100)
  })

  it('faturamento zero → liquido_pct null', () => {
    const r = calcularRentabilidade([], { fee_fator: 1.02, comissao_pct: 12, imposto_pct: 30 })
    expect(r.faturamento).toBe(0)
    expect(r.liquido_pct).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/calculos.test.ts`
Expected: FAIL (assinatura antiga de `calcularItem` sem `feeFator`; `markup_*` e `calcularRentabilidade` não existem).

- [ ] **Step 3: Atualizar `types/database.ts`**

No `interface Obra`, adicionar após `status`:
```typescript
  fee_fator: number
  comissao_pct: number
  imposto_pct: number
```
No `interface ItemOrcamento`, remover as linhas `margem_mao_obra_pct` e `margem_material_pct` e adicionar:
```typescript
  markup_mao_obra: number
  markup_material: number
```

- [ ] **Step 4: Atualizar `types/orcamento.ts`**

No `interface ItemCalculado extends ItemOrcamento`, adicionar:
```typescript
  fee_unit_mao_obra: number
  fee_unit_material: number
```
Ao final do arquivo, adicionar:
```typescript
export interface Rentabilidade {
  faturamento: number
  custo_total: number
  comissao: number
  imposto: number
  custo_com_fee: number
  liquido: number
  liquido_pct: number | null
}
```

- [ ] **Step 5: Reescrever `lib/calculos.ts`**

```typescript
import type { ItemOrcamento, GrupoOrcamento } from '@/types/database'
import type { ItemCalculado, TotaisGrupo, TotaisGerais, GrupoCalculado, Rentabilidade } from '@/types/orcamento'

export function calcularItem(item: ItemOrcamento, feeFator: number): ItemCalculado {
  const subtotal_mao_obra_custo = item.custo_unit_mao_obra * item.quantidade
  const subtotal_material_custo = item.custo_unit_material * item.quantidade
  const total_custo = subtotal_mao_obra_custo + subtotal_material_custo

  const fee_unit_mao_obra = item.custo_unit_mao_obra * feeFator
  const fee_unit_material = item.custo_unit_material * feeFator
  const preco_unit_mao_obra_venda = fee_unit_mao_obra * item.markup_mao_obra
  const preco_unit_material_venda = fee_unit_material * item.markup_material
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
    fee_unit_mao_obra,
    fee_unit_material,
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
      subtotal_mao_obra_custo: 0, subtotal_material_custo: 0, total_custo: 0,
      subtotal_mao_obra_venda: 0, subtotal_material_venda: 0, total_venda: 0, lucro: 0,
    }
  )
}

export function calcularGrupo(
  grupo: GrupoOrcamento & { itens_orcamento: ItemOrcamento[] },
  feeFator: number
): GrupoCalculado {
  const itens_calculados = grupo.itens_orcamento.map(it => calcularItem(it, feeFator))
  const totais = calcularTotaisGrupo(itens_calculados)
  return { ...grupo, itens_calculados, totais }
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
      total_mao_obra_custo: 0, total_material_custo: 0, total_custo: 0,
      total_mao_obra_venda: 0, total_material_venda: 0, total_venda: 0, lucro: 0,
    }
  )
  const margem_efetiva_pct = acc.total_venda > 0 ? (acc.lucro / acc.total_venda) * 100 : 0
  return { ...acc, margem_efetiva_pct }
}

export function calcularRentabilidade(
  grupos: GrupoCalculado[],
  fatores: { fee_fator: number; comissao_pct: number; imposto_pct: number }
): Rentabilidade {
  const totais = calcularTotaisGerais(grupos)
  const faturamento = totais.total_venda
  const custo_total = totais.total_custo
  const comissao = faturamento * (fatores.comissao_pct / 100)
  const imposto = (faturamento - comissao) * (fatores.imposto_pct / 100)
  const custo_com_fee = custo_total * fatores.fee_fator
  const liquido = faturamento - comissao - imposto - custo_com_fee
  const liquido_pct = faturamento > 0 ? (liquido / faturamento) * 100 : null
  return { faturamento, custo_total, comissao, imposto, custo_com_fee, liquido, liquido_pct }
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run lib/calculos.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 7: Corrigir consumidores para compilar**

Rodar `npx tsc --noEmit` e corrigir cada erro que apontar para código de produção (não-`.test`). As correções esperadas:

- `app/api/obras/[id]/export/route.ts`: as duas chamadas `calcularItem({...})` recebem `margem_mao_obra_pct/margem_material_pct` no objeto literal — trocar por `markup_mao_obra: Number(item.markup_mao_obra), markup_material: Number(item.markup_material)` e adicionar o 2º argumento `feeFator`. Buscar o `fee_fator` da obra no `select` (adicionar `fee_fator, comissao_pct, imposto_pct` ao select de `obras`) e passar `Number(obra.fee_fator)` como 2º argumento. (O layout do export é reescrito na Task 5; aqui só faça compilar.)
- `lib/dashboard/metricas.ts`: `calcularItem({...})` em `calcularObra` — o objeto espalha `...item` (que agora tem markup em vez de margem, pois vem do banco), então só falta o 2º argumento. Como o dashboard não tem o `fee_fator` por item facilmente, passar `1.02` como padrão fixo aqui é aceitável para os KPIs de valor: `calcularItem({ ...campos }, 1.02)`. Adicionar comentário `// fee padrão para KPIs; o valor por obra é aplicado no editor/export`.
- `app/(app)/obras/page.tsx`: `calcularItem({...})` em `calcularTotalVendaObra` — o literal tem `margem_*`; trocar por `markup_mao_obra`/`markup_material` lidos de `item` (adicionar esses campos ao tipo `ObraItem.grupos_orcamento.itens_orcamento` e ao select da API se necessário) e passar `1.02` como 2º argumento (padrão para a lista).
- `components/orcamento/EditorOrcamento.tsx`: `calcularGrupo(g)` → `calcularGrupo(g, feeFator)`. O `feeFator` virá da obra (Task 4 adiciona ao estado; por ora, ler de `obra.fee_fator ?? 1.02`). Adicionar `fee_fator` etc. ao tipo `ObraParaEditor` e ao select da página do editor.

Nota: a página do editor (`app/(app)/obras/[id]/page.tsx`) precisa incluir `fee_fator, comissao_pct, imposto_pct` no `select` de `obras` e `markup_mao_obra, markup_material` nos itens. Verificar e ajustar o select.

- [ ] **Step 8: Rodar suíte e tsc**

Run: `npm run test:run` e `npx tsc --noEmit` (ignorar ruído de `*.test` no tsc).
Expected: suíte verde; nenhum erro de produção no tsc.

- [ ] **Step 9: Commit**

```bash
git add types/ lib/calculos.ts lib/calculos.test.ts "app/api/obras/[id]/export/route.ts" lib/dashboard/metricas.ts "app/(app)/obras/page.tsx" components/orcamento/EditorOrcamento.tsx "app/(app)/obras/[id]/page.tsx"
git commit -m "feat: modelo FEE + markup + rentabilidade em lib/calculos e consumidores"
```

---

### Task 3: Cabeçalho — fatores editáveis + resumo de rentabilidade

**Files:**
- Modify: `components/orcamento/CabecalhoObra.tsx`
- Modify: `components/orcamento/EditorOrcamento.tsx` (passar fatores + rentabilidade)
- Modify: `app/api/obras/[id]/route.ts` (permitir salvar fee_fator/comissao_pct/imposto_pct)

**Interfaces:**
- Consumes: `calcularRentabilidade` (Task 2); `Rentabilidade`.
- Produces: `CabecalhoObra` recebe `fatores` + `onFatorChange(campo, valor)` e `rentabilidade: Rentabilidade`; edição dos 3 fatores persiste via PUT.

- [ ] **Step 1: Permitir os campos no PUT de obra**

Em `app/api/obras/[id]/route.ts`, localizar o array de campos permitidos do PUT (que hoje inclui `codigo, nome, cliente_id, data_orcamento, status`) e acrescentar `'fee_fator', 'comissao_pct', 'imposto_pct'`. Se o handler valida números, garantir que aceita numérico.

- [ ] **Step 2: EditorOrcamento — estado dos fatores e cálculo da rentabilidade**

Em `components/orcamento/EditorOrcamento.tsx`:
- Adicionar estado: `const [fatores, setFatores] = useState({ fee_fator: obra.fee_fator ?? 1.02, comissao_pct: obra.comissao_pct ?? 12, imposto_pct: obra.imposto_pct ?? 30 })`.
- `const feeFator = fatores.fee_fator`.
- `const gruposCalculados = grupos.map(g => calcularGrupo(g, feeFator))`.
- `const rentabilidade = calcularRentabilidade(gruposCalculados, fatores)` (importar `calcularRentabilidade`).
- Handler `async function salvarFator(campo, valor)`: `setFatores(p => ({...p, [campo]: valor}))` e `fetch PUT /api/obras/${obra.id}` com `{ [campo]: valor }`.
- Passar ao `<CabecalhoObra>`: `fatores={fatores}`, `onFatorChange={salvarFator}`, `rentabilidade={rentabilidade}`.

- [ ] **Step 3: CabecalhoObra — campos de fator + painel de rentabilidade**

Em `components/orcamento/CabecalhoObra.tsx`, estender `Props` com:
```typescript
  fatores: { fee_fator: number; comissao_pct: number; imposto_pct: number }
  onFatorChange: (campo: 'fee_fator' | 'comissao_pct' | 'imposto_pct', valor: number) => void
  rentabilidade: import('@/types/orcamento').Rentabilidade
```
Adicionar, abaixo do grid atual, três inputs numéricos (FEE, Comissão %, Imposto %) que no `onBlur` chamam `onFatorChange(campo, parseFloat(valor) || 0)`, e um painel de resumo somente-leitura mostrando (usar `fmt` de `@/lib/format`): Faturamento `R$ {fmt(rentabilidade.faturamento)}`, Comissão, Imposto, Custo `R$ {fmt(rentabilidade.custo_com_fee)}`, **Líquido** `R$ {fmt(rentabilidade.liquido)}`, **Líquido %** `{rentabilidade.liquido_pct === null ? '—' : fmtPct(rentabilidade.liquido_pct)}`. Usar classes de tema (`bg-card`, `text-muted-foreground`, verde para líquido positivo: `text-green-600 dark:text-green-400`).

- [ ] **Step 4: Verificação manual + suíte**

Run: `npm run test:run` (verde). Verificação visual delegada ao controller: abrir uma obra, editar FEE/Comissão/Imposto e ver o líquido recalcular.

- [ ] **Step 5: Commit**

```bash
git add components/orcamento/CabecalhoObra.tsx components/orcamento/EditorOrcamento.tsx "app/api/obras/[id]/route.ts"
git commit -m "feat: fatores editaveis (fee/comissao/imposto) e resumo de rentabilidade no cabecalho"
```

---

### Task 4: Tabela — colunas de markup e nomenclatura da planilha

**Files:**
- Modify: `components/orcamento/TabelaOrcamento.tsx`
- Test: `components/orcamento/TabelaOrcamento.test.tsx` (ajustar/estender)

**Interfaces:**
- Consumes: `ItemCalculado` com `fee_unit_*`, `preco_unit_*_venda`, `markup_*`.
- Produces: visão técnica com colunas editáveis de markup e colunas calculadas de FEE/$; nomenclatura da planilha.

- [ ] **Step 1: Ajustar a visão técnica**

Em `components/orcamento/TabelaOrcamento.tsx`, na visão técnica, substituir as colunas de margem (`Mg. MO%`, `Mg. Mat%`) por:
- Cabeçalhos (usar exatamente): `M. OBRA` (custo), `MAT` (custo), `FEE M.OBRA`, `$ M.OBRA`, `FEE MAT`, `$ MAT`, `SUB TOTAL M.OBRA`, `SUB TOTAL MAT`, `TOTAL`.
- Célula **Markup M.Obra**: `CelulaEditavel` numérica salvando `markup_mao_obra` (`onUpdateItem(grupo.id, item.id, 'markup_mao_obra', parseFloat(v) || 1)`).
- Célula **Markup Mat.**: idem `markup_material`.
- Células calculadas (somente leitura, `fmt`): `fee_unit_mao_obra`, `preco_unit_mao_obra_venda`, `fee_unit_material`, `preco_unit_material_venda`, `subtotal_mao_obra_venda`, `subtotal_material_venda`, `total_venda`.
- Ajustar `colsTecnica`/`colSpan` da linha "+ Adicionar item" para o novo número de colunas.
- Cabeçalhos de disciplina e o `tfoot` (TOTAL GERAL) somam custo e venda como hoje (usar `totais.total_custo` e `totais.total_venda`).

- [ ] **Step 2: Ajustar/estender o teste da tabela**

Em `components/orcamento/TabelaOrcamento.test.tsx`, se algum caso referenciava margem, trocar por markup. Adicionar um teste de que a célula de Markup M.Obra chama `onUpdateItem` com `'markup_mao_obra'` ao editar (duplo clique → digitar → blur). Manter os testes existentes passando.

- [ ] **Step 3: Rodar suíte + tsc**

Run: `npx vitest run components/orcamento/TabelaOrcamento.test.tsx` e `npm run test:run` (verde); `npx tsc --noEmit` sem erro de produção.

- [ ] **Step 4: Commit**

```bash
git add components/orcamento/TabelaOrcamento.tsx components/orcamento/TabelaOrcamento.test.tsx
git commit -m "feat: colunas de markup e FEE/$ com a nomenclatura da planilha"
```

---

### Task 5: Export Técnico no layout da planilha

**Files:**
- Modify: `app/api/obras/[id]/export/route.ts`

**Interfaces:**
- Consumes: `calcularItem(item, feeFator)`, `calcularRentabilidade`.
- Produces: Excel técnico com o layout de dois blocos + resumo; comercial só com venda.

- [ ] **Step 1: Reescrever o export técnico**

No `select` de `obras`, incluir `fee_fator, comissao_pct, imposto_pct` e o endereço/cnpj do cliente (`clientes (razao_social, endereco, cnpj)`). Montar a planilha técnica com estas colunas na ordem (headers exatos):
`ITEM | Nº | DESCRIÇÃO | DISCIPLINA | LOCAL | UN. | QT. | M. OBRA | MAT | SUB TOTAL M.OBRA | SUB TOTAL MAT | TOTAL | FEE M.OBRA | $ M.OBRA | FEE MAT | $ MAT | UN. | QT. | $ M.OBRA | $ MAT | SUB TOTAL M.OBRA | SUB TOTAL MAT | TOTAL | OBS.`

Linhas de cabeçalho (rows 1-5): `DESCRITIVO TÉCNICO E COMERCIAL`; razão social; `ENDEREÇO: ` + endereço; `CNPJ: ` + cnpj; `codigo + ' ' + nome`. Para cada disciplina, uma linha com a letra + nome (colunas de valor com os subtotais do grupo). Para cada item, uma linha com: letra, número, descrição, disciplina, local, un, qt, `custo_unit_mao_obra`, `custo_unit_material`, `subtotal_mao_obra_custo`, `subtotal_material_custo`, `total_custo`, `fee_unit_mao_obra`, `preco_unit_mao_obra_venda`, `fee_unit_material`, `preco_unit_material_venda`, un, qt, `preco_unit_mao_obra_venda`, `preco_unit_material_venda`, `subtotal_mao_obra_venda`, `subtotal_material_venda`, `total_venda`, obs. Ao final: linha de TOTAL GERAL (custo e venda) e um bloco de resumo com Comissão, Imposto, Custo (com fee) e **Líquido**/**Líquido %** usando `calcularRentabilidade`. Formato monetário `#,##0.00`. Todos os valores são calculados via `calcularItem(..., Number(obra.fee_fator))` — nenhuma fórmula duplicada.

- [ ] **Step 2: Ajustar o export comercial**

Manter apenas: ITEM, Nº, DESCRIÇÃO, LOCAL, UN., QT., `$ M.OBRA`, `$ MAT`, `SUB TOTAL M.OBRA`, `SUB TOTAL MAT`, TOTAL — todos de venda, sem custo/FEE/markup.

- [ ] **Step 3: Verificação**

Run: `npx tsc --noEmit` (sem erro de produção). Verificação funcional (download e conferência do arquivo) delegada ao controller/usuário — a matemática já é coberta pelos testes de `calculos`.

- [ ] **Step 4: Commit**

```bash
git add "app/api/obras/[id]/export/route.ts"
git commit -m "feat: export tecnico no layout da planilha da empresa"
```

---

### Task 6: Import — parser no formato real + derivação de markup (TDD)

**Files:**
- Modify: `lib/excel/parse-obra.ts`
- Test: `lib/excel/parse-obra.test.ts` (reescrito)

**Interfaces:**
- Produces:
  - `ItemImportado` passa a ter `markup_mao_obra: number; markup_material: number` (em vez de `margem_*`).
  - `parsePlanilhaObra(linhas)` deriva markup de `$ ÷ FEE`.
  - `parseCabecalhoObra(linhas): { codigo: string | null; nome: string | null; cliente: string | null; endereco: string | null; cnpj: string | null }`.

- [ ] **Step 1: Reescrever `lib/excel/parse-obra.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { parsePlanilhaObra, parseCabecalhoObra } from './parse-obra'

// Layout real (colunas do bloco custo/fee): ITEM Nº DESCRIÇÃO DISCIPLINA LOCAL UN. QT.
// M.OBRA MAT SUBTOT-MO SUBTOT-MAT TOTAL FEE-M.OBRA $-M.OBRA FEE-MAT $-MAT ...
const cab = [
  ['', '', 'DESCRITIVO TÉCNICO E COMERCIAL'],
  ['', '', 'MAGALU - PAULISTA'],
  ['', '', 'ENDEREÇO: ALAMEDA SANTOS, 2153'],
  ['', '', 'CNPJ: 12.345.678/0001-00'],
  ['', '', '08092.01 MAGALU - DEPOSITO'],
]
const header = ['ITEM','Nº','DESCRIÇÃO','DISCIPLINA','LOCAL','UN.','QT.','M. OBRA','MAT','SUB TOTAL','SUB TOTAL','TOTAL','FEE M.OBRA','$ M.OBRA','FEE MAT','$ MAT']
const grupo = ['A','','SERVIÇOS PRELIMINÁRES']
// custo MO=200 MAT=100 fee=1.02 → fee-mo=204 $mo=510 (markup 2.5); fee-mat=102 $mat=204 (markup 2)
const item = ['A',1,'PROTEÇÃO','SERVIÇOS PRELIMINÁRES','GERAL','VB',1, 200,100, 200,100,300, 204,510, 102,204]

describe('parsePlanilhaObra (formato real, deriva markup)', () => {
  it('lê custo e deriva markup de $ ÷ FEE', () => {
    const r = parsePlanilhaObra([...cab, header, grupo, item])
    expect(r).toHaveLength(1)
    expect(r[0].disciplina).toBe('SERVIÇOS PRELIMINÁRES')
    const it = r[0].itens[0]
    expect(it.custo_unit_mao_obra).toBe(200)
    expect(it.custo_unit_material).toBe(100)
    expect(it.markup_mao_obra).toBeCloseTo(2.5)   // 510/204
    expect(it.markup_material).toBeCloseTo(2)      // 204/102
  })

  it('markup = 1 quando FEE é zero/ausente', () => {
    const item0 = ['A',1,'X','D','L','UN',1, 0,0, 0,0,0, 0,0, 0,0]
    const r = parsePlanilhaObra([...cab, header, grupo, item0])
    expect(r[0].itens[0].markup_mao_obra).toBe(1)
    expect(r[0].itens[0].markup_material).toBe(1)
  })
})

describe('parseCabecalhoObra (formato real)', () => {
  it('extrai codigo, nome, cliente, endereco e cnpj', () => {
    expect(parseCabecalhoObra([...cab, header])).toEqual({
      codigo: '08092.01',
      nome: 'MAGALU - DEPOSITO',
      cliente: 'MAGALU - PAULISTA',
      endereco: 'ALAMEDA SANTOS, 2153',
      cnpj: '12.345.678/0001-00',
    })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/excel/parse-obra.test.ts`
Expected: FAIL (markup não existe; `parseCabecalhoObra` não existe).

- [ ] **Step 3: Reescrever `lib/excel/parse-obra.ts`**

- Em `ItemImportado`, trocar `margem_mao_obra_pct/margem_material_pct` por `markup_mao_obra: number; markup_material: number`.
- Adicionar ao `Campo` e ao `MAPA_COLUNAS` as colunas do bloco de venda/fee: `'fee m obra' | 'fee mo'` → `'fee_mao_obra'`, `'$ m obra' | '$ mo' | 'preco m obra'` → `'venda_mao_obra'`, `'fee mat'` → `'fee_material'`, `'$ mat' | 'preco mat'` → `'venda_material'`. (Normalização já remove `.`, acentos e `$` deve virar token: ajustar `normalizar` para manter `$`? Melhor: mapear headers por conterem "fee" + "obra"/"mat" e "$"/"preco" + "obra"/"mat".) Implementar detecção robusta: para cada coluna do header, classificar por regex sobre o texto normalizado (`/fee.*(obra|mo)/`, `/(\$|preco|venda).*(obra|mo)/`, `/fee.*mat/`, `/(\$|preco|venda).*mat/`).
- No item, ler `custo_unit_mao_obra` (M. OBRA do bloco custo), `custo_unit_material` (MAT), `feeMO` (FEE M.OBRA), `vendaMO` ($ M.OBRA), `feeMAT`, `vendaMAT`. Derivar `markup_mao_obra = feeMO > 0 ? vendaMO / feeMO : 1`, `markup_material = feeMAT > 0 ? vendaMAT / feeMAT : 1`.
- Distinção grupo vs item permanece (Nº vazio → disciplina; Nº ou QT numérico → item).
- Adicionar `parseCabecalhoObra`: varrer as primeiras ~8 linhas; código+nome da linha que casa `/^\s*[\w.]+\s+\S/` logo após "DESCRITIVO"/na 5ª linha do cabeçalho (`08092.01 MAGALU - DEPOSITO` → split no primeiro espaço: codigo=primeira palavra, nome=resto); cliente = a linha de razão social (2ª); endereço = após `ENDEREÇO:`; cnpj = após `CNPJ:`. Retornar nulos quando não encontrados.

Nota: como distinguir a linha de código/nome (5ª) da razão social (2ª): a linha de código começa com um token tipo código (`/^[\dA-Za-z][\d.\-\/]*\s/`) e a razão social é a 2ª linha não vazia após o título. Implementar: cliente = 2ª linha de texto; codigo/nome = primeira linha cujo primeiro token casa `/^[\d][\d.]*/` (começa com dígito) — `08092.01`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/excel/parse-obra.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/excel/parse-obra.ts lib/excel/parse-obra.test.ts
git commit -m "feat: parser de planilha no formato real com derivacao de markup"
```

---

### Task 7: Rotas de import + botões (criar obra e importar conteúdo)

**Files:**
- Create: `lib/excel/importar-obra.ts` (helper compartilhado)
- Modify: `app/api/obras/[id]/import/route.ts` (usar helper + markup)
- Create: `app/api/obras/import/route.ts` (cria obra a partir da planilha)
- Modify: `app/(app)/obras/page.tsx` (botão "Importar planilha")
- Modify: `components/orcamento/EditorOrcamento.tsx` (botão import no topo, se ainda não existir)

**Interfaces:**
- Consumes: `parsePlanilhaObra`, `parseCabecalhoObra` (Task 6).
- Produces: `inserirConteudoObra(supabase, obra_id, disciplinas)` insere disciplinas/grupos/itens com `markup_*`; `POST /api/obras/import` cria a obra e retorna `{ id }`.

- [ ] **Step 1: Criar `lib/excel/importar-obra.ts`**

Helper que recebe `supabase` (tipo `import('@supabase/supabase-js').SupabaseClient`), `obra_id` e `DisciplinaImportada[]`. Para cada disciplina: find-or-create em `disciplinas` (por nome, `ilike`), reutiliza ou cria o grupo da obra (letra/ordem sequencial), e insere os itens com `markup_mao_obra`/`markup_material` (do parser), resolvendo `unidade_id` por sigla (`unidadePorSigla`). Retorna `{ disciplinas: number; itens: number }`. Lança `Error` em falha (o chamador converte em 500).

- [ ] **Step 2: Refatorar `app/api/obras/[id]/import/route.ts`**

Substituir o loop inline pela chamada `await inserirConteudoObra(supabase, obra_id, disciplinasImportadas)` (try/catch → 500). Manter o retorno com `grupos` recarregados (`select('*, disciplinas(*), itens_orcamento(*, unidades_medida(*))')`).

- [ ] **Step 3: Criar `app/api/obras/import/route.ts`**

`POST`: auth; lê o arquivo; `parseCabecalhoObra` → se sem código/nome, 400 "Use uma planilha exportada pelo sistema"; find-or-create cliente por `razao_social` (grava também `endereco`, `cnpj` se novo); cria a obra (`codigo, nome, cliente_id, criado_por`); `parsePlanilhaObra` + `inserirConteudoObra`; retorna `{ id: obra.id, disciplinas, itens }` (201).

- [ ] **Step 4: Botão na lista de obras**

Em `app/(app)/obras/page.tsx`, ao lado de "+ Nova obra", adicionar botão "↑ Importar planilha" + `<input type="file" hidden>`; no `onChange`, `POST /api/obras/import` (FormData) e, no sucesso, `router.push('/obras/' + data.id)`. Estado `importando` para desabilitar o botão.

- [ ] **Step 5: Verificação**

Run: `npm run test:run` (verde), `npx tsc --noEmit` (sem erro de produção). Teste funcional de upload delegado ao controller/usuário (exige sessão).

- [ ] **Step 6: Commit**

```bash
git add lib/excel/importar-obra.ts "app/api/obras/[id]/import/route.ts" "app/api/obras/import/" "app/(app)/obras/page.tsx" components/orcamento/EditorOrcamento.tsx
git commit -m "feat: criar obra a partir de planilha e importar conteudo com markup"
```

---

### Task 8: Verificação final

**Files:** nenhum novo — verificação (correções pontuais se algo falhar).

- [ ] **Step 1: Suíte + build**

Run: `npm run test:run` (tudo verde) e, com o dev server parado, `npm run build` (exit 0; limpar `.next` se necessário).

- [ ] **Step 2: Percorrer os critérios de aceite** (spec seção 9)

Com o dev server rodando e logado: (1) item com dados da planilha bate os $/subtotais/total; (2) resumo de rentabilidade bate (~12,49% no caso magalu); (3) nomenclatura da planilha na tela; (4) fatores editáveis afetam o resumo; (5) export técnico com layout da planilha, comercial só venda; (6) importar planilha exportada recria a obra com os mesmos números. Corrigir inline o que falhar (commits `fix:`).

- [ ] **Step 3: Encerramento**

Usar superpowers:finishing-a-development-branch para integrar (push para `master`).

---

## Self-review do plano

- **Cobertura da spec:** migration+tipos (T1,T2), cálculo FEE/markup/rentabilidade (T2), cabeçalho+fatores+resumo (T3), tabela+markup+nomenclatura (T4), export (T5), parser+markup+cabeçalho (T6), rotas+botões de import (T7), aceite (T8). Todas as seções 2–9 da spec têm tarefa.
- **Sem placeholders:** os steps de código-núcleo (migration, calculos, tipos, testes) têm código completo; os steps de UI/export descrevem colunas e chamadas exatas com os nomes verbatim, sem "TBD".
- **Consistência de tipos:** `calcularItem(item, feeFator)`, `calcularRentabilidade(grupos, fatores)`, `Rentabilidade`, `markup_mao_obra`/`markup_material`, `fee_unit_*` usados com os mesmos nomes em T2–T7. `ItemImportado.markup_*` (T6) alimenta `inserirConteudoObra` (T7).
