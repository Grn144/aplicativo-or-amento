# Comissão/Imposto Manuais + FEE por Item — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir uma divergência de cálculo crítica encontrada por investigação sistemática (comparação célula a célula com duas planilhas reais da empresa): comissão e imposto não são percentuais calculados sobre o faturamento — são valores em R$ digitados manualmente por proposta; e o fator de FEE pode ser sobrescrito por item (alguns itens não levam FEE), não é sempre o valor único da obra.

**Architecture:** `lib/calculos.ts` continua sendo a fonte única de cálculo. `calcularItem` passa a resolver o FEE efetivo por item (`item.fee_mao_obra ?? feeFatorObra`, idem material) antes de aplicar. `calcularRentabilidade` para de computar comissão/imposto como percentual — passa a recebê-los prontos (`comissao_valor`/`imposto_valor`) e só monta a subtração final. A mudança de tipo (`comissao_pct`→`comissao_valor`, `imposto_pct`→`imposto_valor`) quebra todos os consumidores ao mesmo tempo, então a Task 2 troca tipos+cálculo+API+UI num único passo para manter o build verde (mesmo padrão já usado na Fase 5 deste projeto).

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Supabase (PostgreSQL), Vitest.

**Spec/Evidência:** investigação registrada nesta conversa — comparação célula a célula de `08092.01 magalu - deposito.xlsx` e `07982 sp check-up - mykonos.xlsx` (arquivos reais fora do repo) contra `lib/calculos.ts`. Achados:
- Nível de item (custo/FEE/markup/venda/subtotal/total): bate 100% com a planilha — não mexer nessa parte.
- `comissao` (célula Z8/AA8 nas duas planilhas): valor fixo digitado, não fórmula.
- `imposto` (célula Z9/AA9): fórmula, mas **inconsistente entre as duas planilhas reais** (uma subtrai um campo que não existe no sistema, a outra não subtrai nada) — decisão do usuário: tratar como valor fixo digitado também, eliminando a ambiguidade.
- `custo_com_fee` = `custo_total × fee_fator`: bate nas duas planilhas — não mexer.
- FEE da mão de obra varia por item em pelo menos 3 itens de uma das planilhas (valor 1 em vez de 1.02) — decisão do usuário: adicionar override de FEE por item.

## Global Constraints

- Todo texto de UI em português brasileiro.
- TypeScript strict; alias `@/*`.
- **Nenhuma fórmula duplicada** — cálculo monetário só em `lib/calculos.ts`.
- Commits em português no padrão `feat:`/`fix:`/`test:`.
- Migrations executadas manualmente: colar o SQL no painel Supabase → SQL Editor.
- Testes automatizados só para funções puras em `lib/*` (padrão já estabelecido). Rotas de API e páginas: verificação manual/leitura cuidadosa.
- Rodar testes com `npm run test:run`.

---

### Task 1: Migration — comissão/imposto viram valores fixos + FEE por item

**Files:**
- Create: `supabase/migrations/008_comissao_imposto_fee_manual.sql`

**Interfaces:**
- Produces: `obras.comissao_valor`, `obras.imposto_valor` (numeric(15,4), substituem `comissao_pct`/`imposto_pct`); `itens_orcamento.fee_mao_obra`, `itens_orcamento.fee_material` (numeric(8,4), nullable — NULL significa "usa o fee_fator da obra").

- [ ] **Step 1: Criar `supabase/migrations/008_comissao_imposto_fee_manual.sql`**

```sql
-- 008_comissao_imposto_fee_manual.sql
-- Comissão e imposto deixam de ser percentuais calculados sobre o faturamento
-- e passam a ser valores em R$ digitados manualmente por proposta — é assim
-- que as planilhas reais da empresa funcionam (valor fixo, não fórmula).
-- FEE passa a poder ser sobrescrito por item (algumas planilhas reais têm
-- itens sem FEE, com fee_mao_obra=1, enquanto o resto da obra usa 1.02).

ALTER TABLE obras RENAME COLUMN comissao_pct TO comissao_valor;
ALTER TABLE obras RENAME COLUMN imposto_pct TO imposto_valor;
ALTER TABLE obras ALTER COLUMN comissao_valor TYPE numeric(15,4);
ALTER TABLE obras ALTER COLUMN imposto_valor TYPE numeric(15,4);
ALTER TABLE obras ALTER COLUMN comissao_valor SET DEFAULT 0;
ALTER TABLE obras ALTER COLUMN imposto_valor SET DEFAULT 0;
-- Os valores existentes eram percentuais (ex.: 12, 30) — não fazem sentido
-- como R$, então zeram para não virar "R$12,00" de comissão por engano.
UPDATE obras SET comissao_valor = 0, imposto_valor = 0;

ALTER TABLE itens_orcamento
  ADD COLUMN fee_mao_obra numeric(8,4),
  ADD COLUMN fee_material numeric(8,4);
```

- [ ] **Step 2: Executar no Supabase**

Colar no SQL Editor do painel Supabase e executar. Esperado: "Success. No rows returned". Conferir em Table Editor: `obras` tem `comissao_valor`/`imposto_valor` (sem `_pct`); `itens_orcamento` tem `fee_mao_obra`/`fee_material` (nullable, sem valor default).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/008_comissao_imposto_fee_manual.sql
git commit -m "feat: migration comissao/imposto manuais + fee por item"
```

---

### Task 2: Núcleo — tipos + cálculo + todos os consumidores (TDD)

**Files:**
- Modify: `types/database.ts`, `lib/calculos.ts`
- Test: `lib/calculos.test.ts` (reescrito)
- Modify (consumidores, mesmo passo para manter o build verde): `app/api/obras/[id]/route.ts`, `app/api/obras/[id]/grupos/[grupoId]/itens/[itemId]/route.ts`, `app/(app)/obras/[id]/page.tsx`, `components/orcamento/CabecalhoObra.tsx`, `components/orcamento/EditorOrcamento.tsx`

**Interfaces:**
- Produces: `calcularItem(item: ItemOrcamento, feeFatorObra: number): ItemCalculado` — `item.fee_mao_obra`/`item.fee_material` (nullable) sobrescrevem `feeFatorObra` quando presentes. `calcularRentabilidade(grupos, fatores: { fee_fator: number; comissao_valor: number; imposto_valor: number }): Rentabilidade` — `comissao`/`imposto` no retorno agora são exatamente `fatores.comissao_valor`/`fatores.imposto_valor` (sem multiplicação por faturamento).

- [ ] **Step 1: Escrever os testes (devem falhar)**

Substituir `lib/calculos.test.ts` por:

```typescript
import { describe, it, expect } from 'vitest'
import { calcularItem, calcularRentabilidade, calcularGrupo } from './calculos'
import type { ItemOrcamento } from '@/types/database'

function item(over: Partial<ItemOrcamento> = {}): ItemOrcamento {
  return {
    id: '', grupo_id: '', numero: 1, descricao: '', local: null,
    unidade_id: null, observacao: null, observacao_2: null, ordem: 1,
    quantidade: 1, custo_unit_mao_obra: 0, custo_unit_material: 0,
    markup_mao_obra: 1, markup_material: 1,
    fee_mao_obra: null, fee_material: null, ...over,
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

  it('fee_mao_obra do item sobrescreve o fee_fator da obra (reproduz exceção real da planilha magalu)', () => {
    const c = calcularItem(item({
      custo_unit_mao_obra: 350, custo_unit_material: 220, quantidade: 1,
      markup_mao_obra: 1.65, markup_material: 1.55,
      fee_mao_obra: 1, // planilha real: item sem FEE na mão de obra
    }), 1.02) // fee_fator da obra continua 1.02
    expect(c.fee_unit_mao_obra).toBeCloseTo(350) // 350*1, não 350*1.02
    expect(c.fee_unit_material).toBeCloseTo(220 * 1.02) // material continua usando o fee da obra
    expect(c.preco_unit_mao_obra_venda).toBeCloseTo(350 * 1.65)
  })

  it('fee_material do item sobrescreve o fee_fator da obra independente do fee_mao_obra', () => {
    const c = calcularItem(item({
      custo_unit_mao_obra: 100, custo_unit_material: 100, quantidade: 1,
      fee_material: 1,
    }), 1.02)
    expect(c.fee_unit_mao_obra).toBeCloseTo(100 * 1.02)
    expect(c.fee_unit_material).toBeCloseTo(100) // 100*1, não 100*1.02
  })

  it('fee_mao_obra/fee_material null (padrão) usa o fee_fator da obra normalmente', () => {
    const c = calcularItem(item({ custo_unit_mao_obra: 100, custo_unit_material: 100, quantidade: 1 }), 1.02)
    expect(c.fee_unit_mao_obra).toBeCloseTo(102)
    expect(c.fee_unit_material).toBeCloseTo(102)
  })
})

describe('calcularRentabilidade (comissão/imposto como valores fixos, não percentuais)', () => {
  it('comissão e imposto são exatamente os valores passados, líquido = faturamento - comissão - imposto - custo com fee', () => {
    const grupo = calcularGrupo({
      id: 'g', obra_id: '', disciplina_id: '', letra: 'A', ordem: 1,
      itens_orcamento: [item({
        quantidade: 1, custo_unit_mao_obra: 200, custo_unit_material: 100,
        markup_mao_obra: 2.5, markup_material: 2,
      })],
    }, 1.02)
    const r = calcularRentabilidade([grupo], { fee_fator: 1.02, comissao_valor: 500, imposto_valor: 1200 })
    expect(r.faturamento).toBeCloseTo(714)
    expect(r.custo_total).toBeCloseTo(300)
    expect(r.comissao).toBe(500)
    expect(r.imposto).toBe(1200)
    expect(r.custo_com_fee).toBeCloseTo(300 * 1.02) // 306
    expect(r.liquido).toBeCloseTo(714 - 500 - 1200 - 306)
    expect(r.liquido_pct).toBeCloseTo(r.liquido / 714 * 100)
  })

  it('comissão e imposto zerados (padrão de obra nova) → líquido = faturamento - custo com fee', () => {
    const grupo = calcularGrupo({
      id: 'g', obra_id: '', disciplina_id: '', letra: 'A', ordem: 1,
      itens_orcamento: [item({ quantidade: 1, custo_unit_mao_obra: 100, markup_mao_obra: 1 })],
    }, 1.02)
    const r = calcularRentabilidade([grupo], { fee_fator: 1.02, comissao_valor: 0, imposto_valor: 0 })
    expect(r.comissao).toBe(0)
    expect(r.imposto).toBe(0)
    expect(r.liquido).toBeCloseTo(r.faturamento - r.custo_com_fee)
  })

  it('faturamento zero → liquido_pct null', () => {
    const r = calcularRentabilidade([], { fee_fator: 1.02, comissao_valor: 0, imposto_valor: 0 })
    expect(r.faturamento).toBe(0)
    expect(r.liquido_pct).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm run test:run -- lib/calculos.test.ts`
Expected: FAIL — `fee_mao_obra`/`fee_material` não existem em `ItemOrcamento`; `calcularRentabilidade` ainda espera `comissao_pct`/`imposto_pct`.

- [ ] **Step 3: `types/database.ts` — renomear campos de Obra, adicionar campos de ItemOrcamento**

Em `types/database.ts`, no `interface Obra`, trocar:

```typescript
  fee_fator: number
  comissao_pct: number
  imposto_pct: number
```

por:

```typescript
  fee_fator: number
  comissao_valor: number
  imposto_valor: number
```

No `interface ItemOrcamento`, trocar:

```typescript
  markup_mao_obra: number
  markup_material: number
  observacao: string | null
```

por:

```typescript
  markup_mao_obra: number
  markup_material: number
  fee_mao_obra: number | null
  fee_material: number | null
  observacao: string | null
```

- [ ] **Step 4: `lib/calculos.ts` — FEE por item + rentabilidade com valores fixos**

Trocar a assinatura e corpo de `calcularItem`:

```typescript
export function calcularItem(item: ItemOrcamento, feeFatorObra: number): ItemCalculado {
  const subtotal_mao_obra_custo = item.custo_unit_mao_obra * item.quantidade
  const subtotal_material_custo = item.custo_unit_material * item.quantidade
  const total_custo = subtotal_mao_obra_custo + subtotal_material_custo

  const feeMaoObra = item.fee_mao_obra ?? feeFatorObra
  const feeMaterial = item.fee_material ?? feeFatorObra
  const fee_unit_mao_obra = item.custo_unit_mao_obra * feeMaoObra
  const fee_unit_material = item.custo_unit_material * feeMaterial
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
```

(único trecho alterado: a introdução de `feeMaoObra`/`feeMaterial` resolvendo o override antes de calcular `fee_unit_*`; o parâmetro é renomeado de `feeFator` para `feeFatorObra` para deixar explícito que é o fallback da obra, não o valor sempre usado — atualizar as duas outras funções que chamam `calcularItem`/repassam esse parâmetro, `calcularGrupo`, mantendo o nome do parâmetro consistente.)

Em `calcularGrupo`, trocar a assinatura do segundo parâmetro de `feeFator: number` para `feeFatorObra: number` e repassar para `calcularItem(it, feeFatorObra)` (mesmo comportamento, só o nome do parâmetro muda para consistência).

Trocar `calcularRentabilidade`:

```typescript
export function calcularRentabilidade(
  grupos: GrupoCalculado[],
  fatores: { fee_fator: number; comissao_valor: number; imposto_valor: number }
): Rentabilidade {
  const totais = calcularTotaisGerais(grupos)
  const faturamento = totais.total_venda
  const custo_total = totais.total_custo
  const comissao = fatores.comissao_valor
  const imposto = fatores.imposto_valor
  const custo_com_fee = custo_total * fatores.fee_fator
  const liquido = faturamento - comissao - imposto - custo_com_fee
  const liquido_pct = faturamento > 0 ? (liquido / faturamento) * 100 : null
  return { faturamento, custo_total, comissao, imposto, custo_com_fee, liquido, liquido_pct }
}
```

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `npm run test:run -- lib/calculos.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 6: `app/api/obras/[id]/route.ts` — renomear campos no allow-list do PUT**

Trocar:

```typescript
  const campos = ['codigo', 'nome', 'cliente_id', 'data_orcamento', 'status', 'fee_fator', 'comissao_pct', 'imposto_pct'] as const
```

por:

```typescript
  const campos = ['codigo', 'nome', 'cliente_id', 'data_orcamento', 'status', 'fee_fator', 'comissao_valor', 'imposto_valor'] as const
```

- [ ] **Step 7: `app/api/obras/[id]/grupos/[grupoId]/itens/[itemId]/route.ts` — adicionar FEE por item ao allow-list**

Trocar:

```typescript
  const campos = [
    'descricao', 'local', 'unidade_id', 'quantidade',
    'custo_unit_mao_obra', 'custo_unit_material',
    'markup_mao_obra', 'markup_material',
    'observacao', 'observacao_2',
  ] as const
```

por:

```typescript
  const campos = [
    'descricao', 'local', 'unidade_id', 'quantidade',
    'custo_unit_mao_obra', 'custo_unit_material',
    'markup_mao_obra', 'markup_material',
    'fee_mao_obra', 'fee_material',
    'observacao', 'observacao_2',
  ] as const
```

- [ ] **Step 8: `app/(app)/obras/[id]/page.tsx` — select e tipo inline**

No `select` da query de `obras`, trocar:

```typescript
        fee_fator, comissao_pct, imposto_pct,
```

por:

```typescript
        fee_fator, comissao_valor, imposto_valor,
```

No `select` de `itens_orcamento` dentro da mesma query, trocar:

```typescript
            quantidade, custo_unit_mao_obra, custo_unit_material,
            markup_mao_obra, markup_material,
            observacao, observacao_2, ordem,
```

por:

```typescript
            quantidade, custo_unit_mao_obra, custo_unit_material,
            markup_mao_obra, markup_material,
            fee_mao_obra, fee_material,
            observacao, observacao_2, ordem,
```

No `type ObraCompleta`, trocar:

```typescript
  fee_fator: number
  comissao_pct: number
  imposto_pct: number
```

por:

```typescript
  fee_fator: number
  comissao_valor: number
  imposto_valor: number
```

E dentro do tipo inline de `itens_orcamento`, trocar:

```typescript
      markup_mao_obra: number
      markup_material: number
      observacao: string | null
```

por:

```typescript
      markup_mao_obra: number
      markup_material: number
      fee_mao_obra: number | null
      fee_material: number | null
      observacao: string | null
```

- [ ] **Step 9: `components/orcamento/CabecalhoObra.tsx` — renomear fatores e relabelar para R$**

Trocar a prop `fatores` na interface `Props`:

```typescript
  fatores: { fee_fator: number; comissao_pct: number; imposto_pct: number }
  onFatorChange: (campo: 'fee_fator' | 'comissao_pct' | 'imposto_pct', valor: number) => void
```

por:

```typescript
  fatores: { fee_fator: number; comissao_valor: number; imposto_valor: number }
  onFatorChange: (campo: 'fee_fator' | 'comissao_valor' | 'imposto_valor', valor: number) => void
```

No estado inicial `fatoresTexto`, trocar:

```typescript
  const [fatoresTexto, setFatoresTexto] = useState({
    fee_fator: String(fatores.fee_fator),
    comissao_pct: String(fatores.comissao_pct),
    imposto_pct: String(fatores.imposto_pct),
  })
```

por:

```typescript
  const [fatoresTexto, setFatoresTexto] = useState({
    fee_fator: String(fatores.fee_fator),
    comissao_valor: String(fatores.comissao_valor),
    imposto_valor: String(fatores.imposto_valor),
  })
```

Nos dois blocos JSX de "Comissão %" e "Imposto %" (dentro do `<div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4...">`), trocar:

```tsx
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Comissão %</Label>
          <Input
            type="number"
            step="0.01"
            value={fatoresTexto.comissao_pct}
            onChange={e => setFatoresTexto(p => ({ ...p, comissao_pct: e.target.value }))}
            onBlur={() => onFatorChange('comissao_pct', parseFloat(fatoresTexto.comissao_pct) || 0)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Imposto %</Label>
          <Input
            type="number"
            step="0.01"
            value={fatoresTexto.imposto_pct}
            onChange={e => setFatoresTexto(p => ({ ...p, imposto_pct: e.target.value }))}
            onBlur={() => onFatorChange('imposto_pct', parseFloat(fatoresTexto.imposto_pct) || 0)}
          />
        </div>
```

por:

```tsx
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Comissão (R$)</Label>
          <Input
            type="number"
            step="0.01"
            value={fatoresTexto.comissao_valor}
            onChange={e => setFatoresTexto(p => ({ ...p, comissao_valor: e.target.value }))}
            onBlur={() => onFatorChange('comissao_valor', parseFloat(fatoresTexto.comissao_valor) || 0)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Imposto (R$)</Label>
          <Input
            type="number"
            step="0.01"
            value={fatoresTexto.imposto_valor}
            onChange={e => setFatoresTexto(p => ({ ...p, imposto_valor: e.target.value }))}
            onBlur={() => onFatorChange('imposto_valor', parseFloat(fatoresTexto.imposto_valor) || 0)}
          />
        </div>
```

- [ ] **Step 10: `components/orcamento/EditorOrcamento.tsx` — renomear fatores, tipo, e ObraParaEditor**

Trocar em `type ObraParaEditor`:

```typescript
  fee_fator?: number
  comissao_pct?: number
  imposto_pct?: number
```

por:

```typescript
  fee_fator?: number
  comissao_valor?: number
  imposto_valor?: number
```

Trocar o estado `fatores`:

```typescript
  const [fatores, setFatores] = useState({
    fee_fator: obra.fee_fator ?? 1.02,
    comissao_pct: obra.comissao_pct ?? 12,
    imposto_pct: obra.imposto_pct ?? 30,
  })
```

por:

```typescript
  const [fatores, setFatores] = useState({
    fee_fator: obra.fee_fator ?? 1.02,
    comissao_valor: obra.comissao_valor ?? 0,
    imposto_valor: obra.imposto_valor ?? 0,
  })
```

Trocar a assinatura de `salvarFator`:

```typescript
  async function salvarFator(campo: 'fee_fator' | 'comissao_pct' | 'imposto_pct', valor: number) {
```

por:

```typescript
  async function salvarFator(campo: 'fee_fator' | 'comissao_valor' | 'imposto_valor', valor: number) {
```

- [ ] **Step 11: Rodar a suíte completa e o typecheck**

Run: `npm run test:run`
Expected: todos os testes passando (verificar contagem final no report — deve ser a contagem anterior menos 2 do rentabilidade antigo mais 6 do rentabilidade/fee novo).

Run: `npx tsc --noEmit`
Expected: nenhum erro novo nos arquivos tocados por esta task (os erros pré-existentes em `*.test.tsx` de auth não são desta task).

- [ ] **Step 12: Commit**

```bash
git add types/database.ts lib/calculos.ts lib/calculos.test.ts app/api/obras/route.ts "app/api/obras/[id]/route.ts" "app/api/obras/[id]/grupos/[grupoId]/itens/[itemId]/route.ts" "app/(app)/obras/[id]/page.tsx" components/orcamento/CabecalhoObra.tsx components/orcamento/EditorOrcamento.tsx
git commit -m "fix: comissao e imposto viram valores fixos em R\$, fee sobreponível por item"
```

(nota: usar o `git add` apenas com os arquivos realmente modificados nesta task — não incluir `app/api/obras/route.ts` se ele não foi tocado; conferir com `git status` antes do commit.)

---

### Task 3: UI — override de FEE por item na Tabela de Orçamento

**Files:**
- Modify: `components/orcamento/TabelaOrcamento.tsx`

**Interfaces:**
- Consumes: `onUpdateItem(grupoId, itemId, 'fee_mao_obra' | 'fee_material', number | null)` — já suportado pela rota de API (Task 2, Step 7) e por `atualizarItem` em `EditorOrcamento.tsx` (função genérica por `campo: string`, não precisa mudar).

- [ ] **Step 1: Permitir valor nulo em `CelulaEditavel`**

Em `components/orcamento/TabelaOrcamento.tsx`, trocar a assinatura de `CelulaEditavel`:

```typescript
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
```

por:

```typescript
function CelulaEditavel({
  valor,
  tipo,
  className,
  onSave,
}: {
  valor: string | number | null
  tipo: 'text' | 'number'
  className?: string
  onSave: (v: string) => void
}) {
```

Trocar a função `abrir`:

```typescript
  function abrir() {
    setDraft(String(valor))
    canceladoRef.current = false
    setEditando(true)
  }
```

por:

```typescript
  function abrir() {
    setDraft(valor === null ? '' : String(valor))
    canceladoRef.current = false
    setEditando(true)
  }
```

Trocar a linha de exibição (fora do modo de edição):

```typescript
      {tipo === 'number' ? fmt(Number(valor)) : String(valor || '—')}
```

por:

```typescript
      {tipo === 'number'
        ? (valor === null || valor === '' ? '—' : fmt(Number(valor)))
        : String(valor || '—')}
```

- [ ] **Step 2: Adicionar as duas colunas de override de FEE na visão técnica**

No cabeçalho da tabela (visão técnica), logo depois de `<th ...>Markup Mat.</th>`, adicionar:

```tsx
              <th className="px-2 py-2 text-right font-medium border-b border-border w-20">Fator FEE M.O.</th>
              <th className="px-2 py-2 text-right font-medium border-b border-border w-20">Fator FEE Mat.</th>
```

No corpo da tabela (visão técnica), logo depois da célula editável de `markup_material` (antes da célula que exibe `{fmt(item.fee_unit_mao_obra)}`), adicionar:

```tsx
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
```

Atualizar `colsTecnica` de `20` para `22` (duas colunas novas):

```typescript
  const colsTecnica = 22
```

Atualizar o `<tfoot>` da visão técnica: a linha de totais usa `colSpan={8}` seguido de uma célula de custo e depois `colSpan={6}` — as duas novas colunas de FEE ficam dentro desse trecho sem total (mesma posição relativa das colunas de markup, que já não têm total na linha de rodapé). Conferir visualmente que o rodapé não desalinha (o `colSpan` do bloco vazio antes das colunas de venda precisa crescer de `6` para `8` para compensar as duas colunas novas):

```tsx
              <td className="px-2 py-2 text-right font-mono">{fmt(totais.total_custo)}</td>
              <td colSpan={6} />
```

vira:

```tsx
              <td className="px-2 py-2 text-right font-mono">{fmt(totais.total_custo)}</td>
              <td colSpan={8} />
```

E na linha do cabeçalho do grupo (`<tr className="bg-muted/50 font-semibold ...">`), o mesmo ajuste — `<td colSpan={6} className="border-b border-border" />` logo após a célula de `total_custo` do grupo vira `<td colSpan={8} className="border-b border-border" />`.

- [ ] **Step 3: Verificação manual**

Não há teste automatizado para componentes de página neste projeto (padrão estabelecido) — este componente específico (`TabelaOrcamento`) tampouco tem teste hoje. Ler o arquivo modificado com atenção para confirmar: as duas novas colunas aparecem no cabeçalho e no corpo na posição certa; `colSpan` dos rodapés/cabeçalhos de grupo foram ajustados corretamente (contar célula por célula); duplo clique numa célula de FEE vazia mostra input vazio (não "0" nem "null"); salvar com campo vazio envia `null` (herda o fee_fator da obra); salvar com número envia o override.

Se possível, rodar `npm run dev`, abrir uma obra, e testar: deixar uma célula de FEE em branco (deve continuar usando o fee_fator da obra no cálculo de `fee_unit_mao_obra` exibido), depois digitar `1` nela e confirmar que a coluna "FEE M.OBRA" (valor calculado, já existente) passa a refletir `custo × 1` em vez de `custo × fee_fator_da_obra`.

- [ ] **Step 4: Commit**

```bash
git add components/orcamento/TabelaOrcamento.tsx
git commit -m "feat: permitir sobrescrever o fator de FEE por item na tabela de orcamento"
```

---

## Self-Review

**Cobertura da spec:**
- Comissão/imposto viram valores fixos digitados → Task 1 (schema) + Task 2 (cálculo + UI de edição, reaproveitando os inputs já existentes em `CabecalhoObra.tsx`, só relabelados). ✅
- FEE sobrescrevível por item → Task 1 (schema) + Task 2 (`calcularItem`) + Task 3 (UI de edição). ✅
- Nível de item (custo/FEE/markup/venda) permanece batendo com a planilha → nenhuma mudança nessa parte do `calcularItem`, apenas a resolução do FEE efetivo antes de usá-lo — comportamento idêntico ao atual quando `fee_mao_obra`/`fee_material` são `null`. ✅

**Placeholders:** nenhum. Todo código de UI/API/cálculo está completo no texto acima; o único ponto que pede atenção manual do implementador (não um placeholder, uma instrução de verificação) é conferir os `colSpan` do rodapé célula por célula, porque um erro de contagem ali não quebra o build mas desalinha a tabela visualmente.

**Consistência de tipos:** `fee_mao_obra`/`fee_material: number | null` (Task 2, `types/database.ts`) é o mesmo par de nomes usado em `lib/calculos.ts` (Task 2), na rota de API (Task 2) e nas colunas novas de `TabelaOrcamento.tsx` (Task 3) — nenhuma variação de nome entre as tasks.
