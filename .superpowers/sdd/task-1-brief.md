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

