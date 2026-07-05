# Dashboard de Gestão de Orçamentos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dashboard em `/dashboard` com KPIs, 4 gráficos Recharts, tabela de últimos orçamentos, top clientes e atividades — dados reais do Supabase agregados no servidor — mais sidebar redesenhada e tema claro/escuro global.

**Architecture:** Server Component (`page.tsx`) busca obras+grupos+itens e histórico via Supabase server client, agrega tudo em `lib/dashboard/metricas.ts` (reutilizando `lib/calculos.ts` — fórmulas nunca duplicadas) e passa um objeto `DashboardData` pronto para client components (gráficos, tabela, tema). Filtro de período via query string. Realtime via `postgres_changes` → `router.refresh()`.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Tailwind 4, shadcn/ui, Recharts (nova dep), next-themes (já instalado), lucide-react, Supabase, exceljs, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-04-dashboard-design.md`

## Global Constraints

- Todo texto de UI em português brasileiro.
- TypeScript strict; imports com alias `@/*`.
- Nenhum cálculo de negócio fora de `lib/calculos.ts` / `lib/dashboard/metricas.ts` — componentes recebem valores prontos.
- Status reais: `rascunho | enviado | aprovado | em_execucao | concluido | cancelado`. "Aprovados" no dashboard = `aprovado`+`em_execucao`+`concluido`; "Em análise" = `enviado`.
- Formatação monetária via `fmt()` de `lib/format.ts` (`R$ ${fmt(n)}`).
- Cards `rounded-2xl` (16px), sombra leve, ícones Lucide outline.
- Divisão por zero em % → `null` → UI mostra "—".
- Testes: Vitest + @testing-library/react, arquivos `*.test.ts(x)` ao lado do código (padrão do repo).
- Commits pequenos por task, mensagens em português no padrão `feat:`/`test:` do histórico.

---

### Task 1: Instalar Recharts e tokens de cor do dashboard

**Files:**
- Modify: `package.json` (via npm)
- Modify: `app/globals.css`

**Interfaces:**
- Produces: dependência `recharts`; CSS vars `--chart-1..5` com as cores do prompt (azul, verde, amarelo, vermelho, roxo) em light/dark — já mapeadas para Tailwind pelo `@theme inline` existente (`--color-chart-*`). Gráficos usarão `var(--chart-N)` diretamente.

- [ ] **Step 1: Instalar recharts**

Run: `npm install recharts`
Expected: adiciona `recharts` em `dependencies` sem erros de peer deps (React 19 é suportado no recharts ≥ 2.15).

- [ ] **Step 2: Substituir as cores de chart em `app/globals.css`**

No bloco `:root`, substituir as cinco linhas `--chart-1` a `--chart-5` por:

```css
  --chart-1: #2563eb; /* azul */
  --chart-2: #22c55e; /* verde */
  --chart-3: #f59e0b; /* amarelo */
  --chart-4: #ef4444; /* vermelho */
  --chart-5: #8b5cf6; /* roxo */
```

No bloco `.dark`, substituir as cinco linhas `--chart-1` a `--chart-5` por:

```css
  --chart-1: #3b82f6;
  --chart-2: #22c55e;
  --chart-3: #fbbf24;
  --chart-4: #ef4444;
  --chart-5: #a78bfa;
```

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: build verde (as vars são usadas nas próximas tasks; aqui só valida o CSS).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json app/globals.css
git commit -m "feat: instalar recharts e cores de grafico do dashboard"
```

---

### Task 2: `lib/dashboard/periodo.ts` — filtro de período (TDD)

**Files:**
- Create: `lib/dashboard/periodo.ts`
- Test: `lib/dashboard/periodo.test.ts`

**Interfaces:**
- Produces:
  - `type PeriodoKey = 'hoje' | '7d' | '30d' | '90d' | 'ano'`
  - `PERIODO_LABELS: Record<PeriodoKey, string>` — `{ hoje: 'Hoje', '7d': 'Últimos 7 dias', '30d': 'Últimos 30 dias', '90d': 'Últimos 90 dias', ano: 'Este ano' }`
  - `parsePeriodo(raw: string | undefined): PeriodoKey` — default `'30d'`, valores inválidos caem no default
  - `interface Intervalo { inicio: Date; fim: Date; inicioAnterior: Date; fimAnterior: Date }`
  - `intervaloDoPeriodo(key: PeriodoKey, agora?: Date): Intervalo`
  - `dataReferenciaObra(obra: { data_orcamento: string | null; criado_em: string }): Date` — usa `data_orcamento` (parseada como `T00:00:00` local) com fallback `criado_em`

Semântica dos intervalos (`agora` default `new Date()`):
- `hoje`: início do dia atual → fim do dia atual; anterior = ontem (dia cheio).
- `7d`/`30d`/`90d`: início do dia de (agora − (n−1) dias) → fim do dia atual; anterior = janela de mesmo tamanho imediatamente antes.
- `ano`: 1 jan → 31 dez 23:59:59.999 do ano corrente; anterior = ano passado inteiro.

- [ ] **Step 1: Escrever os testes**

Criar `lib/dashboard/periodo.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parsePeriodo, intervaloDoPeriodo, dataReferenciaObra } from './periodo'

const AGORA = new Date('2026-07-04T15:30:00')

describe('parsePeriodo', () => {
  it('retorna o valor quando válido', () => {
    expect(parsePeriodo('hoje')).toBe('hoje')
    expect(parsePeriodo('ano')).toBe('ano')
  })
  it('cai no default 30d para inválido ou ausente', () => {
    expect(parsePeriodo(undefined)).toBe('30d')
    expect(parsePeriodo('xyz')).toBe('30d')
  })
})

describe('intervaloDoPeriodo', () => {
  it('hoje: dia atual completo, anterior = ontem', () => {
    const i = intervaloDoPeriodo('hoje', AGORA)
    expect(i.inicio).toEqual(new Date('2026-07-04T00:00:00'))
    expect(i.fim.getDate()).toBe(4)
    expect(i.fim.getHours()).toBe(23)
    expect(i.inicioAnterior).toEqual(new Date('2026-07-03T00:00:00'))
    expect(i.fimAnterior.getDate()).toBe(3)
  })
  it('30d: janela de 30 dias terminando hoje', () => {
    const i = intervaloDoPeriodo('30d', AGORA)
    expect(i.inicio).toEqual(new Date('2026-06-05T00:00:00'))
    expect(i.fim.getDate()).toBe(4)
    // janela anterior encosta na atual sem sobrepor
    expect(i.fimAnterior < i.inicio).toBe(true)
    expect(i.inicioAnterior).toEqual(new Date('2026-05-06T00:00:00'))
  })
  it('ano: ano corrente inteiro, anterior = ano passado', () => {
    const i = intervaloDoPeriodo('ano', AGORA)
    expect(i.inicio).toEqual(new Date('2026-01-01T00:00:00'))
    expect(i.fim.getFullYear()).toBe(2026)
    expect(i.fim.getMonth()).toBe(11)
    expect(i.inicioAnterior.getFullYear()).toBe(2025)
    expect(i.fimAnterior.getFullYear()).toBe(2025)
  })
})

describe('dataReferenciaObra', () => {
  it('usa data_orcamento quando presente', () => {
    const d = dataReferenciaObra({ data_orcamento: '2026-03-10', criado_em: '2026-01-01T10:00:00Z' })
    expect(d.getMonth()).toBe(2)
    expect(d.getDate()).toBe(10)
  })
  it('cai em criado_em quando data_orcamento é nula', () => {
    const d = dataReferenciaObra({ data_orcamento: null, criado_em: '2026-02-20T10:00:00Z' })
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(1)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/dashboard/periodo.test.ts`
Expected: FAIL — módulo `./periodo` não existe.

- [ ] **Step 3: Implementar `lib/dashboard/periodo.ts`**

```typescript
export type PeriodoKey = 'hoje' | '7d' | '30d' | '90d' | 'ano'

export const PERIODO_LABELS: Record<PeriodoKey, string> = {
  hoje: 'Hoje',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
  ano: 'Este ano',
}

export interface Intervalo {
  inicio: Date
  fim: Date
  inicioAnterior: Date
  fimAnterior: Date
}

const CHAVES: PeriodoKey[] = ['hoje', '7d', '30d', '90d', 'ano']

export function parsePeriodo(raw: string | undefined): PeriodoKey {
  return CHAVES.includes(raw as PeriodoKey) ? (raw as PeriodoKey) : '30d'
}

function inicioDoDia(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function fimDoDia(d: Date): Date {
  const r = new Date(d)
  r.setHours(23, 59, 59, 999)
  return r
}

function menosDias(d: Date, dias: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() - dias)
  return r
}

export function intervaloDoPeriodo(key: PeriodoKey, agora: Date = new Date()): Intervalo {
  if (key === 'ano') {
    const ano = agora.getFullYear()
    return {
      inicio: new Date(ano, 0, 1),
      fim: fimDoDia(new Date(ano, 11, 31)),
      inicioAnterior: new Date(ano - 1, 0, 1),
      fimAnterior: fimDoDia(new Date(ano - 1, 11, 31)),
    }
  }
  const dias = key === 'hoje' ? 1 : key === '7d' ? 7 : key === '30d' ? 30 : 90
  const inicio = inicioDoDia(menosDias(agora, dias - 1))
  return {
    inicio,
    fim: fimDoDia(agora),
    inicioAnterior: inicioDoDia(menosDias(inicio, dias)),
    fimAnterior: fimDoDia(menosDias(inicio, 1)),
  }
}

export function dataReferenciaObra(obra: {
  data_orcamento: string | null
  criado_em: string
}): Date {
  return obra.data_orcamento
    ? new Date(obra.data_orcamento + 'T00:00:00')
    : new Date(obra.criado_em)
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/dashboard/periodo.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/periodo.ts lib/dashboard/periodo.test.ts
git commit -m "feat: parsing e intervalos do filtro de periodo do dashboard"
```

---

### Task 3: `lib/dashboard/metricas.ts` — agregação dos dados (TDD)

**Files:**
- Create: `lib/dashboard/metricas.ts`
- Test: `lib/dashboard/metricas.test.ts`

**Interfaces:**
- Consumes: `calcularItem` de `@/lib/calculos`; `Intervalo`, `dataReferenciaObra` de `./periodo`; `StatusObra` de `@/types/database`.
- Produces (usado pela page e componentes):

```typescript
export interface ObraDashboard {
  id: string
  codigo: string
  nome: string
  status: StatusObra
  data_orcamento: string | null
  criado_em: string
  clientes: { id: string; razao_social: string } | null
  usuarios: { nome: string } | null
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

export interface Kpi { valor: number; variacaoPct: number | null }

export interface LinhaOrcamento {
  id: string
  codigo: string
  cliente: string      // '—' quando null
  obra: string
  responsavel: string  // '—' quando null
  valor: number        // total_venda
  data: string | null  // data de referência ISO (yyyy-mm-dd) ou null
  status: StatusObra
}

export interface DashboardData {
  kpis: {
    criados: Kpi
    emAnalise: Kpi
    aprovados: Kpi
    cancelados: Kpi
    valorOrcado: Kpi
    valorAprovado: Kpi
  }
  orcamentosPorMes: { mes: string; quantidade: number }[]          // 12 entradas, ano corrente
  statusDistribuicao: { status: StatusObra; label: string; quantidade: number }[]  // só status com qtd > 0, do período
  evolucaoFinanceira: { mes: string; orcado: number; aprovado: number; custo: number }[]  // 12, ano corrente
  conversao: { mes: string; criados: number; enviados: number; aprovados: number }[]      // 12, ano corrente
  indicadores: {
    ticketMedio: number | null
    maiorOrcamento: number | null
    taxaConversao: number | null   // % aprovados ÷ (enviados + aprovados) do período
    margemMedia: number | null     // % média ponderada: Σlucro ÷ Σvenda do período
  }
  ultimosOrcamentos: LinhaOrcamento[]  // do período, mais recentes primeiro, sem limite (tabela pagina)
  topClientes: { nome: string; obras: number; valor: number }[]    // top 5 por valor, do período
}

export const STATUS_LABELS: Record<StatusObra, string>   // Rascunho, Enviado, Aprovado, Em execução, Concluído, Cancelado
export const STATUS_APROVADOS: StatusObra[]              // ['aprovado', 'em_execucao', 'concluido']
export function totalVendaObra(obra: ObraDashboard): number
export function totalCustoObra(obra: ObraDashboard): number
export function variacaoPct(atual: number, anterior: number): number | null
export function calcularDashboard(obras: ObraDashboard[], intervalo: Intervalo, agora?: Date): DashboardData
```

Regras:
- Séries mensais consideram o **ano de `agora`** (`dataReferenciaObra` no ano corrente), independentes do intervalo.
- KPIs/indicadores/tabela/top clientes consideram obras com `dataReferenciaObra` dentro de `[inicio, fim]`; variação compara com `[inicioAnterior, fimAnterior]`.
- "Em análise" = `enviado`; "aprovados" = `STATUS_APROVADOS`; "cancelados" = `cancelado`.
- `variacaoPct(a, 0)` → `null`; caso contrário `(a - anterior) / anterior * 100`.
- `taxaConversao`: denominador `enviados + aprovados` do período; 0 → `null`.
- `margemMedia`: `Σ(venda−custo) ÷ Σvenda × 100` das obras do período; Σvenda 0 → `null`.
- `ticketMedio`/`maiorOrcamento`: sobre `totalVendaObra` das obras do período; sem obras → `null`.
- `mes` nas séries: `'Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'`.

- [ ] **Step 1: Escrever os testes**

Criar `lib/dashboard/metricas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { calcularDashboard, totalVendaObra, variacaoPct, type ObraDashboard } from './metricas'
import { intervaloDoPeriodo } from './periodo'
import type { StatusObra } from '@/types/database'

const AGORA = new Date('2026-07-04T12:00:00')
const INTERVALO_30D = intervaloDoPeriodo('30d', AGORA)

let seq = 0
function obra(over: Partial<ObraDashboard> & { status?: StatusObra } = {}): ObraDashboard {
  seq++
  return {
    id: `id-${seq}`,
    codigo: `0${seq}`,
    nome: `Obra ${seq}`,
    status: 'rascunho',
    data_orcamento: '2026-06-20',
    criado_em: '2026-06-20T10:00:00Z',
    clientes: { id: 'c1', razao_social: 'ACME' },
    usuarios: { nome: 'João' },
    grupos_orcamento: [
      {
        itens_orcamento: [
          // custo 100×10=1000; margem 50% MO → venda 1500
          { quantidade: 10, custo_unit_mao_obra: 100, custo_unit_material: 0, margem_mao_obra_pct: 50, margem_material_pct: 0 },
        ],
      },
    ],
    ...over,
  }
}

describe('totalVendaObra', () => {
  it('soma venda de todos os itens via calcularItem', () => {
    expect(totalVendaObra(obra())).toBe(1500)
  })
})

describe('variacaoPct', () => {
  it('calcula percentual sobre o anterior', () => {
    expect(variacaoPct(120, 100)).toBeCloseTo(20)
    expect(variacaoPct(80, 100)).toBeCloseTo(-20)
  })
  it('retorna null quando anterior é zero', () => {
    expect(variacaoPct(5, 0)).toBeNull()
  })
})

describe('calcularDashboard', () => {
  it('retorna zeros/nulls com lista vazia', () => {
    const d = calcularDashboard([], INTERVALO_30D, AGORA)
    expect(d.kpis.criados.valor).toBe(0)
    expect(d.kpis.criados.variacaoPct).toBeNull()
    expect(d.indicadores.ticketMedio).toBeNull()
    expect(d.indicadores.taxaConversao).toBeNull()
    expect(d.ultimosOrcamentos).toEqual([])
    expect(d.orcamentosPorMes).toHaveLength(12)
    expect(d.orcamentosPorMes.every(m => m.quantidade === 0)).toBe(true)
  })

  it('conta KPIs por status e exclui obras fora do período', () => {
    const d = calcularDashboard(
      [
        obra({ status: 'enviado' }),
        obra({ status: 'aprovado' }),
        obra({ status: 'em_execucao' }),
        obra({ status: 'cancelado' }),
        obra({ status: 'aprovado', data_orcamento: '2026-01-05' }), // fora dos 30d
      ],
      INTERVALO_30D,
      AGORA
    )
    expect(d.kpis.criados.valor).toBe(4)
    expect(d.kpis.emAnalise.valor).toBe(1)
    expect(d.kpis.aprovados.valor).toBe(2)   // aprovado + em_execucao
    expect(d.kpis.cancelados.valor).toBe(1)
    expect(d.kpis.valorOrcado.valor).toBe(6000)   // 4 × 1500
    expect(d.kpis.valorAprovado.valor).toBe(3000) // 2 × 1500
  })

  it('calcula variação vs período anterior e null quando base zero', () => {
    const d = calcularDashboard(
      [obra(), obra(), obra({ data_orcamento: '2026-05-20' })], // 2 no período, 1 no anterior
      INTERVALO_30D,
      AGORA
    )
    expect(d.kpis.criados.valor).toBe(2)
    expect(d.kpis.criados.variacaoPct).toBeCloseTo(100)
    // nada cancelado em nenhum período → variação null
    expect(d.kpis.cancelados.variacaoPct).toBeNull()
  })

  it('séries mensais usam o ano corrente ignorando o filtro', () => {
    const d = calcularDashboard(
      [obra({ data_orcamento: '2026-01-10' }), obra({ data_orcamento: '2026-01-15' }), obra({ data_orcamento: '2025-06-10' })],
      INTERVALO_30D,
      AGORA
    )
    expect(d.orcamentosPorMes[0]).toEqual({ mes: 'Jan', quantidade: 2 })
    expect(d.orcamentosPorMes[5].quantidade).toBe(0) // obra de 2025 fora
    expect(d.evolucaoFinanceira[0].orcado).toBe(3000)
    expect(d.evolucaoFinanceira[0].custo).toBe(2000)
  })

  it('indicadores: ticket médio, maior, conversão e margem', () => {
    const grande: ObraDashboard['grupos_orcamento'] = [
      { itens_orcamento: [{ quantidade: 10, custo_unit_mao_obra: 200, custo_unit_material: 0, margem_mao_obra_pct: 50, margem_material_pct: 0 }] },
    ]
    const d = calcularDashboard(
      [obra({ status: 'enviado' }), obra({ status: 'aprovado', grupos_orcamento: grande })],
      INTERVALO_30D,
      AGORA
    )
    expect(d.indicadores.ticketMedio).toBe(2250)      // (1500+3000)/2
    expect(d.indicadores.maiorOrcamento).toBe(3000)
    expect(d.indicadores.taxaConversao).toBeCloseTo(50) // 1 aprovado / (1 enviado + 1 aprovado)
    expect(d.indicadores.margemMedia).toBeCloseTo(100 * 1500 / 4500) // Σlucro/Σvenda
  })

  it('tabela ordenada por data desc e top clientes por valor', () => {
    const d = calcularDashboard(
      [
        obra({ data_orcamento: '2026-06-10', clientes: { id: 'c1', razao_social: 'ACME' } }),
        obra({ data_orcamento: '2026-06-25', clientes: { id: 'c2', razao_social: 'Beta' } }),
        obra({ data_orcamento: '2026-06-20', clientes: { id: 'c2', razao_social: 'Beta' } }),
        obra({ data_orcamento: '2026-06-15', clientes: null }),
      ],
      INTERVALO_30D,
      AGORA
    )
    expect(d.ultimosOrcamentos[0].data).toBe('2026-06-25')
    expect(d.ultimosOrcamentos.map(l => l.data)).toEqual(['2026-06-25', '2026-06-20', '2026-06-15', '2026-06-10'])
    expect(d.ultimosOrcamentos[2].cliente).toBe('—')
    expect(d.topClientes[0]).toEqual({ nome: 'Beta', obras: 2, valor: 3000 })
    expect(d.topClientes[1]).toEqual({ nome: 'ACME', obras: 1, valor: 1500 })
  })

  it('statusDistribuicao só inclui status presentes no período', () => {
    const d = calcularDashboard([obra({ status: 'enviado' }), obra({ status: 'enviado' })], INTERVALO_30D, AGORA)
    expect(d.statusDistribuicao).toEqual([{ status: 'enviado', label: 'Enviado', quantidade: 2 }])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/dashboard/metricas.test.ts`
Expected: FAIL — módulo `./metricas` não existe.

- [ ] **Step 3: Implementar `lib/dashboard/metricas.ts`**

```typescript
import { calcularItem } from '@/lib/calculos'
import type { StatusObra } from '@/types/database'
import { dataReferenciaObra, type Intervalo } from './periodo'

// (colar aqui exatamente os tipos ObraDashboard, Kpi, LinhaOrcamento e
//  DashboardData do bloco "Interfaces" desta task)

export const STATUS_LABELS: Record<StatusObra, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
  em_execucao: 'Em execução',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

export const STATUS_APROVADOS: StatusObra[] = ['aprovado', 'em_execucao', 'concluido']

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function itensDaObra(obra: ObraDashboard) {
  return obra.grupos_orcamento.flatMap(g => g.itens_orcamento)
}

function calcularObra(obra: ObraDashboard): { venda: number; custo: number } {
  return itensDaObra(obra).reduce(
    (acc, item) => {
      const c = calcularItem({
        id: '', grupo_id: '', numero: 0, descricao: '', local: null,
        unidade_id: null, observacao: null, observacao_2: null, ordem: 0,
        ...item,
      })
      return { venda: acc.venda + c.total_venda, custo: acc.custo + c.total_custo }
    },
    { venda: 0, custo: 0 }
  )
}

export function totalVendaObra(obra: ObraDashboard): number {
  return calcularObra(obra).venda
}

export function totalCustoObra(obra: ObraDashboard): number {
  return calcularObra(obra).custo
}

export function variacaoPct(atual: number, anterior: number): number | null {
  if (anterior === 0) return null
  return ((atual - anterior) / anterior) * 100
}

function dentro(d: Date, inicio: Date, fim: Date): boolean {
  return d >= inicio && d <= fim
}

export function calcularDashboard(
  obras: ObraDashboard[],
  intervalo: Intervalo,
  agora: Date = new Date()
): DashboardData {
  const comData = obras.map(o => ({ obra: o, data: dataReferenciaObra(o), ...calcularObra(o) }))
  const atuais = comData.filter(x => dentro(x.data, intervalo.inicio, intervalo.fim))
  const anteriores = comData.filter(x => dentro(x.data, intervalo.inicioAnterior, intervalo.fimAnterior))

  const kpi = (
    filtro: (x: (typeof comData)[number]) => boolean,
    valorDe: (xs: (typeof comData)[number][]) => number
  ): Kpi => {
    const atual = valorDe(atuais.filter(filtro))
    const anterior = valorDe(anteriores.filter(filtro))
    return { valor: atual, variacaoPct: variacaoPct(atual, anterior) }
  }
  const contagem = (xs: (typeof comData)[number][]) => xs.length
  const somaVenda = (xs: (typeof comData)[number][]) => xs.reduce((s, x) => s + x.venda, 0)
  const ehAprovada = (x: (typeof comData)[number]) => STATUS_APROVADOS.includes(x.obra.status)

  // séries mensais — ano corrente
  const ano = agora.getFullYear()
  const doAno = comData.filter(x => x.data.getFullYear() === ano)
  const porMes = <T>(inicial: () => T, acumula: (t: T, x: (typeof comData)[number]) => T): T[] => {
    const arr = Array.from({ length: 12 }, inicial)
    for (const x of doAno) arr[x.data.getMonth()] = acumula(arr[x.data.getMonth()], x)
    return arr
  }

  const orcamentosPorMes = porMes(() => 0, (n) => n + 1).map((quantidade, i) => ({ mes: MESES[i], quantidade }))
  const evolucaoFinanceira = porMes(
    () => ({ orcado: 0, aprovado: 0, custo: 0 }),
    (t, x) => ({
      orcado: t.orcado + x.venda,
      aprovado: t.aprovado + (ehAprovada(x) ? x.venda : 0),
      custo: t.custo + x.custo,
    })
  ).map((t, i) => ({ mes: MESES[i], ...t }))
  const conversao = porMes(
    () => ({ criados: 0, enviados: 0, aprovados: 0 }),
    (t, x) => ({
      criados: t.criados + 1,
      enviados: t.enviados + (x.obra.status === 'enviado' ? 1 : 0),
      aprovados: t.aprovados + (ehAprovada(x) ? 1 : 0),
    })
  ).map((t, i) => ({ mes: MESES[i], ...t }))

  // indicadores do período
  const vendas = atuais.map(x => x.venda)
  const somaVendaAtual = somaVenda(atuais)
  const somaLucro = atuais.reduce((s, x) => s + (x.venda - x.custo), 0)
  const enviadosQtd = atuais.filter(x => x.obra.status === 'enviado').length
  const aprovadosQtd = atuais.filter(ehAprovada).length
  const denomConversao = enviadosQtd + aprovadosQtd

  const statusDistribuicao = (Object.keys(STATUS_LABELS) as StatusObra[])
    .map(status => ({
      status,
      label: STATUS_LABELS[status],
      quantidade: atuais.filter(x => x.obra.status === status).length,
    }))
    .filter(s => s.quantidade > 0)

  const ultimosOrcamentos: LinhaOrcamento[] = [...atuais]
    .sort((a, b) => b.data.getTime() - a.data.getTime())
    .map(x => ({
      id: x.obra.id,
      codigo: x.obra.codigo,
      cliente: x.obra.clientes?.razao_social ?? '—',
      obra: x.obra.nome,
      responsavel: x.obra.usuarios?.nome ?? '—',
      valor: x.venda,
      data: x.obra.data_orcamento ?? x.obra.criado_em.slice(0, 10),
      status: x.obra.status,
    }))

  const porCliente = new Map<string, { nome: string; obras: number; valor: number }>()
  for (const x of atuais) {
    if (!x.obra.clientes) continue
    const atual = porCliente.get(x.obra.clientes.id) ?? { nome: x.obra.clientes.razao_social, obras: 0, valor: 0 }
    porCliente.set(x.obra.clientes.id, { ...atual, obras: atual.obras + 1, valor: atual.valor + x.venda })
  }
  const topClientes = [...porCliente.values()].sort((a, b) => b.valor - a.valor).slice(0, 5)

  return {
    kpis: {
      criados: kpi(() => true, contagem),
      emAnalise: kpi(x => x.obra.status === 'enviado', contagem),
      aprovados: kpi(ehAprovada, contagem),
      cancelados: kpi(x => x.obra.status === 'cancelado', contagem),
      valorOrcado: kpi(() => true, somaVenda),
      valorAprovado: kpi(ehAprovada, somaVenda),
    },
    orcamentosPorMes,
    statusDistribuicao,
    evolucaoFinanceira,
    conversao,
    indicadores: {
      ticketMedio: vendas.length > 0 ? somaVendaAtual / vendas.length : null,
      maiorOrcamento: vendas.length > 0 ? Math.max(...vendas) : null,
      taxaConversao: denomConversao > 0 ? (aprovadosQtd / denomConversao) * 100 : null,
      margemMedia: somaVendaAtual > 0 ? (somaLucro / somaVendaAtual) * 100 : null,
    },
    ultimosOrcamentos,
    topClientes,
  }
}
```

Nota: o comentário "colar aqui os tipos" refere-se aos tipos do bloco **Interfaces** desta task — eles fazem parte do arquivo, escritos literalmente.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/dashboard/metricas.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm run test:run`
Expected: tudo verde (nada existente quebrado).

- [ ] **Step 6: Commit**

```bash
git add lib/dashboard/metricas.ts lib/dashboard/metricas.test.ts
git commit -m "feat: agregacao de metricas do dashboard reutilizando lib/calculos"
```

---

### Task 4: Tema claro/escuro global (ThemeProvider + ThemeToggle)

**Files:**
- Create: `components/layout/ThemeProvider.tsx`
- Create: `components/layout/ThemeToggle.tsx`
- Test: `components/layout/ThemeToggle.test.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `next-themes` (já em `package.json`), classe `.dark` já definida em `globals.css`.
- Produces: `<ThemeProvider>` envolvendo o app; `<ThemeToggle />` — botão que alterna light/dark, utilizável em qualquer header.

- [ ] **Step 1: Escrever o teste do toggle**

Criar `components/layout/ThemeToggle.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const setTheme = vi.fn()
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme }),
}))

import { ThemeToggle } from './ThemeToggle'

describe('ThemeToggle', () => {
  it('alterna para dark quando o tema atual é light', () => {
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button', { name: /alternar tema/i }))
    expect(setTheme).toHaveBeenCalledWith('dark')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run components/layout/ThemeToggle.test.tsx`
Expected: FAIL — módulo `./ThemeToggle` não existe.

- [ ] **Step 3: Implementar os componentes**

`components/layout/ThemeProvider.tsx`:

```typescript
'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  )
}
```

`components/layout/ThemeToggle.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Alternar tema"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      {montado && resolvedTheme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  )
}
```

Nota: se `components/ui/button.tsx` não aceitar `size="icon"`, usar `size="sm"` com `className="px-2"` — verificar as variants existentes no arquivo antes.

- [ ] **Step 4: Ligar o provider em `app/layout.tsx`**

Modificar o retorno para:

```typescript
import { ThemeProvider } from '@/components/layout/ThemeProvider'
// ... imports existentes inalterados

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
```

(`suppressHydrationWarning` é obrigatório — o next-themes injeta a classe no `<html>` antes da hidratação.)

- [ ] **Step 5: Rodar teste e ver passar**

Run: `npx vitest run components/layout/ThemeToggle.test.tsx`
Expected: PASS.

- [ ] **Step 6: Verificação manual rápida**

Run: `npm run dev` → abrir `localhost:3000/login`, no console do browser rodar `document.documentElement.classList.add('dark')` e confirmar que a página escurece (tokens `.dark` ativos). Remover a classe depois.

- [ ] **Step 7: Commit**

```bash
git add components/layout/ThemeProvider.tsx components/layout/ThemeToggle.tsx components/layout/ThemeToggle.test.tsx app/layout.tsx
git commit -m "feat: tema claro/escuro global com next-themes"
```

---

### Task 5: Sidebar redesenhada

**Files:**
- Create: `components/layout/Sidebar.tsx`
- Modify: `app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `MARCA` de `@/components/auth/marca`; tokens `--sidebar-*` do `globals.css`; POST `/api/auth/logout` (existente).
- Produces: `<Sidebar usuario={{ nome: string; papel: Papel }} />` — client component com menu (Dashboard, Obras), colapsável (localStorage `sidebar-colapsada`), drawer no mobile, perfil e Sair no rodapé.

- [ ] **Step 1: Implementar `components/layout/Sidebar.tsx`**

```typescript
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2, LayoutDashboard, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X,
} from 'lucide-react'
import { MARCA } from '@/components/auth/marca'
import type { Papel } from '@/types/database'

const PAPEL_LABELS: Record<Papel, string> = {
  admin: 'Administrador',
  engenheiro: 'Engenheiro',
  orcamentista: 'Orçamentista',
  visualizador: 'Visualizador',
}

const ITENS = [
  { href: '/dashboard', label: 'Dashboard', Icone: LayoutDashboard },
  { href: '/obras', label: 'Obras', Icone: Building2 },
]

export function Sidebar({ usuario }: { usuario: { nome: string; papel: Papel } }) {
  const pathname = usePathname()
  const [colapsada, setColapsada] = useState(false)
  const [drawerAberto, setDrawerAberto] = useState(false)

  useEffect(() => {
    setColapsada(localStorage.getItem('sidebar-colapsada') === 'true')
  }, [])

  function alternarColapso() {
    const nova = !colapsada
    setColapsada(nova)
    localStorage.setItem('sidebar-colapsada', String(nova))
  }

  const iniciais = usuario.nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase())
    .join('')

  const conteudo = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-sidebar-border p-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-600">
          <Building2 className="size-5 text-white" aria-hidden="true" />
        </div>
        {!colapsada && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{MARCA.nome}</p>
            <p className="truncate text-xs text-muted-foreground">{MARCA.subtitulo}</p>
          </div>
        )}
      </div>

      {/* Menu */}
      <nav className="flex-1 space-y-1 p-2">
        {ITENS.map(({ href, label, Icone }) => {
          const ativo = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              title={colapsada ? label : undefined}
              onClick={() => setDrawerAberto(false)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                ativo
                  ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }`}
            >
              <Icone className="size-5 shrink-0" aria-hidden="true" />
              {!colapsada && label}
            </Link>
          )
        })}
      </nav>

      {/* Colapsar (só desktop) */}
      <button
        type="button"
        onClick={alternarColapso}
        className="mx-2 mb-2 hidden items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent md:flex"
        aria-label={colapsada ? 'Expandir menu' : 'Recolher menu'}
      >
        {colapsada ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
        {!colapsada && 'Recolher'}
      </button>

      {/* Perfil */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
            {iniciais}
          </div>
          {!colapsada && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{usuario.nome}</p>
              <p className="truncate text-xs text-muted-foreground">{PAPEL_LABELS[usuario.papel]}</p>
            </div>
          )}
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              title="Sair"
              aria-label="Sair"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-destructive"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Botão hambúrguer mobile */}
      <button
        type="button"
        onClick={() => setDrawerAberto(true)}
        aria-label="Abrir menu"
        className="fixed left-4 top-4 z-40 rounded-xl border border-border bg-card p-2 shadow-sm md:hidden"
      >
        <Menu className="size-5" />
      </button>

      {/* Drawer mobile */}
      {drawerAberto && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerAberto(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-sidebar-border">
            <button
              type="button"
              onClick={() => setDrawerAberto(false)}
              aria-label="Fechar menu"
              className="absolute right-2 top-2 z-10 rounded-lg p-2 text-muted-foreground"
            >
              <X className="size-5" />
            </button>
            {conteudo}
          </aside>
        </div>
      )}

      {/* Sidebar desktop */}
      <aside
        className={`hidden shrink-0 border-r border-sidebar-border transition-all md:block ${
          colapsada ? 'w-16' : 'w-60'
        }`}
      >
        {conteudo}
      </aside>
    </>
  )
}
```

- [ ] **Step 2: Usar a Sidebar em `app/(app)/layout.tsx`**

Substituir o conteúdo do arquivo por:

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import type { Papel } from '@/types/database'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('nome, papel')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        usuario={{
          nome: usuario?.nome ?? 'Usuário',
          papel: (usuario?.papel ?? 'visualizador') as Papel,
        }}
      />
      <main className="min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: Verificação manual**

Run: `npm run dev` → logar e conferir: sidebar nova em `/obras`; recolher persiste após F5; em viewport 375px vira hambúrguer + drawer; Sair funciona.

- [ ] **Step 4: Rodar a suíte**

Run: `npm run test:run`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add components/layout/Sidebar.tsx "app/(app)/layout.tsx"
git commit -m "feat: sidebar redesenhada com colapso, drawer mobile e perfil"
```

---

### Task 6: `CardKpi` + `HeaderDashboard`

**Files:**
- Create: `components/dashboard/CardKpi.tsx`
- Test: `components/dashboard/CardKpi.test.tsx`
- Create: `components/dashboard/HeaderDashboard.tsx`

**Interfaces:**
- Consumes: `PeriodoKey`, `PERIODO_LABELS`, `parsePeriodo` de `@/lib/dashboard/periodo`; `ThemeToggle` da Task 4.
- Produces:
  - `<CardKpi titulo valor variacaoPct icone cor />` — `valor: string` (já formatado), `variacaoPct: number | null`, `icone: LucideIcon`, `cor: 'azul' | 'laranja' | 'verde' | 'vermelho' | 'roxo'`.
  - `<HeaderDashboard periodo={PeriodoKey} usuario={{ nome: string }} />` — título, seletor de período (navega para `/dashboard?periodo=X` preservando nada mais), busca (escreve `?busca=` com debounce 300ms via `router.replace`), botão "Novo Orçamento" (`/obras?novo=1`), botões Exportar Excel (link `/api/dashboard/export?periodo=X`) e PDF (`window.print()`), `ThemeToggle`, avatar de iniciais.
  - A busca é lida pela tabela (Task 8) via `useSearchParams().get('busca')`.

- [ ] **Step 1: Escrever teste do CardKpi**

Criar `components/dashboard/CardKpi.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FileText } from 'lucide-react'
import { CardKpi } from './CardKpi'

describe('CardKpi', () => {
  it('mostra título, valor e variação positiva', () => {
    render(<CardKpi titulo="Orçamentos Criados" valor="245" variacaoPct={12.3} icone={FileText} cor="azul" />)
    expect(screen.getByText('Orçamentos Criados')).toBeInTheDocument()
    expect(screen.getByText('245')).toBeInTheDocument()
    expect(screen.getByText(/↑\s*12,3%/)).toBeInTheDocument()
  })
  it('mostra variação negativa com seta para baixo', () => {
    render(<CardKpi titulo="Cancelados" valor="45" variacaoPct={-3} icone={FileText} cor="vermelho" />)
    expect(screen.getByText(/↓\s*3,0%/)).toBeInTheDocument()
  })
  it('mostra travessão quando variação é null', () => {
    render(<CardKpi titulo="Em Análise" valor="38" variacaoPct={null} icone={FileText} cor="laranja" />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run components/dashboard/CardKpi.test.tsx`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `components/dashboard/CardKpi.tsx`**

```typescript
import type { LucideIcon } from 'lucide-react'

const CORES = {
  azul: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  laranja: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  verde: 'bg-green-500/10 text-green-600 dark:text-green-400',
  vermelho: 'bg-red-500/10 text-red-600 dark:text-red-400',
  roxo: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
} as const

interface CardKpiProps {
  titulo: string
  valor: string
  variacaoPct: number | null
  icone: LucideIcon
  cor: keyof typeof CORES
}

function fmtVariacao(v: number): string {
  return `${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

export function CardKpi({ titulo, valor, variacaoPct, icone: Icone, cor }: CardKpiProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{titulo}</p>
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${CORES[cor]}`}>
          <Icone className="size-5" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-2 truncate text-2xl font-bold tracking-tight" title={valor}>{valor}</p>
      <p className="mt-1 text-xs">
        {variacaoPct === null ? (
          <span className="text-muted-foreground">—</span>
        ) : variacaoPct >= 0 ? (
          <span className="font-medium text-green-600 dark:text-green-400">↑ {fmtVariacao(variacaoPct)}</span>
        ) : (
          <span className="font-medium text-red-600 dark:text-red-400">↓ {fmtVariacao(variacaoPct)}</span>
        )}
        <span className="ml-1 text-muted-foreground">vs período anterior</span>
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run components/dashboard/CardKpi.test.tsx`
Expected: PASS (3 testes).

- [ ] **Step 5: Implementar `components/dashboard/HeaderDashboard.tsx`**

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FileDown, Plus, Printer, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { PERIODO_LABELS, type PeriodoKey } from '@/lib/dashboard/periodo'

export function HeaderDashboard({ periodo, usuario }: { periodo: PeriodoKey; usuario: { nome: string } }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [busca, setBusca] = useState(searchParams.get('busca') ?? '')
  const primeiraRenderizacao = useRef(true)

  useEffect(() => {
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false
      return
    }
    const t = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (busca) params.set('busca', busca)
      else params.delete('busca')
      router.replace(`/dashboard?${params.toString()}`, { scroll: false })
    }, 300)
    return () => clearTimeout(t)
    // searchParams fora das deps de propósito: só reagimos à digitação
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca])

  function mudarPeriodo(novo: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('periodo', novo ?? '30d')
    router.push(`/dashboard?${params.toString()}`)
  }

  const iniciais = usuario.nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('')

  return (
    <header className="no-print flex flex-wrap items-center gap-3">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>

      <Select value={periodo} onValueChange={mudarPeriodo}>
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(PERIODO_LABELS) as PeriodoKey[]).map(k => (
            <SelectItem key={k} value={k}>{PERIODO_LABELS[k]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="relative min-w-48 flex-1 md:max-w-xs">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar orçamento..."
          className="pl-9"
          aria-label="Buscar orçamento"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <a href={`/api/dashboard/export?periodo=${periodo}`}>
            <FileDown className="mr-1 size-4" /> Excel
          </a>
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-1 size-4" /> PDF
        </Button>
        <Button size="sm" onClick={() => router.push('/obras?novo=1')}>
          <Plus className="mr-1 size-4" /> Novo Orçamento
        </Button>
        <ThemeToggle />
        <div
          className="flex size-9 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white"
          title={usuario.nome}
        >
          {iniciais}
        </div>
      </div>
    </header>
  )
}
```

Notas:
- Se `components/ui/button.tsx` não tiver a prop `asChild`, trocar o botão Excel por um `<a>` estilizado com as mesmas classes do `Button variant="outline"` — verificar o arquivo antes.
- `/obras?novo=1`: adicionar na Task 9 (passo dedicado) o suporte a esse parâmetro na página de obras.

- [ ] **Step 6: Rodar a suíte**

Run: `npm run test:run`
Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/CardKpi.tsx components/dashboard/CardKpi.test.tsx components/dashboard/HeaderDashboard.tsx
git commit -m "feat: card de KPI e header do dashboard com filtro de periodo"
```

---

### Task 7: Os 4 gráficos Recharts

**Files:**
- Create: `components/dashboard/CardGrafico.tsx`
- Create: `components/dashboard/GraficoBarrasMensal.tsx`
- Create: `components/dashboard/GraficoPizzaStatus.tsx`
- Create: `components/dashboard/GraficoLinhaFinanceiro.tsx`
- Create: `components/dashboard/GraficoAreaConversao.tsx`

**Interfaces:**
- Consumes: tipos das séries de `DashboardData` (Task 3); `fmt` de `@/lib/format`; CSS vars `--chart-1..5` (Task 1).
- Produces: 4 client components que recebem a série pronta por props e renderizam dentro de `CardGrafico` (card com título e empty state embutido):
  - `<GraficoBarrasMensal dados={orcamentosPorMes} />`
  - `<GraficoPizzaStatus dados={statusDistribuicao} />`
  - `<GraficoLinhaFinanceiro dados={evolucaoFinanceira} />`
  - `<GraficoAreaConversao dados={conversao} />`

- [ ] **Step 1: Implementar `components/dashboard/CardGrafico.tsx`** (wrapper compartilhado)

```typescript
export function CardGrafico({
  titulo, vazio, children,
}: { titulo: string; vazio: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold">{titulo}</h2>
      {vazio ? (
        <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
          Nenhum orçamento neste período
        </div>
      ) : (
        <div className="h-72">{children}</div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Implementar `GraficoBarrasMensal.tsx`**

```typescript
'use client'

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CardGrafico } from './CardGrafico'

export function GraficoBarrasMensal({ dados }: { dados: { mes: string; quantidade: number }[] }) {
  const vazio = dados.every(d => d.quantidade === 0)
  return (
    <CardGrafico titulo="Orçamentos por Mês" vazio={vazio}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="mes" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: 'var(--muted)' }}
            contentStyle={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--popover-foreground)' }}
          />
          <Legend />
          <Bar dataKey="quantidade" name="Orçamentos" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </CardGrafico>
  )
}
```

- [ ] **Step 3: Implementar `GraficoPizzaStatus.tsx`**

```typescript
'use client'

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { StatusObra } from '@/types/database'
import { CardGrafico } from './CardGrafico'

const COR_POR_STATUS: Record<StatusObra, string> = {
  rascunho: 'var(--muted-foreground)',
  enviado: 'var(--chart-3)',
  aprovado: 'var(--chart-2)',
  em_execucao: 'var(--chart-1)',
  concluido: 'var(--chart-5)',
  cancelado: 'var(--chart-4)',
}

export function GraficoPizzaStatus({
  dados,
}: { dados: { status: StatusObra; label: string; quantidade: number }[] }) {
  const total = dados.reduce((s, d) => s + d.quantidade, 0)
  return (
    <CardGrafico titulo="Status dos Orçamentos" vazio={total === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={dados}
            dataKey="quantidade"
            nameKey="label"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={3}
            label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
          >
            {dados.map(d => (
              <Cell key={d.status} fill={COR_POR_STATUS[d.status]} stroke="var(--card)" />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--popover-foreground)' }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </CardGrafico>
  )
}
```

- [ ] **Step 4: Implementar `GraficoLinhaFinanceiro.tsx`**

```typescript
'use client'

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmt } from '@/lib/format'
import { CardGrafico } from './CardGrafico'

export function GraficoLinhaFinanceiro({
  dados,
}: { dados: { mes: string; orcado: number; aprovado: number; custo: number }[] }) {
  const vazio = dados.every(d => d.orcado === 0 && d.aprovado === 0 && d.custo === 0)
  const fmtEixo = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))
  return (
    <CardGrafico titulo="Evolução Financeira" vazio={vazio}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dados}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="mes" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={fmtEixo} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            formatter={(v: number | string) => `R$ ${fmt(Number(v))}`}
            contentStyle={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--popover-foreground)' }}
          />
          <Legend />
          <Line type="monotone" dataKey="orcado" name="Valor orçado" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="aprovado" name="Valor aprovado" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="custo" name="Custo previsto" stroke="var(--chart-3)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </CardGrafico>
  )
}
```

- [ ] **Step 5: Implementar `GraficoAreaConversao.tsx`**

```typescript
'use client'

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CardGrafico } from './CardGrafico'

export function GraficoAreaConversao({
  dados,
}: { dados: { mes: string; criados: number; enviados: number; aprovados: number }[] }) {
  const vazio = dados.every(d => d.criados === 0)
  return (
    <CardGrafico titulo="Conversão de Orçamentos" vazio={vazio}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={dados}>
          <defs>
            {(['criados', 'enviados', 'aprovados'] as const).map((k, i) => (
              <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`var(--chart-${i + 1})`} stopOpacity={0.35} />
                <stop offset="100%" stopColor={`var(--chart-${i + 1})`} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="mes" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--popover-foreground)' }}
          />
          <Legend />
          <Area type="monotone" dataKey="criados" name="Criados" stroke="var(--chart-1)" fill="url(#grad-criados)" strokeWidth={2} />
          <Area type="monotone" dataKey="enviados" name="Enviados" stroke="var(--chart-2)" fill="url(#grad-enviados)" strokeWidth={2} />
          <Area type="monotone" dataKey="aprovados" name="Aprovados" stroke="var(--chart-3)" fill="url(#grad-aprovados)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </CardGrafico>
  )
}
```

- [ ] **Step 6: Verificar compilação TS**

Run: `npx tsc --noEmit`
Expected: sem erros (componentes ainda não usados na página; render visual é verificada na Task 9).

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/CardGrafico.tsx components/dashboard/Grafico*.tsx
git commit -m "feat: graficos do dashboard (barras, pizza, linha e area)"
```

---

### Task 8: Tabela de últimos orçamentos + Top Clientes + Atividades Recentes

**Files:**
- Create: `components/dashboard/TabelaUltimosOrcamentos.tsx`
- Test: `components/dashboard/TabelaUltimosOrcamentos.test.tsx`
- Create: `components/dashboard/TopClientes.tsx`
- Create: `components/dashboard/AtividadesRecentes.tsx`

**Interfaces:**
- Consumes: `LinhaOrcamento`, `STATUS_LABELS` de `@/lib/dashboard/metricas`; `fmt` de `@/lib/format`; DELETE `/api/obras/[id]` (existente); `useSearchParams` para busca do header (Task 6).
- Produces:
  - `<TabelaUltimosOrcamentos linhas={LinhaOrcamento[]} podeExcluir={boolean} />` — ordenação por coluna, filtro de status, busca via URL, paginação 10/página, ações.
  - `<TopClientes clientes={{ nome; obras; valor }[]} />`
  - `<AtividadesRecentes atividades={Atividade[]} />` onde `type Atividade = { id: string; usuario: string; campo: string; valorNovo: string | null; obraCodigo: string; obraNome: string; quando: string }` (exportado deste arquivo).

- [ ] **Step 1: Escrever testes da tabela**

Criar `components/dashboard/TabelaUltimosOrcamentos.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { LinhaOrcamento } from '@/lib/dashboard/metricas'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

import { TabelaUltimosOrcamentos } from './TabelaUltimosOrcamentos'

function linha(over: Partial<LinhaOrcamento>): LinhaOrcamento {
  return {
    id: over.id ?? '1', codigo: '08114', cliente: 'ACME', obra: 'Obra X',
    responsavel: 'João', valor: 1000, data: '2026-06-20', status: 'enviado',
    ...over,
  }
}

describe('TabelaUltimosOrcamentos', () => {
  it('mostra empty state sem linhas', () => {
    render(<TabelaUltimosOrcamentos linhas={[]} podeExcluir={false} />)
    expect(screen.getByText(/nenhum orçamento/i)).toBeInTheDocument()
  })

  it('ordena por valor ao clicar no cabeçalho', () => {
    render(
      <TabelaUltimosOrcamentos
        linhas={[linha({ id: '1', codigo: 'A1', valor: 100 }), linha({ id: '2', codigo: 'B2', valor: 900 })]}
        podeExcluir={false}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /^valor$/i }))
    const celulas = screen.getAllByRole('row').slice(1) // pula o header
    expect(within(celulas[0]).getByText('B2')).toBeInTheDocument()
  })

  it('filtra por status', () => {
    render(
      <TabelaUltimosOrcamentos
        linhas={[linha({ id: '1', codigo: 'A1', status: 'aprovado' }), linha({ id: '2', codigo: 'B2', status: 'cancelado' })]}
        podeExcluir={false}
      />
    )
    fireEvent.change(screen.getByLabelText(/filtrar por status/i), { target: { value: 'aprovado' } })
    expect(screen.getByText('A1')).toBeInTheDocument()
    expect(screen.queryByText('B2')).not.toBeInTheDocument()
  })

  it('pagina em 10 linhas', () => {
    const linhas = Array.from({ length: 12 }, (_, i) => linha({ id: String(i), codigo: `C${i}` }))
    render(<TabelaUltimosOrcamentos linhas={linhas} podeExcluir={false} />)
    expect(screen.getAllByRole('row')).toHaveLength(11) // header + 10
    fireEvent.click(screen.getByRole('button', { name: /próxima/i }))
    expect(screen.getAllByRole('row')).toHaveLength(3) // header + 2
  })

  it('esconde a ação excluir sem permissão', () => {
    render(<TabelaUltimosOrcamentos linhas={[linha({})]} podeExcluir={false} />)
    expect(screen.queryByLabelText(/excluir/i)).not.toBeInTheDocument()
  })
})
```

Nota: o filtro de status usa um `<select>` HTML nativo (com `aria-label="Filtrar por status"`) em vez do Select do shadcn para simplificar o teste com `fireEvent.change` — visual compensado com classes Tailwind.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run components/dashboard/TabelaUltimosOrcamentos.test.tsx`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `TabelaUltimosOrcamentos.tsx`**

```typescript
'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowUpDown, Eye, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { STATUS_LABELS, type LinhaOrcamento } from '@/lib/dashboard/metricas'
import { fmt } from '@/lib/format'
import type { StatusObra } from '@/types/database'

const BADGE: Record<StatusObra, string> = {
  rascunho: 'bg-gray-500/10 text-gray-600 dark:text-gray-300',
  enviado: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  aprovado: 'bg-green-500/10 text-green-600 dark:text-green-400',
  em_execucao: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  concluido: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  cancelado: 'bg-red-500/10 text-red-600 dark:text-red-400',
}

type Coluna = 'codigo' | 'cliente' | 'obra' | 'responsavel' | 'valor' | 'data' | 'status'
const COLUNAS: { chave: Coluna; rotulo: string; classe?: string }[] = [
  { chave: 'codigo', rotulo: 'Número' },
  { chave: 'cliente', rotulo: 'Cliente' },
  { chave: 'obra', rotulo: 'Obra' },
  { chave: 'responsavel', rotulo: 'Responsável' },
  { chave: 'valor', rotulo: 'Valor', classe: 'text-right' },
  { chave: 'data', rotulo: 'Data' },
  { chave: 'status', rotulo: 'Status' },
]

const POR_PAGINA = 10

export function TabelaUltimosOrcamentos({
  linhas, podeExcluir,
}: { linhas: LinhaOrcamento[]; podeExcluir: boolean }) {
  const router = useRouter()
  const busca = (useSearchParams().get('busca') ?? '').toLowerCase()
  const [ordem, setOrdem] = useState<{ coluna: Coluna; asc: boolean }>({ coluna: 'data', asc: false })
  const [filtroStatus, setFiltroStatus] = useState('')
  const [pagina, setPagina] = useState(0)
  const [excluindo, setExcluindo] = useState<LinhaOrcamento | null>(null)
  const [salvando, setSalvando] = useState(false)

  const filtradas = useMemo(() => {
    let r = linhas
    if (filtroStatus) r = r.filter(l => l.status === filtroStatus)
    if (busca) {
      r = r.filter(l =>
        [l.codigo, l.cliente, l.obra, l.responsavel].some(c => c.toLowerCase().includes(busca))
      )
    }
    const { coluna, asc } = ordem
    return [...r].sort((a, b) => {
      const va = a[coluna] ?? ''
      const vb = b[coluna] ?? ''
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'pt-BR')
      return asc ? cmp : -cmp
    })
  }, [linhas, filtroStatus, busca, ordem])

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas - 1)
  const visiveis = filtradas.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA)

  function ordenarPor(coluna: Coluna) {
    setOrdem(o => (o.coluna === coluna ? { coluna, asc: !o.asc } : { coluna, asc: true }))
    setPagina(0)
  }

  async function confirmarExclusao() {
    if (!excluindo) return
    setSalvando(true)
    await fetch(`/api/obras/${excluindo.id}`, { method: 'DELETE' })
    setSalvando(false)
    setExcluindo(null)
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Últimos Orçamentos</h2>
        <select
          aria-label="Filtrar por status"
          value={filtroStatus}
          onChange={e => { setFiltroStatus(e.target.value); setPagina(0) }}
          className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
        >
          <option value="">Todos os status</option>
          {(Object.keys(STATUS_LABELS) as StatusObra[]).map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {filtradas.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhum orçamento encontrado neste período.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  {COLUNAS.map(c => (
                    <th key={c.chave} className={`px-3 py-2 font-medium ${c.classe ?? ''}`}>
                      <button
                        type="button"
                        onClick={() => ordenarPor(c.chave)}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {c.rotulo}
                        <ArrowUpDown className="size-3" aria-hidden="true" />
                      </button>
                    </th>
                  ))}
                  <th className="px-3 py-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map(l => (
                  <tr key={l.id} className="border-b border-border/50 transition-colors hover:bg-muted/50">
                    <td className="px-3 py-2.5 font-mono text-xs">{l.codigo}</td>
                    <td className="px-3 py-2.5">{l.cliente}</td>
                    <td className="max-w-48 truncate px-3 py-2.5 font-medium" title={l.obra}>{l.obra}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{l.responsavel}</td>
                    <td className="px-3 py-2.5 text-right font-mono">R$ {fmt(l.valor)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {l.data ? new Date(l.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[l.status]}`}>
                        {STATUS_LABELS[l.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
                        <button type="button" aria-label={`Visualizar ${l.codigo}`} title="Visualizar"
                          onClick={() => router.push(`/obras/${l.id}`)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                          <Eye className="size-4" />
                        </button>
                        <button type="button" aria-label={`Editar ${l.codigo}`} title="Editar"
                          onClick={() => router.push(`/obras/${l.id}`)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                          <Pencil className="size-4" />
                        </button>
                        {podeExcluir && (
                          <button type="button" aria-label={`Excluir ${l.codigo}`} title="Excluir"
                            onClick={() => setExcluindo(l)}
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600">
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>Página {paginaAtual + 1} de {totalPaginas} · {filtradas.length} orçamentos</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={paginaAtual === 0}
                onClick={() => setPagina(p => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={paginaAtual >= totalPaginas - 1}
                onClick={() => setPagina(p => p + 1)}>Próxima</Button>
            </div>
          </div>
        </>
      )}

      <Dialog open={excluindo !== null} onOpenChange={aberto => !aberto && setExcluindo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir orçamento</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Excluir o orçamento <strong>{excluindo?.codigo}</strong> ({excluindo?.obra})?
            Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExcluindo(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmarExclusao} disabled={salvando}>
              {salvando ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

Nota: se `Button` não tiver `variant="destructive"`, usar `className="bg-red-600 text-white hover:bg-red-700"` — verificar as variants antes.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run components/dashboard/TabelaUltimosOrcamentos.test.tsx`
Expected: PASS (5 testes).

- [ ] **Step 5: Implementar `TopClientes.tsx`**

```typescript
import { fmt } from '@/lib/format'

export function TopClientes({ clientes }: { clientes: { nome: string; obras: number; valor: number }[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold">Top Clientes</h2>
      {clientes.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhum cliente neste período.</p>
      ) : (
        <ul className="space-y-3">
          {clientes.map((c, i) => (
            <li key={c.nome} className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-xs font-semibold text-blue-600 dark:text-blue-400">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {c.obras} {c.obras === 1 ? 'obra' : 'obras'}
                </p>
              </div>
              <span className="font-mono text-sm">R$ {fmt(c.valor)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Implementar `AtividadesRecentes.tsx`**

```typescript
export interface Atividade {
  id: string
  usuario: string
  campo: string
  valorNovo: string | null
  obraCodigo: string
  obraNome: string
  quando: string // ISO timestamp
}

function descrever(a: Atividade): string {
  if (a.campo === 'status') return `alterou o status de ${a.obraCodigo} para "${a.valorNovo ?? '—'}"`
  return `alterou ${a.campo} em ${a.obraCodigo} — ${a.obraNome}`
}

export function AtividadesRecentes({ atividades }: { atividades: Atividade[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold">Atividades Recentes</h2>
      {atividades.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma atividade registrada.</p>
      ) : (
        <ol className="relative space-y-4 border-l border-border pl-4">
          {atividades.map(a => (
            <li key={a.id} className="relative">
              <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-blue-500" />
              <p className="text-sm">
                <span className="font-medium">{a.usuario}</span> {descrever(a)}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(a.quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Rodar a suíte**

Run: `npm run test:run`
Expected: verde.

- [ ] **Step 8: Commit**

```bash
git add components/dashboard/TabelaUltimosOrcamentos.tsx components/dashboard/TabelaUltimosOrcamentos.test.tsx components/dashboard/TopClientes.tsx components/dashboard/AtividadesRecentes.tsx
git commit -m "feat: tabela de ultimos orcamentos, top clientes e atividades"
```

---

### Task 9: Página `/dashboard` (montagem) + loading + error + `?novo=1` em obras

**Files:**
- Create: `app/(app)/dashboard/page.tsx`
- Create: `app/(app)/dashboard/loading.tsx`
- Create: `app/(app)/dashboard/error.tsx`
- Modify: `app/(app)/obras/page.tsx` (suporte a `?novo=1`)

**Interfaces:**
- Consumes: tudo das Tasks 2–8; `createClient` de `@/lib/supabase/server`; `fmt` de `@/lib/format`.
- Produces: rota `/dashboard` completa; `/obras?novo=1` abre o modal de criação automaticamente.

- [ ] **Step 1: Implementar `app/(app)/dashboard/page.tsx`**

```typescript
import { Banknote, CheckCircle2, Clock, FileText, Wallet, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { fmt, fmtPct } from '@/lib/format'
import { intervaloDoPeriodo, parsePeriodo } from '@/lib/dashboard/periodo'
import { calcularDashboard, type ObraDashboard } from '@/lib/dashboard/metricas'
import { HeaderDashboard } from '@/components/dashboard/HeaderDashboard'
import { CardKpi } from '@/components/dashboard/CardKpi'
import { GraficoBarrasMensal } from '@/components/dashboard/GraficoBarrasMensal'
import { GraficoPizzaStatus } from '@/components/dashboard/GraficoPizzaStatus'
import { GraficoLinhaFinanceiro } from '@/components/dashboard/GraficoLinhaFinanceiro'
import { GraficoAreaConversao } from '@/components/dashboard/GraficoAreaConversao'
import { TabelaUltimosOrcamentos } from '@/components/dashboard/TabelaUltimosOrcamentos'
import { TopClientes } from '@/components/dashboard/TopClientes'
import { AtividadesRecentes, type Atividade } from '@/components/dashboard/AtividadesRecentes'
import { RealtimeRefresh } from '@/components/dashboard/RealtimeRefresh'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; busca?: string }>
}) {
  const params = await searchParams
  const periodo = parsePeriodo(params.periodo)
  const intervalo = intervaloDoPeriodo(periodo)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: usuario }, { data: obras, error: erroObras }, { data: historico }] = await Promise.all([
    supabase.from('usuarios').select('nome, papel').eq('id', user!.id).single(),
    supabase.from('obras').select(`
      id, codigo, nome, status, data_orcamento, criado_em,
      clientes ( id, razao_social ),
      usuarios ( nome ),
      grupos_orcamento (
        itens_orcamento (
          quantidade, custo_unit_mao_obra, custo_unit_material,
          margem_mao_obra_pct, margem_material_pct
        )
      )
    `),
    supabase
      .from('historico_alteracoes')
      .select('id, campo, valor_novo, alterado_em, usuarios ( nome ), obras ( codigo, nome )')
      .order('alterado_em', { ascending: false })
      .limit(8),
  ])

  if (erroObras) throw new Error(`Falha ao carregar o dashboard: ${erroObras.message}`)

  const dados = calcularDashboard((obras ?? []) as unknown as ObraDashboard[], intervalo)

  const atividades: Atividade[] = (historico ?? []).map((h) => {
    const registro = h as unknown as {
      id: string; campo: string; valor_novo: string | null; alterado_em: string
      usuarios: { nome: string } | null
      obras: { codigo: string; nome: string } | null
    }
    return {
      id: registro.id,
      usuario: registro.usuarios?.nome ?? 'Alguém',
      campo: registro.campo,
      valorNovo: registro.valor_novo,
      obraCodigo: registro.obras?.codigo ?? '—',
      obraNome: registro.obras?.nome ?? '—',
      quando: registro.alterado_em,
    }
  })

  const { kpis, indicadores } = dados
  const moeda = (n: number) => `R$ ${fmt(n)}`

  return (
    <div className="space-y-6 p-6" id="area-impressao">
      <RealtimeRefresh />
      <HeaderDashboard periodo={periodo} usuario={{ nome: usuario?.nome ?? 'Usuário' }} />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <CardKpi titulo="Orçamentos Criados" valor={String(kpis.criados.valor)} variacaoPct={kpis.criados.variacaoPct} icone={FileText} cor="azul" />
        <CardKpi titulo="Em Análise" valor={String(kpis.emAnalise.valor)} variacaoPct={kpis.emAnalise.variacaoPct} icone={Clock} cor="laranja" />
        <CardKpi titulo="Aprovados" valor={String(kpis.aprovados.valor)} variacaoPct={kpis.aprovados.variacaoPct} icone={CheckCircle2} cor="verde" />
        <CardKpi titulo="Cancelados" valor={String(kpis.cancelados.valor)} variacaoPct={kpis.cancelados.variacaoPct} icone={XCircle} cor="vermelho" />
        <CardKpi titulo="Valor Total Orçado" valor={moeda(kpis.valorOrcado.valor)} variacaoPct={kpis.valorOrcado.variacaoPct} icone={Banknote} cor="roxo" />
        <CardKpi titulo="Valor Aprovado" valor={moeda(kpis.valorAprovado.valor)} variacaoPct={kpis.valorAprovado.variacaoPct} icone={Wallet} cor="verde" />
      </div>

      {/* Gráficos */}
      <div className="grid gap-6 lg:grid-cols-2">
        <GraficoBarrasMensal dados={dados.orcamentosPorMes} />
        <GraficoPizzaStatus dados={dados.statusDistribuicao} />
        <GraficoLinhaFinanceiro dados={dados.evolucaoFinanceira} />
        <GraficoAreaConversao dados={dados.conversao} />
      </div>

      {/* Indicadores menores */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { titulo: 'Ticket Médio', valor: indicadores.ticketMedio !== null ? moeda(indicadores.ticketMedio) : '—' },
          { titulo: 'Maior Orçamento', valor: indicadores.maiorOrcamento !== null ? moeda(indicadores.maiorOrcamento) : '—' },
          { titulo: 'Taxa de Conversão', valor: indicadores.taxaConversao !== null ? fmtPct(indicadores.taxaConversao) : '—' },
          { titulo: 'Margem Efetiva Média', valor: indicadores.margemMedia !== null ? fmtPct(indicadores.margemMedia) : '—' },
        ].map(i => (
          <div key={i.titulo} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs text-muted-foreground">{i.titulo}</p>
            <p className="mt-1 truncate text-xl font-bold tracking-tight" title={i.valor}>{i.valor}</p>
          </div>
        ))}
      </div>

      {/* Tabela + laterais */}
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TabelaUltimosOrcamentos linhas={dados.ultimosOrcamentos} podeExcluir={usuario?.papel === 'admin'} />
        </div>
        <div className="space-y-6">
          <TopClientes clientes={dados.topClientes} />
          <AtividadesRecentes atividades={atividades} />
        </div>
      </div>
    </div>
  )
}
```

Nota sobre o cast `as unknown as ObraDashboard[]`: o client Supabase sem types gerados tipa joins aninhados como arrays; o `select` acima retorna objetos únicos para `clientes`/`usuarios` (FK singular). O cast é o padrão já usado no projeto (ver `app/(app)/obras/page.tsx`). `RealtimeRefresh` é criado na Task 10 — até lá, deixar a linha `<RealtimeRefresh />` e o import comentados (descomentar na Task 10).

- [ ] **Step 2: Implementar `app/(app)/dashboard/loading.tsx`**

```typescript
function Bloco({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-muted ${className}`} />
}

export default function LoadingDashboard() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Bloco className="h-8 w-40" />
        <Bloco className="h-9 w-44" />
        <Bloco className="h-9 flex-1 md:max-w-xs" />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <Bloco key={i} className="h-32" />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => <Bloco key={i} className="h-80" />)}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Bloco className="h-96 xl:col-span-2" />
        <Bloco className="h-96" />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Implementar `app/(app)/dashboard/error.tsx`**

```typescript
'use client'

import { Button } from '@/components/ui/button'

export default function ErroDashboard({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-96 flex-col items-center justify-center gap-4 p-6">
      <p className="text-lg font-semibold">Não foi possível carregar o dashboard</p>
      <p className="text-sm text-muted-foreground">Verifique sua conexão e tente novamente.</p>
      <Button onClick={reset}>Tentar novamente</Button>
    </div>
  )
}
```

- [ ] **Step 4: Suportar `?novo=1` em `app/(app)/obras/page.tsx`**

No componente `ObrasPage` (client), adicionar após os `useState` existentes:

```typescript
const searchParams = useSearchParams()

useEffect(() => {
  if (searchParams.get('novo') === '1') abrirModal()
  // roda uma única vez na montagem
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

E acrescentar `useSearchParams` ao import de `next/navigation`. `abrirModal` já existe no arquivo.

- [ ] **Step 5: Verificação manual completa**

Run: `npm run dev` → logar e conferir em `/dashboard`:
1. KPIs e gráficos com números reais; trocar período muda KPIs/tabela mas não os gráficos mensais.
2. Busca do header filtra a tabela.
3. Toggle de tema alterna tudo sem flash; F5 mantém o tema.
4. "Novo Orçamento" abre o modal em `/obras`.
5. Skeleton aparece ao navegar (Network throttling ajuda a ver).
6. Viewports 375/768/1280px sem overflow horizontal.

- [ ] **Step 6: Rodar suíte e build**

Run: `npm run test:run` e depois `npm run build`
Expected: ambos verdes.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/dashboard/" "app/(app)/obras/page.tsx"
git commit -m "feat: pagina do dashboard com KPIs, graficos, tabela e laterais"
```

---

### Task 10: Realtime, export Excel e CSS de impressão

**Files:**
- Create: `components/dashboard/RealtimeRefresh.tsx`
- Create: `app/api/dashboard/export/route.ts`
- Modify: `app/globals.css` (regras `@media print`)
- Modify: `app/(app)/dashboard/page.tsx` (descomentar `RealtimeRefresh`)

**Interfaces:**
- Consumes: `createClient` de `@/lib/supabase/client` (browser) e de `@/lib/supabase/server`; `toast` de `sonner`; `calcularDashboard`/`STATUS_LABELS` da Task 3; `intervaloDoPeriodo`/`parsePeriodo` da Task 2; `exceljs`.
- Produces: atualização automática do dashboard em ~3s após mudanças; GET `/api/dashboard/export?periodo=X` → download `dashboard-<periodo>.xlsx`.

- [ ] **Step 1: Implementar `components/dashboard/RealtimeRefresh.tsx`**

```typescript
'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

const TABELAS = ['obras', 'grupos_orcamento', 'itens_orcamento']

export function RealtimeRefresh() {
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let canal = supabase.channel('dashboard-realtime')
    for (const tabela of TABELAS) {
      canal = canal.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tabela },
        () => {
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => {
            router.refresh()
            toast('Dados atualizados', { duration: 2000 })
          }, 2000)
        }
      )
    }
    canal.subscribe()
    return () => {
      if (timer.current) clearTimeout(timer.current)
      supabase.removeChannel(canal)
    }
  }, [router])

  return null
}
```

Pré-requisito de infra (uma vez, no painel do Supabase): Database → Replication → habilitar as tabelas `obras`, `grupos_orcamento`, `itens_orcamento` na publicação `supabase_realtime`. Sem isso o canal conecta mas não recebe eventos — anotar no PR/entrega.

Verificar também que o `<Toaster />` do sonner está montado; se não houver nenhum `<Toaster />` no projeto (buscar por `Toaster` em `app/`), adicionar em `app/layout.tsx` dentro do `<ThemeProvider>`, após `{children}`:

```typescript
import { Toaster } from '@/components/ui/sonner'
// ...
<ThemeProvider>{children}<Toaster /></ThemeProvider>
```

- [ ] **Step 2: Descomentar `RealtimeRefresh` na page**

Em `app/(app)/dashboard/page.tsx`, descomentar o import e o `<RealtimeRefresh />` deixados na Task 9.

- [ ] **Step 3: Implementar `app/api/dashboard/export/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { intervaloDoPeriodo, parsePeriodo, PERIODO_LABELS } from '@/lib/dashboard/periodo'
import { calcularDashboard, STATUS_LABELS, type ObraDashboard } from '@/lib/dashboard/metricas'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const periodo = parsePeriodo(request.nextUrl.searchParams.get('periodo') ?? undefined)
  const intervalo = intervaloDoPeriodo(periodo)

  const { data: obras, error } = await supabase.from('obras').select(`
    id, codigo, nome, status, data_orcamento, criado_em,
    clientes ( id, razao_social ),
    usuarios ( nome ),
    grupos_orcamento (
      itens_orcamento (
        quantidade, custo_unit_mao_obra, custo_unit_material,
        margem_mao_obra_pct, margem_material_pct
      )
    )
  `)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const dados = calcularDashboard((obras ?? []) as unknown as ObraDashboard[], intervalo)

  const wb = new ExcelJS.Workbook()
  const MOEDA = '_-* #,##0.00_-;\\-* #,##0.00_-;_-* "-"??_-;_-@_-'

  const resumo = wb.addWorksheet('Resumo')
  resumo.columns = [{ width: 32 }, { width: 22 }]
  resumo.addRow(['Dashboard de Orçamentos', ''])
  resumo.addRow(['Período', PERIODO_LABELS[periodo]])
  resumo.addRow([])
  resumo.addRow(['Orçamentos Criados', dados.kpis.criados.valor])
  resumo.addRow(['Em Análise', dados.kpis.emAnalise.valor])
  resumo.addRow(['Aprovados', dados.kpis.aprovados.valor])
  resumo.addRow(['Cancelados', dados.kpis.cancelados.valor])
  const linhaOrcado = resumo.addRow(['Valor Total Orçado', dados.kpis.valorOrcado.valor])
  const linhaAprovado = resumo.addRow(['Valor Aprovado', dados.kpis.valorAprovado.valor])
  linhaOrcado.getCell(2).numFmt = MOEDA
  linhaAprovado.getCell(2).numFmt = MOEDA
  resumo.getRow(1).font = { bold: true, size: 14 }

  const lista = wb.addWorksheet('Orçamentos')
  lista.columns = [
    { header: 'Número', key: 'codigo', width: 12 },
    { header: 'Cliente', key: 'cliente', width: 30 },
    { header: 'Obra', key: 'obra', width: 40 },
    { header: 'Responsável', key: 'responsavel', width: 22 },
    { header: 'Valor', key: 'valor', width: 16 },
    { header: 'Data', key: 'data', width: 12 },
    { header: 'Status', key: 'status', width: 14 },
  ]
  lista.getRow(1).font = { bold: true }
  for (const l of dados.ultimosOrcamentos) {
    const row = lista.addRow({ ...l, status: STATUS_LABELS[l.status] })
    row.getCell('valor').numFmt = MOEDA
  }

  const buffer = await wb.xlsx.writeBuffer()
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="dashboard-${periodo}.xlsx"`,
    },
  })
}
```

- [ ] **Step 4: CSS de impressão em `app/globals.css`**

Adicionar ao final do arquivo:

```css
@media print {
  aside,
  .no-print {
    display: none !important;
  }
  main {
    overflow: visible !important;
  }
  #area-impressao {
    padding: 0;
  }
  #area-impressao > div {
    break-inside: avoid;
  }
}
```

(O header já recebeu a classe `no-print` na Task 6; a sidebar é `aside`.)

- [ ] **Step 5: Verificação manual**

1. `/dashboard` → botão Excel baixa `dashboard-30d.xlsx`; abrir e conferir as duas abas e formatos monetários.
2. Botão PDF → prévia de impressão sem sidebar/controles.
3. Em outra aba, mudar o status de uma obra → dashboard atualiza sozinho em ~3s com toast (requer Replication habilitada).

- [ ] **Step 6: Suíte + build**

Run: `npm run test:run` e `npm run build`
Expected: verdes.

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/RealtimeRefresh.tsx app/api/dashboard/export/ app/globals.css "app/(app)/dashboard/page.tsx" app/layout.tsx
git commit -m "feat: realtime, export Excel e impressao do dashboard"
```

---

### Task 11: Verificação final contra os critérios de aceite

**Files:** nenhum novo — só verificação (correções pontuais se algo falhar).

- [ ] **Step 1: Rodar tudo**

Run: `npm run test:run` → tudo verde.
Run: `npm run build` → sem erros nem warnings de tipo.

- [ ] **Step 2: Percorrer os critérios de aceite da spec** (`docs/superpowers/specs/2026-07-04-dashboard-design.md`, seção 8)

Com `npm run dev` aberto, validar um a um os 9 critérios (dados reais por período; tema sem flash; números batendo com a tela de edição de orçamento; sidebar nova em todas as páginas; tabela completa; exports; realtime ~3s; responsivo 375/768/1280; suíte e build verdes). Corrigir inline o que falhar e commitar como `fix:`.

- [ ] **Step 3: Commit final (se houve correções) e encerramento**

Usar a skill superpowers:finishing-a-development-branch para decidir integração (o trabalho está na branch `master` — se o repositório passar a usar branches de feature, ajustar antes de começar a Task 1).

---

## Self-review do plano

- **Cobertura da spec:** período (T2), métricas (T3), tema (T4), sidebar (T5), header+KPIs (T6), gráficos (T7), tabela/top/atividades (T8), página+estados (T9), realtime+export+print (T10), aceite (T11). Top Engenheiros e Calendário: fora da v1 por decisão de spec.
- **Sem placeholders:** todo step de código tem o código completo; o único "colar aqui" (T3) referencia tipos escritos por extenso no bloco Interfaces da própria task.
- **Consistência de tipos:** `DashboardData`/`LinhaOrcamento`/`ObraDashboard` (T3) usados em T8/T9/T10 com os mesmos nomes; `PeriodoKey`/`PERIODO_LABELS` (T2) usados em T6/T10; `Atividade` definido em T8 e consumido em T9.
