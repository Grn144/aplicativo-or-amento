# Assistente Inteligente — Fase 1: Análise contínua do orçamento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar 5 alertas não-bloqueantes por item de orçamento (duplicado, valor fora do padrão, markup fora da faixa, quantidade inconsistente, unidade divergente), reaproveitando o histórico de uso das composições entre todos os orçamentos.

**Architecture:** Lógica pura e testável em `lib/orcamento/alertas.ts` (mesmo padrão de `lib/composicoes/calculos.ts`), dividida em duas funções: `calcularEstatisticasHistoricas` (agrega custo/markup/quantidade médios por `composicao_id` a partir de linhas cruas de `itens_orcamento`) e `calcularAlertasOrcamento` (aplica os 5 checks item a item, usando as estatísticas como baseline). A página da obra (`app/(app)/obras/[id]/page.tsx`, Server Component) busca as estatísticas históricas **uma vez**, via uma query filtrada só pelos `composicao_id` usados naquele orçamento, e passa o resultado como prop estática (`estatisticasHistoricas`) para `EditorOrcamento`. Os alertas em si, porém, são recalculados **ao vivo, no cliente**, a cada render de `EditorOrcamento` — igual ao indicador de "composição desatualizada" da B5a — porque duplicado/quantidade/unidade dependem de campos que o usuário edita em tempo real (descrição, custo, markup, quantidade); só o baseline histórico entre obras precisa vir do servidor.

**Tech Stack:** Next.js 15 (App Router) + TypeScript, Supabase (Postgres), Tailwind, lucide-react (ícones), Vitest.

## Global Constraints

- 5 checks apenas: duplicado, valor fora do padrão (material/mão de obra separados), markup fora da faixa (material/mão de obra separados), quantidade inconsistente, unidade divergente. "Serviços possivelmente ausentes" está fora de escopo desta fase.
- Limiar de desvio: **30%** de diferença em relação à média histórica (`LIMIAR_DESVIO_PCT = 0.3`).
- Amostra mínima: checks de desvio histórico (valor, markup, quantidade) só disparam quando a composição tem **≥3** usos registrados em `itens_orcamento`, em qualquer obra (`AMOSTRAS_MINIMAS = 3`). Duplicado, quantidade≤0 e unidade divergente não exigem amostra mínima.
- Itens sem `composicao_id` só passam pelos checks de duplicado (por descrição) e quantidade≤0 — os outros 4 checks exigem composição vinculada.
- Custo, markup ou quantidade com valor 0 num item não entram nas comparações de desvio daquele campo específico (evita alerta falso em item ainda incompleto). Quantidade ≤0 tem seu próprio alerta separado, sempre ativo.
- Nunca bloqueia salvar, exportar ou continuar editando — são só indicadores visuais (mesmo ícone `AlertTriangle` de `lucide-react` já usado no indicador de "composição desatualizada" da B5a).
- Sem painel resumo agregado e sem cor/severidade diferenciada por tipo de alerta nesta fase — um único ícone neutro por linha, tooltip lista todos os motivos.
- Se a query de estatísticas históricas falhar ou não retornar dados, a página carrega normalmente sem alertas de desvio — nunca lança erro.

---

### Task 1: `lib/orcamento/alertas.ts` — `calcularEstatisticasHistoricas`

**Files:**
- Create: `lib/orcamento/alertas.ts`
- Create: `lib/orcamento/alertas.test.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces: `ItemHistoricoParaEstatistica`, `EstatisticaComposicao`, `calcularEstatisticasHistoricas(itens: ItemHistoricoParaEstatistica[]): Record<string, EstatisticaComposicao>` — usado pela Task 3 (dentro do mesmo arquivo) e pela Task 4 (`app/(app)/obras/[id]/page.tsx`).

- [ ] **Step 1: Escrever o teste (falhando)**

Crie `lib/orcamento/alertas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { calcularEstatisticasHistoricas } from './alertas'

describe('calcularEstatisticasHistoricas', () => {
  it('agrupa por composicao_id e calcula a média de cada campo', () => {
    const itens = [
      { composicao_id: 'comp-1', custo_unit_material: 100, custo_unit_mao_obra: 50, markup_material: 1.2, markup_mao_obra: 1.3, quantidade: 10 },
      { composicao_id: 'comp-1', custo_unit_material: 200, custo_unit_mao_obra: 70, markup_material: 1.4, markup_mao_obra: 1.5, quantidade: 20 },
    ]
    const resultado = calcularEstatisticasHistoricas(itens)
    expect(resultado['comp-1'].amostras).toBe(2)
    expect(resultado['comp-1'].mediaCustoMaterial).toBeCloseTo(150)
    expect(resultado['comp-1'].mediaCustoMaoObra).toBeCloseTo(60)
    expect(resultado['comp-1'].mediaMarkupMaterial).toBeCloseTo(1.3)
    expect(resultado['comp-1'].mediaMarkupMaoObra).toBeCloseTo(1.4)
    expect(resultado['comp-1'].mediaQuantidade).toBeCloseTo(15)
  })

  it('não mistura itens de composições diferentes', () => {
    const itens = [
      { composicao_id: 'comp-1', custo_unit_material: 100, custo_unit_mao_obra: 50, markup_material: 1.2, markup_mao_obra: 1.3, quantidade: 10 },
      { composicao_id: 'comp-2', custo_unit_material: 500, custo_unit_mao_obra: 300, markup_material: 2.0, markup_mao_obra: 2.0, quantidade: 1 },
    ]
    const resultado = calcularEstatisticasHistoricas(itens)
    expect(resultado['comp-1'].amostras).toBe(1)
    expect(resultado['comp-2'].amostras).toBe(1)
    expect(resultado['comp-1'].mediaCustoMaterial).toBeCloseTo(100)
    expect(resultado['comp-2'].mediaCustoMaterial).toBeCloseTo(500)
  })

  it('retorna objeto vazio para lista vazia', () => {
    expect(calcularEstatisticasHistoricas([])).toEqual({})
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run lib/orcamento/alertas.test.ts`
Expected: FAIL — `Cannot find module './alertas'` (o arquivo `alertas.ts` ainda não existe).

- [ ] **Step 3: Implementar `calcularEstatisticasHistoricas`**

Crie `lib/orcamento/alertas.ts`:

```typescript
export interface ItemHistoricoParaEstatistica {
  composicao_id: string
  custo_unit_material: number
  custo_unit_mao_obra: number
  markup_material: number
  markup_mao_obra: number
  quantidade: number
}

export interface EstatisticaComposicao {
  amostras: number
  mediaCustoMaterial: number
  mediaCustoMaoObra: number
  mediaMarkupMaterial: number
  mediaMarkupMaoObra: number
  mediaQuantidade: number
}

function media(lista: ItemHistoricoParaEstatistica[], campo: keyof Omit<ItemHistoricoParaEstatistica, 'composicao_id'>): number {
  return lista.reduce((acc, item) => acc + item[campo], 0) / lista.length
}

export function calcularEstatisticasHistoricas(
  itens: ItemHistoricoParaEstatistica[]
): Record<string, EstatisticaComposicao> {
  const porComposicao = new Map<string, ItemHistoricoParaEstatistica[]>()
  for (const item of itens) {
    const lista = porComposicao.get(item.composicao_id) ?? []
    lista.push(item)
    porComposicao.set(item.composicao_id, lista)
  }

  const resultado: Record<string, EstatisticaComposicao> = {}
  for (const [composicaoId, lista] of porComposicao) {
    resultado[composicaoId] = {
      amostras: lista.length,
      mediaCustoMaterial: media(lista, 'custo_unit_material'),
      mediaCustoMaoObra: media(lista, 'custo_unit_mao_obra'),
      mediaMarkupMaterial: media(lista, 'markup_material'),
      mediaMarkupMaoObra: media(lista, 'markup_mao_obra'),
      mediaQuantidade: media(lista, 'quantidade'),
    }
  }
  return resultado
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run lib/orcamento/alertas.test.ts`
Expected: PASS — 3 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/orcamento/alertas.ts lib/orcamento/alertas.test.ts
git commit -m "feat: agrega estatisticas historicas de custo/markup/quantidade por composicao"
```

---

### Task 2: `calcularAlertasOrcamento` — duplicado e quantidade≤0

**Files:**
- Modify: `lib/orcamento/alertas.ts`
- Modify: `lib/orcamento/alertas.test.ts`

**Interfaces:**
- Consumes: nada da Task 1 diretamente (esta parte da função não usa `EstatisticaComposicao` ainda — isso entra na Task 3).
- Produces: `TipoAlerta`, `Alerta`, `ItemParaAlerta`, `calcularAlertasOrcamento(itens: ItemParaAlerta[], estatisticas: Record<string, EstatisticaComposicao>): Record<string, Alerta[]>` — usado pela Task 5 (`EditorOrcamento.tsx`). Nesta task a função já existe com a assinatura final, mas só implementa duplicado e quantidade≤0; a Task 3 adiciona o resto no mesmo corpo.

- [ ] **Step 1: Escrever os testes (falhando)**

Adicione ao final de `lib/orcamento/alertas.test.ts`:

```typescript
import { calcularAlertasOrcamento } from './alertas'

describe('calcularAlertasOrcamento — duplicado', () => {
  it('sinaliza dois itens com a mesma composicao_id', () => {
    const itens = [
      { id: 'item-1', descricao: 'Pintura sala', composicao_id: 'comp-1', quantidade: 10, custo_unit_material: 50, custo_unit_mao_obra: 30, markup_material: 1.2, markup_mao_obra: 1.2, unidade_id: 'un-m2' },
      { id: 'item-2', descricao: 'Pintura quarto', composicao_id: 'comp-1', quantidade: 5, custo_unit_material: 50, custo_unit_mao_obra: 30, markup_material: 1.2, markup_mao_obra: 1.2, unidade_id: 'un-m2' },
    ]
    const resultado = calcularAlertasOrcamento(itens, {})
    expect(resultado['item-1'].some(a => a.tipo === 'duplicado')).toBe(true)
    expect(resultado['item-2'].some(a => a.tipo === 'duplicado')).toBe(true)
  })

  it('sinaliza dois itens com a mesma descrição (ignorando maiúsculas/espaços), mesmo sem composição', () => {
    const itens = [
      { id: 'item-1', descricao: 'Instalação elétrica', composicao_id: null, quantidade: 10, custo_unit_material: 50, custo_unit_mao_obra: 30, markup_material: 1.2, markup_mao_obra: 1.2, unidade_id: null },
      { id: 'item-2', descricao: '  instalação elétrica  ', composicao_id: null, quantidade: 5, custo_unit_material: 50, custo_unit_mao_obra: 30, markup_material: 1.2, markup_mao_obra: 1.2, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, {})
    expect(resultado['item-1'].some(a => a.tipo === 'duplicado')).toBe(true)
    expect(resultado['item-2'].some(a => a.tipo === 'duplicado')).toBe(true)
  })

  it('não sinaliza itens com descrições e composições diferentes', () => {
    const itens = [
      { id: 'item-1', descricao: 'Pintura sala', composicao_id: 'comp-1', quantidade: 10, custo_unit_material: 50, custo_unit_mao_obra: 30, markup_material: 1.2, markup_mao_obra: 1.2, unidade_id: null },
      { id: 'item-2', descricao: 'Instalação elétrica', composicao_id: 'comp-2', quantidade: 5, custo_unit_material: 50, custo_unit_mao_obra: 30, markup_material: 1.2, markup_mao_obra: 1.2, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, {})
    expect(resultado['item-1'] ?? []).toEqual([])
    expect(resultado['item-2'] ?? []).toEqual([])
  })

  it('não duplica o alerta de descrição quando o par já foi sinalizado por composição', () => {
    const itens = [
      { id: 'item-1', descricao: 'Pintura sala', composicao_id: 'comp-1', quantidade: 10, custo_unit_material: 50, custo_unit_mao_obra: 30, markup_material: 1.2, markup_mao_obra: 1.2, unidade_id: null },
      { id: 'item-2', descricao: 'Pintura sala', composicao_id: 'comp-1', quantidade: 5, custo_unit_material: 50, custo_unit_mao_obra: 30, markup_material: 1.2, markup_mao_obra: 1.2, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, {})
    const alertasDuplicado = resultado['item-1'].filter(a => a.tipo === 'duplicado')
    expect(alertasDuplicado).toHaveLength(1)
  })
})

describe('calcularAlertasOrcamento — quantidade inconsistente (zero/negativa)', () => {
  it('sinaliza quantidade zero', () => {
    const itens = [
      { id: 'item-1', descricao: 'Item A', composicao_id: null, quantidade: 0, custo_unit_material: 50, custo_unit_mao_obra: 30, markup_material: 1.2, markup_mao_obra: 1.2, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, {})
    expect(resultado['item-1'].some(a => a.tipo === 'quantidade_inconsistente')).toBe(true)
  })

  it('sinaliza quantidade negativa', () => {
    const itens = [
      { id: 'item-1', descricao: 'Item A', composicao_id: null, quantidade: -5, custo_unit_material: 50, custo_unit_mao_obra: 30, markup_material: 1.2, markup_mao_obra: 1.2, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, {})
    expect(resultado['item-1'].some(a => a.tipo === 'quantidade_inconsistente')).toBe(true)
  })

  it('não sinaliza quantidade positiva sem histórico', () => {
    const itens = [
      { id: 'item-1', descricao: 'Item A', composicao_id: null, quantidade: 10, custo_unit_material: 50, custo_unit_mao_obra: 30, markup_material: 1.2, markup_mao_obra: 1.2, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, {})
    expect(resultado['item-1'] ?? []).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run lib/orcamento/alertas.test.ts`
Expected: FAIL — `calcularAlertasOrcamento is not a function` (ainda não existe).

- [ ] **Step 3: Implementar duplicado e quantidade≤0**

Adicione ao final de `lib/orcamento/alertas.ts`:

```typescript
export type TipoAlerta =
  | 'duplicado'
  | 'valor_material_fora_padrao'
  | 'valor_mao_obra_fora_padrao'
  | 'markup_material_fora_faixa'
  | 'markup_mao_obra_fora_faixa'
  | 'quantidade_inconsistente'
  | 'unidade_divergente'

export interface Alerta {
  tipo: TipoAlerta
  mensagem: string
}

export interface ItemParaAlerta {
  id: string
  descricao: string
  composicao_id: string | null
  quantidade: number
  custo_unit_material: number
  custo_unit_mao_obra: number
  markup_material: number
  markup_mao_obra: number
  unidade_id: string | null
  composicoes?: { unidade_id: string | null } | null
}

function adicionarAlerta(alertas: Record<string, Alerta[]>, itemId: string, alerta: Alerta) {
  const lista = alertas[itemId] ?? []
  lista.push(alerta)
  alertas[itemId] = lista
}

export function calcularAlertasOrcamento(
  itens: ItemParaAlerta[],
  estatisticas: Record<string, EstatisticaComposicao>
): Record<string, Alerta[]> {
  const alertas: Record<string, Alerta[]> = {}

  const porComposicao = new Map<string, ItemParaAlerta[]>()
  const porDescricao = new Map<string, ItemParaAlerta[]>()
  for (const item of itens) {
    if (item.composicao_id) {
      const lista = porComposicao.get(item.composicao_id) ?? []
      lista.push(item)
      porComposicao.set(item.composicao_id, lista)
    }
    const chave = item.descricao.trim().toLowerCase()
    if (chave) {
      const lista = porDescricao.get(chave) ?? []
      lista.push(item)
      porDescricao.set(chave, lista)
    }
  }

  for (const lista of porComposicao.values()) {
    if (lista.length < 2) continue
    for (const item of lista) {
      const outro = lista.find(i => i.id !== item.id)!
      adicionarAlerta(alertas, item.id, { tipo: 'duplicado', mensagem: `Mesma composição do item "${outro.descricao}"` })
    }
  }
  for (const lista of porDescricao.values()) {
    if (lista.length < 2) continue
    for (const item of lista) {
      const jaSinalizadoPorComposicao = item.composicao_id != null && (porComposicao.get(item.composicao_id)?.length ?? 0) > 1
      if (jaSinalizadoPorComposicao) continue
      const outro = lista.find(i => i.id !== item.id)!
      adicionarAlerta(alertas, item.id, { tipo: 'duplicado', mensagem: `Mesma descrição do item "${outro.descricao}"` })
    }
  }

  for (const item of itens) {
    if (item.quantidade <= 0) {
      adicionarAlerta(alertas, item.id, { tipo: 'quantidade_inconsistente', mensagem: 'Quantidade zerada ou negativa' })
    }
  }

  return alertas
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run lib/orcamento/alertas.test.ts`
Expected: PASS — 10 testes (3 da Task 1 + 7 novos).

- [ ] **Step 5: Commit**

```bash
git add lib/orcamento/alertas.ts lib/orcamento/alertas.test.ts
git commit -m "feat: alerta de item duplicado e quantidade zerada/negativa no orcamento"
```

---

### Task 3: `calcularAlertasOrcamento` — valor/markup fora do padrão, quantidade por histórico e unidade divergente

**Files:**
- Modify: `lib/orcamento/alertas.ts`
- Modify: `lib/orcamento/alertas.test.ts`

**Interfaces:**
- Consumes: `EstatisticaComposicao` (Task 1), `ItemParaAlerta`/`Alerta`/`adicionarAlerta` (Task 2, mesmo arquivo).
- Produces: `LIMIAR_DESVIO_PCT`, `AMOSTRAS_MINIMAS` (constantes exportadas) — a assinatura de `calcularAlertasOrcamento` não muda, só o corpo.

- [ ] **Step 1: Escrever os testes (falhando)**

Adicione ao final de `lib/orcamento/alertas.test.ts`:

```typescript
describe('calcularAlertasOrcamento — valor/markup fora do padrão', () => {
  const estatisticasBase = {
    'comp-1': {
      amostras: 3,
      mediaCustoMaterial: 100,
      mediaCustoMaoObra: 50,
      mediaMarkupMaterial: 1.2,
      mediaMarkupMaoObra: 1.3,
      mediaQuantidade: 10,
    },
  }

  it('sinaliza custo de material fora do padrão quando desvia mais de 30% da média', () => {
    const itens = [
      { id: 'item-1', descricao: 'Item A', composicao_id: 'comp-1', quantidade: 10, custo_unit_material: 200, custo_unit_mao_obra: 50, markup_material: 1.2, markup_mao_obra: 1.3, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, estatisticasBase)
    expect(resultado['item-1'].some(a => a.tipo === 'valor_material_fora_padrao')).toBe(true)
  })

  it('não sinaliza quando o desvio é menor que 30%', () => {
    const itens = [
      { id: 'item-1', descricao: 'Item A', composicao_id: 'comp-1', quantidade: 10, custo_unit_material: 110, custo_unit_mao_obra: 50, markup_material: 1.2, markup_mao_obra: 1.3, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, estatisticasBase)
    expect(resultado['item-1'] ?? []).toEqual([])
  })

  it('não sinaliza quando a composição tem menos de 3 amostras históricas', () => {
    const estatisticasPoucaAmostra = { 'comp-1': { ...estatisticasBase['comp-1'], amostras: 2 } }
    const itens = [
      { id: 'item-1', descricao: 'Item A', composicao_id: 'comp-1', quantidade: 10, custo_unit_material: 500, custo_unit_mao_obra: 50, markup_material: 1.2, markup_mao_obra: 1.3, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, estatisticasPoucaAmostra)
    expect(resultado['item-1'] ?? []).toEqual([])
  })

  it('sinaliza markup de mão de obra fora da faixa', () => {
    const itens = [
      { id: 'item-1', descricao: 'Item A', composicao_id: 'comp-1', quantidade: 10, custo_unit_material: 100, custo_unit_mao_obra: 50, markup_material: 1.2, markup_mao_obra: 2.5, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, estatisticasBase)
    expect(resultado['item-1'].some(a => a.tipo === 'markup_mao_obra_fora_faixa')).toBe(true)
  })

  it('sinaliza quantidade fora do padrão histórico mesmo sendo positiva', () => {
    const itens = [
      { id: 'item-1', descricao: 'Item A', composicao_id: 'comp-1', quantidade: 50, custo_unit_material: 100, custo_unit_mao_obra: 50, markup_material: 1.2, markup_mao_obra: 1.3, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, estatisticasBase)
    expect(resultado['item-1'].some(a => a.tipo === 'quantidade_inconsistente')).toBe(true)
  })

  it('ignora as checagens de histórico para item sem composicao_id', () => {
    const itens = [
      { id: 'item-1', descricao: 'Item A', composicao_id: null, quantidade: 50, custo_unit_material: 9999, custo_unit_mao_obra: 9999, markup_material: 9999, markup_mao_obra: 9999, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, estatisticasBase)
    expect(resultado['item-1'] ?? []).toEqual([])
  })

  it('ignora a comparação de um campo quando o valor do item nesse campo é zero', () => {
    const itens = [
      { id: 'item-1', descricao: 'Item A', composicao_id: 'comp-1', quantidade: 10, custo_unit_material: 0, custo_unit_mao_obra: 50, markup_material: 1.2, markup_mao_obra: 1.3, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, estatisticasBase)
    expect(resultado['item-1']?.some(a => a.tipo === 'valor_material_fora_padrao') ?? false).toBe(false)
  })
})

describe('calcularAlertasOrcamento — unidade divergente', () => {
  it('sinaliza quando a unidade do item difere da unidade da composição', () => {
    const itens = [
      {
        id: 'item-1', descricao: 'Item A', composicao_id: 'comp-1', quantidade: 10,
        custo_unit_material: 100, custo_unit_mao_obra: 50, markup_material: 1.2, markup_mao_obra: 1.3,
        unidade_id: 'un-un', composicoes: { unidade_id: 'un-m2' },
      },
    ]
    const resultado = calcularAlertasOrcamento(itens, {})
    expect(resultado['item-1'].some(a => a.tipo === 'unidade_divergente')).toBe(true)
  })

  it('não sinaliza quando as unidades são iguais', () => {
    const itens = [
      {
        id: 'item-1', descricao: 'Item A', composicao_id: 'comp-1', quantidade: 10,
        custo_unit_material: 100, custo_unit_mao_obra: 50, markup_material: 1.2, markup_mao_obra: 1.3,
        unidade_id: 'un-m2', composicoes: { unidade_id: 'un-m2' },
      },
    ]
    const resultado = calcularAlertasOrcamento(itens, {})
    expect(resultado['item-1'] ?? []).toEqual([])
  })

  it('não sinaliza quando o item não tem composição vinculada', () => {
    const itens = [
      { id: 'item-1', descricao: 'Item A', composicao_id: null, quantidade: 10, custo_unit_material: 100, custo_unit_mao_obra: 50, markup_material: 1.2, markup_mao_obra: 1.3, unidade_id: 'un-un' },
    ]
    const resultado = calcularAlertasOrcamento(itens, {})
    expect(resultado['item-1'] ?? []).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run lib/orcamento/alertas.test.ts`
Expected: FAIL — os novos testes desta task falham (os checks de valor/markup/quantidade-histórica/unidade ainda não existem); os 10 testes das Tasks 1 e 2 continuam passando.

- [ ] **Step 3: Implementar os checks restantes**

Em `lib/orcamento/alertas.ts`, adicione as constantes logo abaixo das interfaces `ItemHistoricoParaEstatistica`/`EstatisticaComposicao` (antes da função `media`):

```typescript
export const LIMIAR_DESVIO_PCT = 0.3
export const AMOSTRAS_MINIMAS = 3
```

Adicione, logo antes de `export function calcularAlertasOrcamento`, as duas funções auxiliares:

```typescript
function desviaMaisQue(valor: number, mediaHistorica: number, limiar: number): boolean {
  if (mediaHistorica <= 0) return false
  return Math.abs(valor - mediaHistorica) / mediaHistorica > limiar
}

function pctDesvio(valor: number, mediaHistorica: number): number {
  return Math.round((Math.abs(valor - mediaHistorica) / mediaHistorica) * 100)
}
```

Dentro de `calcularAlertasOrcamento`, localize o loop final:

```typescript
  for (const item of itens) {
    if (item.quantidade <= 0) {
      adicionarAlerta(alertas, item.id, { tipo: 'quantidade_inconsistente', mensagem: 'Quantidade zerada ou negativa' })
    }
  }

  return alertas
```

Substitua por:

```typescript
  for (const item of itens) {
    if (item.quantidade <= 0) {
      adicionarAlerta(alertas, item.id, { tipo: 'quantidade_inconsistente', mensagem: 'Quantidade zerada ou negativa' })
    }

    if (!item.composicao_id) continue
    const stats = estatisticas[item.composicao_id]
    if (!stats || stats.amostras < AMOSTRAS_MINIMAS) continue

    if (item.custo_unit_material > 0 && desviaMaisQue(item.custo_unit_material, stats.mediaCustoMaterial, LIMIAR_DESVIO_PCT)) {
      adicionarAlerta(alertas, item.id, {
        tipo: 'valor_material_fora_padrao',
        mensagem: `Custo de material ${pctDesvio(item.custo_unit_material, stats.mediaCustoMaterial)}% fora da média histórica`,
      })
    }
    if (item.custo_unit_mao_obra > 0 && desviaMaisQue(item.custo_unit_mao_obra, stats.mediaCustoMaoObra, LIMIAR_DESVIO_PCT)) {
      adicionarAlerta(alertas, item.id, {
        tipo: 'valor_mao_obra_fora_padrao',
        mensagem: `Custo de mão de obra ${pctDesvio(item.custo_unit_mao_obra, stats.mediaCustoMaoObra)}% fora da média histórica`,
      })
    }
    if (item.markup_material > 0 && desviaMaisQue(item.markup_material, stats.mediaMarkupMaterial, LIMIAR_DESVIO_PCT)) {
      adicionarAlerta(alertas, item.id, {
        tipo: 'markup_material_fora_faixa',
        mensagem: `Markup de material ${pctDesvio(item.markup_material, stats.mediaMarkupMaterial)}% fora da faixa histórica`,
      })
    }
    if (item.markup_mao_obra > 0 && desviaMaisQue(item.markup_mao_obra, stats.mediaMarkupMaoObra, LIMIAR_DESVIO_PCT)) {
      adicionarAlerta(alertas, item.id, {
        tipo: 'markup_mao_obra_fora_faixa',
        mensagem: `Markup de mão de obra ${pctDesvio(item.markup_mao_obra, stats.mediaMarkupMaoObra)}% fora da faixa histórica`,
      })
    }
    if (item.quantidade > 0 && desviaMaisQue(item.quantidade, stats.mediaQuantidade, LIMIAR_DESVIO_PCT)) {
      adicionarAlerta(alertas, item.id, {
        tipo: 'quantidade_inconsistente',
        mensagem: `Quantidade ${pctDesvio(item.quantidade, stats.mediaQuantidade)}% fora da média histórica`,
      })
    }

    if (item.unidade_id && item.composicoes?.unidade_id && item.unidade_id !== item.composicoes.unidade_id) {
      adicionarAlerta(alertas, item.id, { tipo: 'unidade_divergente', mensagem: 'Unidade diferente da unidade cadastrada na composição' })
    }
  }

  return alertas
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run lib/orcamento/alertas.test.ts`
Expected: PASS — 20 testes no total.

- [ ] **Step 5: Commit**

```bash
git add lib/orcamento/alertas.ts lib/orcamento/alertas.test.ts
git commit -m "feat: alerta de valor/markup fora do padrao, quantidade por historico e unidade divergente"
```

---

### Task 4: Servidor — buscar estatísticas históricas e unidade da composição na página da obra

**Files:**
- Modify: `types/database.ts`
- Modify: `app/(app)/obras/[id]/page.tsx`

**Interfaces:**
- Consumes: `calcularEstatisticasHistoricas`, `EstatisticaComposicao` (Task 1).
- Produces: `EditorOrcamento` passa a receber uma prop `estatisticasHistoricas: Record<string, EstatisticaComposicao>` — usada pela Task 5. Cada item em `obra.grupos_orcamento[].itens_orcamento[].composicoes` passa a trazer `unidade_id` além de `versao` — usado pela Task 5/6 (check de unidade divergente).

- [ ] **Step 1: Ler os dois arquivos por completo**

Leia `types/database.ts` e `app/(app)/obras/[id]/page.tsx` inteiros antes de editar.

- [ ] **Step 2: Widen `ItemOrcamento.composicoes` em `types/database.ts`**

Localize:

```typescript
  composicoes?: Pick<Composicao, 'versao'> | null
```

Substitua por:

```typescript
  composicoes?: Pick<Composicao, 'versao' | 'unidade_id'> | null
```

- [ ] **Step 3: Verificar que o projeto compila**

Run: `npx tsc --noEmit`
Expected: nenhum erro novo (o campo é opcional e mais largo do que antes, nada quebra).

- [ ] **Step 4: Commit do tipo**

```bash
git add types/database.ts
git commit -m "feat: tipo ItemOrcamento.composicoes ganha unidade_id"
```

- [ ] **Step 5: Adicionar `unidade_id` ao tipo inline e ao select da página da obra**

Em `app/(app)/obras/[id]/page.tsx`, localize dentro do tipo `ObraCompleta`:

```typescript
      composicoes: { versao: number } | null
```

Substitua por:

```typescript
      composicoes: { versao: number; unidade_id: string | null } | null
```

Localize no `select` do Supabase:

```typescript
            composicoes (versao),
```

Substitua por:

```typescript
            composicoes (versao, unidade_id),
```

- [ ] **Step 6: Adicionar o import e o cálculo de estatísticas históricas**

Localize o import no topo do arquivo:

```typescript
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EditorOrcamento from '@/components/orcamento/EditorOrcamento'
```

Substitua por:

```typescript
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EditorOrcamento from '@/components/orcamento/EditorOrcamento'
import { calcularEstatisticasHistoricas, type EstatisticaComposicao } from '@/lib/orcamento/alertas'
```

Localize o bloco de ordenação, logo antes do `return`:

```typescript
  // Ordenar grupos e itens por ordem
  obra.grupos_orcamento?.sort((a, b) => a.ordem - b.ordem)
  obra.grupos_orcamento?.forEach(g => {
    g.itens_orcamento?.sort((a, b) => a.ordem - b.ordem)
  })

  return (
    <EditorOrcamento
      obra={obra as unknown as Parameters<typeof EditorOrcamento>[0]['obra']}
      clientes={clientesResult.data ?? []}
      disciplinas={disciplinasResult.data ?? []}
      unidades={unidadesResult.data ?? []}
    />
  )
```

Substitua por:

```typescript
  // Ordenar grupos e itens por ordem
  obra.grupos_orcamento?.sort((a, b) => a.ordem - b.ordem)
  obra.grupos_orcamento?.forEach(g => {
    g.itens_orcamento?.sort((a, b) => a.ordem - b.ordem)
  })

  const composicaoIds = [...new Set(
    (obra.grupos_orcamento ?? [])
      .flatMap(g => g.itens_orcamento ?? [])
      .map(i => i.composicao_id)
      .filter((id): id is string => id != null)
  )]

  let estatisticasHistoricas: Record<string, EstatisticaComposicao> = {}
  if (composicaoIds.length > 0) {
    const { data: itensHistorico } = await supabase
      .from('itens_orcamento')
      .select('composicao_id, custo_unit_material, custo_unit_mao_obra, markup_material, markup_mao_obra, quantidade')
      .in('composicao_id', composicaoIds)

    if (itensHistorico) {
      const itensValidos = itensHistorico.filter(
        (i): i is typeof i & { composicao_id: string } => i.composicao_id != null
      )
      estatisticasHistoricas = calcularEstatisticasHistoricas(itensValidos)
    }
  }

  return (
    <EditorOrcamento
      obra={obra as unknown as Parameters<typeof EditorOrcamento>[0]['obra']}
      clientes={clientesResult.data ?? []}
      disciplinas={disciplinasResult.data ?? []}
      unidades={unidadesResult.data ?? []}
      estatisticasHistoricas={estatisticasHistoricas}
    />
  )
```

- [ ] **Step 7: Verificar que o projeto compila**

Run: `npx tsc --noEmit`
Expected: erro esperado de que `EditorOrcamento` ainda não aceita a prop `estatisticasHistoricas` — isso é resolvido na Task 5. Confirme que o erro é exatamente esse (nenhum outro erro novo).

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/obras/[id]/page.tsx"
git commit -m "feat: busca estatisticas historicas de composicoes usadas no orcamento"
```

---

### Task 5: `EditorOrcamento.tsx` — computar alertas a partir do estado atual

**Files:**
- Modify: `components/orcamento/EditorOrcamento.tsx`

**Interfaces:**
- Consumes: `calcularAlertasOrcamento`, `EstatisticaComposicao`, `Alerta` (Tasks 1-3).
- Produces: `TabelaOrcamento` passa a receber uma prop `alertasPorItem: Record<string, Alerta[]>` — usada pela Task 6.

- [ ] **Step 1: Ler o arquivo atual por completo**

Leia `components/orcamento/EditorOrcamento.tsx` inteiro antes de editar.

- [ ] **Step 2: Adicionar o import**

Localize:

```typescript
import { calcularGrupo, calcularRentabilidade, calcularTotaisGerais } from '@/lib/calculos'
```

Substitua por:

```typescript
import { calcularGrupo, calcularRentabilidade, calcularTotaisGerais } from '@/lib/calculos'
import { calcularAlertasOrcamento, type EstatisticaComposicao } from '@/lib/orcamento/alertas'
```

- [ ] **Step 3: Adicionar a prop `estatisticasHistoricas`**

Localize:

```typescript
interface Props {
  obra: ObraParaEditor
  clientes: Pick<Cliente, 'id' | 'razao_social'>[]
  disciplinas: Pick<Disciplina, 'id' | 'nome'>[]
  unidades: Pick<UnidadeMedida, 'id' | 'sigla'>[]
}

export default function EditorOrcamento({ obra, clientes, disciplinas, unidades }: Props) {
```

Substitua por:

```typescript
interface Props {
  obra: ObraParaEditor
  clientes: Pick<Cliente, 'id' | 'razao_social'>[]
  disciplinas: Pick<Disciplina, 'id' | 'nome'>[]
  unidades: Pick<UnidadeMedida, 'id' | 'sigla'>[]
  estatisticasHistoricas: Record<string, EstatisticaComposicao>
}

export default function EditorOrcamento({ obra, clientes, disciplinas, unidades, estatisticasHistoricas }: Props) {
```

- [ ] **Step 4: Computar `alertasPorItem` ao lado de `gruposCalculados`**

Localize:

```typescript
  const feeFator = fatores.fee_fator
  const gruposCalculados: GrupoCalculado[] = grupos.map(g => calcularGrupo(g, feeFator))
  const totais: TotaisGerais = calcularTotaisGerais(gruposCalculados)
  const rentabilidade = calcularRentabilidade(gruposCalculados, fatores)
```

Substitua por:

```typescript
  const feeFator = fatores.fee_fator
  const gruposCalculados: GrupoCalculado[] = grupos.map(g => calcularGrupo(g, feeFator))
  const totais: TotaisGerais = calcularTotaisGerais(gruposCalculados)
  const rentabilidade = calcularRentabilidade(gruposCalculados, fatores)
  const alertasPorItem = calcularAlertasOrcamento(
    grupos.flatMap(g => g.itens_orcamento),
    estatisticasHistoricas
  )
```

- [ ] **Step 5: Passar a prop para `TabelaOrcamento`**

Localize:

```typescript
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

Substitua por:

```typescript
      <TabelaOrcamento
        gruposCalculados={gruposCalculados}
        totais={totais}
        visao="tecnica"
        obraId={obra.id}
        disciplinas={disciplinasList}
        unidades={unidadesList}
        alertasPorItem={alertasPorItem}
        onUpdateItem={atualizarItem}
        onUpdateUnidade={atualizarUnidade}
        onAddDisciplina={adicionarDisciplina}
        onRemoveGrupo={removerGrupo}
        onAddItem={adicionarItem}
        onRemoveItem={removerItem}
        onConverterParaComposicao={converterItemParaComposicao}
      />
```

- [ ] **Step 6: Verificar que o projeto compila**

Run: `npx tsc --noEmit`
Expected: erro esperado de que `TabelaOrcamento` ainda não aceita a prop `alertasPorItem` — resolvido na Task 6. Nenhum outro erro novo (o erro da Task 4 sobre `estatisticasHistoricas` deve ter desaparecido).

- [ ] **Step 7: Commit**

```bash
git add components/orcamento/EditorOrcamento.tsx
git commit -m "feat: EditorOrcamento calcula alertas do orcamento a cada render"
```

---

### Task 6: `TabelaOrcamento.tsx` — indicador de alerta por item

**Files:**
- Modify: `components/orcamento/TabelaOrcamento.tsx`

**Interfaces:**
- Consumes: `Alerta` (Task 2), prop `alertasPorItem` (Task 5).
- Produces: nenhuma interface nova — só UI.

- [ ] **Step 1: Ler o arquivo atual por completo**

Leia `components/orcamento/TabelaOrcamento.tsx` inteiro antes de editar.

- [ ] **Step 2: Adicionar o import e a prop**

Localize:

```typescript
import { Fragment, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { fmt, fmtPct } from '@/lib/format'
import type { GrupoCalculado, TotaisGerais, TipoVisao } from '@/types/orcamento'
import type { Disciplina, UnidadeMedida } from '@/types/database'
import { ListaSugestoesSemelhantes } from '@/components/composicoes/ListaSugestoesSemelhantes'

interface Props {
  gruposCalculados: GrupoCalculado[]
  totais: TotaisGerais
  visao: TipoVisao
  obraId: string
  disciplinas: Pick<Disciplina, 'id' | 'nome'>[]
  unidades: Pick<UnidadeMedida, 'id' | 'sigla'>[]
  onUpdateItem: (grupoId: string, itemId: string, campo: string, valor: unknown) => Promise<void>
  onUpdateUnidade: (grupoId: string, itemId: string, sigla: string) => Promise<void>
  onAddDisciplina: (nome: string) => Promise<void>
  onRemoveGrupo: (grupoId: string) => Promise<void>
  onAddItem: (grupoId: string) => Promise<void>
  onRemoveItem: (grupoId: string, itemId: string) => Promise<void>
  onConverterParaComposicao: (grupoId: string, itemId: string, composicaoId: string, quantidade: number) => Promise<void>
}
```

Substitua por:

```typescript
import { Fragment, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { fmt, fmtPct } from '@/lib/format'
import type { GrupoCalculado, TotaisGerais, TipoVisao } from '@/types/orcamento'
import type { Disciplina, UnidadeMedida } from '@/types/database'
import type { Alerta } from '@/lib/orcamento/alertas'
import { ListaSugestoesSemelhantes } from '@/components/composicoes/ListaSugestoesSemelhantes'

interface Props {
  gruposCalculados: GrupoCalculado[]
  totais: TotaisGerais
  visao: TipoVisao
  obraId: string
  disciplinas: Pick<Disciplina, 'id' | 'nome'>[]
  unidades: Pick<UnidadeMedida, 'id' | 'sigla'>[]
  alertasPorItem: Record<string, Alerta[]>
  onUpdateItem: (grupoId: string, itemId: string, campo: string, valor: unknown) => Promise<void>
  onUpdateUnidade: (grupoId: string, itemId: string, sigla: string) => Promise<void>
  onAddDisciplina: (nome: string) => Promise<void>
  onRemoveGrupo: (grupoId: string) => Promise<void>
  onAddItem: (grupoId: string) => Promise<void>
  onRemoveItem: (grupoId: string, itemId: string) => Promise<void>
  onConverterParaComposicao: (grupoId: string, itemId: string, composicaoId: string, quantidade: number) => Promise<void>
}
```

- [ ] **Step 3: Adicionar o componente `IndicadorAlertas`**

Localize (logo após `IndicadorDesatualizado`, antes de `export default function TabelaOrcamento`):

```typescript
function IndicadorDesatualizado({ item }: { item: Parameters<typeof itemDesatualizado>[0] }) {
  if (!itemDesatualizado(item)) return null
  return (
    <span
      title={`Composição atualizada disponível (v${item.composicoes?.versao}) — este item usa a v${item.composicao_versao}`}
      className="shrink-0 text-amber-500"
    >
      <AlertTriangle className="size-3.5" />
    </span>
  )
}
```

Adicione logo abaixo:

```typescript
function IndicadorAlertas({ alertas }: { alertas: Alerta[] | undefined }) {
  if (!alertas || alertas.length === 0) return null
  return (
    <span
      title={alertas.map(a => a.mensagem).join(' · ')}
      className="shrink-0 text-red-500"
    >
      <AlertTriangle className="size-3.5" />
    </span>
  )
}
```

- [ ] **Step 4: Destructurar a prop nova**

Localize:

```typescript
export default function TabelaOrcamento({
  gruposCalculados,
  totais,
  visao,
  disciplinas,
  unidades,
  onUpdateItem,
  onUpdateUnidade,
  onAddDisciplina,
  onRemoveGrupo,
  onAddItem,
  onRemoveItem,
  onConverterParaComposicao,
}: Props) {
```

Substitua por:

```typescript
export default function TabelaOrcamento({
  gruposCalculados,
  totais,
  visao,
  disciplinas,
  unidades,
  alertasPorItem,
  onUpdateItem,
  onUpdateUnidade,
  onAddDisciplina,
  onRemoveGrupo,
  onAddItem,
  onRemoveItem,
  onConverterParaComposicao,
}: Props) {
```

- [ ] **Step 5: Renderizar o indicador na visão comercial**

Localize (dentro de `grupo.itens_calculados.map(item => (...))`, na primeira tabela do arquivo):

```typescript
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
```

Substitua por:

```typescript
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
                            <IndicadorAlertas alertas={alertasPorItem[item.id]} />
                          </div>
                        </td>
```

- [ ] **Step 6: Renderizar o indicador na visão técnica**

Localize (segunda tabela do arquivo, mesma estrutura):

```typescript
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
```

Substitua por:

```typescript
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
                          <IndicadorAlertas alertas={alertasPorItem[item.id]} />
                        </div>
                      </td>
```

(As duas ocorrências têm indentação diferente — uma está na visão comercial, outra na técnica. Aplique cada edit na tabela correspondente, não use find-replace global.)

- [ ] **Step 7: Verificar que o projeto compila**

Run: `npx tsc --noEmit`
Expected: zero erros em qualquer arquivo tocado neste plano.

- [ ] **Step 8: Commit**

```bash
git add components/orcamento/TabelaOrcamento.tsx
git commit -m "feat: indicador de alerta por item na tabela do orcamento"
```

---

### Task 7: Verificação final

**Files:** nenhum (só validação).

- [ ] **Step 1: Rodar a suíte completa**

Run: `npm run test:run`
Expected: todos os testes passam, incluindo os 20 novos de `lib/orcamento/alertas.test.ts`, sem nenhuma regressão nos testes já existentes.

- [ ] **Step 2: Rodar o typecheck geral**

Run: `npx tsc --noEmit`
Expected: nenhum erro em nenhum arquivo do projeto.
