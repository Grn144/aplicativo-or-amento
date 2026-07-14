# Banco de Composições — Fase B4 (Dashboard de Indicadores) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página `/composicoes/dashboard` com 4 KPIs, 2 gráficos e 3 listas mostrando a saúde e o uso da biblioteca de composições, com dados 100% reais do Supabase.

**Architecture:** Mesmo padrão do dashboard financeiro existente (`/dashboard`): Server Component consulta o Supabase e agrega tudo em funções puras (`lib/composicoes/dashboard-metricas.ts`), sem lógica de negócio duplicada em SQL. Um client component (`ComposicoesDashboardClient`) recebe os dados prontos e monta a UI, reaproveitando `ComposicaoModal` já existente (B1) para edição no local. `CardGrafico` (componente compartilhado com o dashboard financeiro) ganha um prop opcional para permitir mensagem de "vazio" customizada.

**Tech Stack:** Next.js 15 (App Router) + TypeScript, Supabase (Postgres), Recharts (já instalado), Tailwind + shadcn/ui, lucide-react, Vitest.

## Global Constraints

- Sem filtro de período nesta fase — o gráfico de uso mensal é sempre uma janela fixa dos últimos 12 meses (mês corrente incluso como o mais recente), nunca o ano-calendário fixo usado pelo dashboard financeiro.
- Sem export Excel/PDF próprio, sem link das listas para a biblioteca filtrada — as listas mostram a informação e abrem `ComposicaoModal` ao clicar; nada mais.
- As listas "Mais Utilizadas", "Nunca Utilizadas" e "Incompletas" mostram no máximo 10 itens cada. "Nunca Utilizadas" e "Incompletas" têm uma contagem total separada da lista (podem ter mais de 10) — a UI mostra "+N mais" quando `count > lista.length`. "Mais Utilizadas" é inerentemente um ranking top-10 (não um subconjunto filtrado de um total maior rastreado) — nunca mostra "+N mais".
- "Nunca Utilizadas" ordena por `criado_em` crescente (mais antigas primeiro). "Incompletas" ordena por `nome` alfabético. "Mais Utilizadas" ordena por `totalUsos` decrescente.
- "Itens com composição desatualizada" conta GLOBALMENTE (todas as obras) quantos `itens_orcamento` têm `composicao_versao < composicoes.versao` atual — comparação estrita, nunca inclui iguais.
- Nenhuma migration nova — todos os dados já existem nas tabelas de B1/B2.
- Empty state (nenhuma composição ativa) substitui a página inteira de indicadores, não só uma seção.

---

### Task 1: `lib/composicoes/dashboard-metricas.ts` — agregação pura

**Files:**
- Create: `lib/composicoes/dashboard-metricas.ts`
- Create: `lib/composicoes/dashboard-metricas.test.ts`

**Interfaces:**
- Consumes: `composicaoIncompleta` de `lib/composicoes/calculos.ts` (já existente, B5a).
- Produces: `calcularDashboardComposicoes(composicoes, usos, itensComComposicao, agora?)`, e os tipos `ComposicaoParaDashboard`, `UsoParaDashboard`, `ItemComComposicaoParaDashboard`, `DashboardComposicoesData`, `ItemMaisUtilizada`, `ItemNuncaUtilizada`, `ItemIncompleta` — usados pela Task 5 (a página) e pela Task 4 (o client component, só os tipos).

- [ ] **Step 1: Escrever os testes (falhando)**

Crie `lib/composicoes/dashboard-metricas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  calcularDashboardComposicoes,
  type ComposicaoParaDashboard,
  type UsoParaDashboard,
  type ItemComComposicaoParaDashboard,
} from './dashboard-metricas'

const AGORA = new Date(2026, 6, 15) // 15 de julho de 2026

describe('calcularDashboardComposicoes', () => {
  it('lista vazia: tudo zerado, usoMensal com 12 meses a 0', () => {
    const resultado = calcularDashboardComposicoes([], [], [], AGORA)

    expect(resultado.totalAtivas).toBe(0)
    expect(resultado.incompletas).toEqual({ count: 0, lista: [] })
    expect(resultado.nuncaUtilizadas).toEqual({ count: 0, lista: [] })
    expect(resultado.itensDesatualizados).toBe(0)
    expect(resultado.maisUtilizadas).toEqual([])
    expect(resultado.porDisciplina).toEqual([])
    expect(resultado.usoMensal).toEqual([
      { mes: 'Ago/25', quantidade: 0 },
      { mes: 'Set/25', quantidade: 0 },
      { mes: 'Out/25', quantidade: 0 },
      { mes: 'Nov/25', quantidade: 0 },
      { mes: 'Dez/25', quantidade: 0 },
      { mes: 'Jan/26', quantidade: 0 },
      { mes: 'Fev/26', quantidade: 0 },
      { mes: 'Mar/26', quantidade: 0 },
      { mes: 'Abr/26', quantidade: 0 },
      { mes: 'Mai/26', quantidade: 0 },
      { mes: 'Jun/26', quantidade: 0 },
      { mes: 'Jul/26', quantidade: 0 },
    ])
  })

  it('incompletas: XOR material/mão-de-obra, ordenadas por nome', () => {
    const composicoes: ComposicaoParaDashboard[] = [
      { id: 'a', codigo: 'A', nome: 'Composição A', disciplina_nome: null, criado_em: '2026-01-01T00:00:00Z', temMateriais: true, temMaoObra: false },
      { id: 'b', codigo: 'B', nome: 'Composição B', disciplina_nome: null, criado_em: '2026-01-01T00:00:00Z', temMateriais: false, temMaoObra: true },
      { id: 'c', codigo: 'C', nome: 'Composição C', disciplina_nome: null, criado_em: '2026-01-01T00:00:00Z', temMateriais: true, temMaoObra: true },
    ]

    const resultado = calcularDashboardComposicoes(composicoes, [], [], AGORA)

    expect(resultado.incompletas.count).toBe(2)
    expect(resultado.incompletas.lista).toEqual([
      { id: 'a', codigo: 'A', nome: 'Composição A', faltando: 'mao_obra' },
      { id: 'b', codigo: 'B', nome: 'Composição B', faltando: 'material' },
    ])
  })

  it('nunca utilizadas: total_usos === 0, ordenadas por criado_em crescente', () => {
    const composicoes: ComposicaoParaDashboard[] = [
      { id: 'x', codigo: 'X', nome: 'Composição X', disciplina_nome: null, criado_em: '2026-03-01T00:00:00Z', temMateriais: true, temMaoObra: true },
      { id: 'y', codigo: 'Y', nome: 'Composição Y', disciplina_nome: null, criado_em: '2026-01-01T00:00:00Z', temMateriais: true, temMaoObra: true },
      { id: 'z', codigo: 'Z', nome: 'Composição Z', disciplina_nome: null, criado_em: '2026-02-01T00:00:00Z', temMateriais: true, temMaoObra: true },
    ]
    const usos: UsoParaDashboard[] = [{ composicao_id: 'x', criado_em: '2026-04-01T00:00:00Z' }]

    const resultado = calcularDashboardComposicoes(composicoes, usos, [], AGORA)

    expect(resultado.nuncaUtilizadas.count).toBe(2)
    expect(resultado.nuncaUtilizadas.lista).toEqual([
      { id: 'y', codigo: 'Y', nome: 'Composição Y', criadoEm: '2026-01-01T00:00:00Z' },
      { id: 'z', codigo: 'Z', nome: 'Composição Z', criadoEm: '2026-02-01T00:00:00Z' },
    ])
  })

  it('distribuição por disciplina agrupa corretamente, incluindo sem disciplina', () => {
    const composicoes: ComposicaoParaDashboard[] = [
      { id: '1', codigo: '1', nome: 'C1', disciplina_nome: 'Alvenaria', criado_em: '2026-01-01T00:00:00Z', temMateriais: true, temMaoObra: true },
      { id: '2', codigo: '2', nome: 'C2', disciplina_nome: 'Alvenaria', criado_em: '2026-01-01T00:00:00Z', temMateriais: true, temMaoObra: true },
      { id: '3', codigo: '3', nome: 'C3', disciplina_nome: 'Elétrica', criado_em: '2026-01-01T00:00:00Z', temMateriais: true, temMaoObra: true },
      { id: '4', codigo: '4', nome: 'C4', disciplina_nome: null, criado_em: '2026-01-01T00:00:00Z', temMateriais: true, temMaoObra: true },
    ]

    const resultado = calcularDashboardComposicoes(composicoes, [], [], AGORA)

    expect(resultado.porDisciplina).toEqual([
      { nome: 'Alvenaria', quantidade: 2 },
      { nome: 'Elétrica', quantidade: 1 },
      { nome: 'Sem disciplina', quantidade: 1 },
    ])
  })

  it('série mensal preenche os últimos 12 meses, incluindo meses sem uso (=0), e ignora usos fora da janela', () => {
    const usos: UsoParaDashboard[] = [
      { composicao_id: 'a', criado_em: '2026-07-10T12:00:00Z' },
      { composicao_id: 'b', criado_em: '2025-08-05T12:00:00Z' },
      { composicao_id: 'c', criado_em: '2025-08-20T12:00:00Z' },
      { composicao_id: 'd', criado_em: '2025-07-01T12:00:00Z' },
    ]

    const resultado = calcularDashboardComposicoes([], usos, [], AGORA)

    expect(resultado.usoMensal).toEqual([
      { mes: 'Ago/25', quantidade: 2 },
      { mes: 'Set/25', quantidade: 0 },
      { mes: 'Out/25', quantidade: 0 },
      { mes: 'Nov/25', quantidade: 0 },
      { mes: 'Dez/25', quantidade: 0 },
      { mes: 'Jan/26', quantidade: 0 },
      { mes: 'Fev/26', quantidade: 0 },
      { mes: 'Mar/26', quantidade: 0 },
      { mes: 'Abr/26', quantidade: 0 },
      { mes: 'Mai/26', quantidade: 0 },
      { mes: 'Jun/26', quantidade: 0 },
      { mes: 'Jul/26', quantidade: 1 },
    ])
  })

  it('itens desatualizados: conta só quando composicao_versao < versao_atual (nunca igual ou maior)', () => {
    const itensComComposicao: ItemComComposicaoParaDashboard[] = [
      { composicao_versao: 1, versao_atual: 2 },
      { composicao_versao: 2, versao_atual: 2 },
      { composicao_versao: 3, versao_atual: 2 },
    ]

    const resultado = calcularDashboardComposicoes([], [], itensComComposicao, AGORA)

    expect(resultado.itensDesatualizados).toBe(1)
  })

  it('top-10 mais utilizadas ordena por totalUsos decrescente e corta em 10', () => {
    const composicoes: ComposicaoParaDashboard[] = Array.from({ length: 12 }, (_, i) => ({
      id: `c${i + 1}`, codigo: `COD-${i + 1}`, nome: `Composição ${i + 1}`,
      disciplina_nome: null, criado_em: '2026-01-01T00:00:00Z',
      temMateriais: true, temMaoObra: true,
    }))
    const usos: UsoParaDashboard[] = composicoes.flatMap((c, i) =>
      Array.from({ length: i + 1 }, () => ({ composicao_id: c.id, criado_em: '2026-01-15T00:00:00Z' }))
    )

    const resultado = calcularDashboardComposicoes(composicoes, usos, [], AGORA)

    expect(resultado.totalAtivas).toBe(12)
    expect(resultado.maisUtilizadas).toHaveLength(10)
    expect(resultado.maisUtilizadas.map(m => m.id)).toEqual(
      ['c12', 'c11', 'c10', 'c9', 'c8', 'c7', 'c6', 'c5', 'c4', 'c3']
    )
    expect(resultado.maisUtilizadas[0].totalUsos).toBe(12)
    expect(resultado.maisUtilizadas[9].totalUsos).toBe(3)
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run lib/composicoes/dashboard-metricas.test.ts`
Expected: FAIL — o módulo `./dashboard-metricas` não existe ainda.

- [ ] **Step 3: Implementar `lib/composicoes/dashboard-metricas.ts`**

```typescript
// lib/composicoes/dashboard-metricas.ts
import { composicaoIncompleta } from './calculos'

export interface ComposicaoParaDashboard {
  id: string
  codigo: string
  nome: string
  disciplina_nome: string | null
  criado_em: string
  temMateriais: boolean
  temMaoObra: boolean
}

export interface UsoParaDashboard {
  composicao_id: string
  criado_em: string
}

export interface ItemComComposicaoParaDashboard {
  composicao_versao: number
  versao_atual: number
}

export interface ComposicaoResumo {
  id: string
  codigo: string
  nome: string
}

export interface ItemMaisUtilizada extends ComposicaoResumo {
  totalUsos: number
}

export interface ItemNuncaUtilizada extends ComposicaoResumo {
  criadoEm: string
}

export interface ItemIncompleta extends ComposicaoResumo {
  faltando: 'material' | 'mao_obra'
}

export interface DashboardComposicoesData {
  totalAtivas: number
  incompletas: { count: number; lista: ItemIncompleta[] }
  nuncaUtilizadas: { count: number; lista: ItemNuncaUtilizada[] }
  itensDesatualizados: number
  maisUtilizadas: ItemMaisUtilizada[]
  porDisciplina: { nome: string; quantidade: number }[]
  usoMensal: { mes: string; quantidade: number }[]
}

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

/** Últimos 12 meses terminando no mês de `agora` (incluso), mais antigo primeiro. */
function ultimos12Meses(agora: Date): { ano: number; mes: number }[] {
  const resultado: { ano: number; mes: number }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1)
    resultado.push({ ano: d.getFullYear(), mes: d.getMonth() })
  }
  return resultado
}

export function calcularDashboardComposicoes(
  composicoes: ComposicaoParaDashboard[],
  usos: UsoParaDashboard[],
  itensComComposicao: ItemComComposicaoParaDashboard[],
  agora: Date = new Date()
): DashboardComposicoesData {
  const usosPorComposicao = new Map<string, number>()
  for (const u of usos) {
    usosPorComposicao.set(u.composicao_id, (usosPorComposicao.get(u.composicao_id) ?? 0) + 1)
  }

  const resumo = (c: ComposicaoParaDashboard): ComposicaoResumo => ({ id: c.id, codigo: c.codigo, nome: c.nome })

  const maisUtilizadas: ItemMaisUtilizada[] = composicoes
    .map(c => ({ ...resumo(c), totalUsos: usosPorComposicao.get(c.id) ?? 0 }))
    .sort((a, b) => b.totalUsos - a.totalUsos)
    .slice(0, 10)

  const nuncaUtilizadasTodas = composicoes
    .filter(c => (usosPorComposicao.get(c.id) ?? 0) === 0)
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em))
  const nuncaUtilizadas = {
    count: nuncaUtilizadasTodas.length,
    lista: nuncaUtilizadasTodas.slice(0, 10).map(c => ({ ...resumo(c), criadoEm: c.criado_em })),
  }

  const incompletasTodas = composicoes
    .filter(c => composicaoIncompleta(c.temMateriais, c.temMaoObra))
    .sort((a, b) => a.nome.localeCompare(b.nome))
  const incompletas = {
    count: incompletasTodas.length,
    lista: incompletasTodas.slice(0, 10).map(c => ({
      ...resumo(c),
      faltando: c.temMateriais ? ('mao_obra' as const) : ('material' as const),
    })),
  }

  const porDisciplinaMap = new Map<string, number>()
  for (const c of composicoes) {
    const nome = c.disciplina_nome ?? 'Sem disciplina'
    porDisciplinaMap.set(nome, (porDisciplinaMap.get(nome) ?? 0) + 1)
  }
  const porDisciplina = [...porDisciplinaMap.entries()]
    .map(([nome, quantidade]) => ({ nome, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome))

  const janela = ultimos12Meses(agora)
  const usoMensalMap = new Map<string, number>(janela.map(j => [`${j.ano}-${j.mes}`, 0]))
  for (const u of usos) {
    const d = new Date(u.criado_em)
    const chave = `${d.getFullYear()}-${d.getMonth()}`
    if (usoMensalMap.has(chave)) usoMensalMap.set(chave, usoMensalMap.get(chave)! + 1)
  }
  const usoMensal = janela.map(j => ({
    mes: `${MESES_ABREV[j.mes]}/${String(j.ano).slice(-2)}`,
    quantidade: usoMensalMap.get(`${j.ano}-${j.mes}`) ?? 0,
  }))

  const itensDesatualizados = itensComComposicao.filter(i => i.composicao_versao < i.versao_atual).length

  return {
    totalAtivas: composicoes.length,
    incompletas,
    nuncaUtilizadas,
    itensDesatualizados,
    maisUtilizadas,
    porDisciplina,
    usoMensal,
  }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run lib/composicoes/dashboard-metricas.test.ts`
Expected: PASS (todos os 7 testes).

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 6: Commit**

```bash
git add lib/composicoes/dashboard-metricas.ts lib/composicoes/dashboard-metricas.test.ts
git commit -m "feat: agregacao pura do dashboard de indicadores de composicoes"
```

---

### Task 2: `CardGrafico` — mensagem de vazio customizável

**Files:**
- Modify: `components/dashboard/CardGrafico.tsx`

**Interfaces:**
- Produces: prop opcional `mensagemVazio?: string` em `CardGrafico`, default `'Nenhum orçamento neste período'` (preserva o comportamento atual dos 4 gráficos do dashboard financeiro, que não passam essa prop) — usado pela Task 3.

- [ ] **Step 1: Adicionar o prop `mensagemVazio`**

Substitua todo o conteúdo de `components/dashboard/CardGrafico.tsx`:

```typescript
export function CardGrafico({
  titulo, vazio, mensagemVazio = 'Nenhum orçamento neste período', children,
}: { titulo: string; vazio: boolean; mensagemVazio?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold">{titulo}</h2>
      {vazio ? (
        <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
          {mensagemVazio}
        </div>
      ) : (
        <div className="h-72">{children}</div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Rodar os testes existentes**

Run: `npx vitest run`
Expected: PASS — nenhum teste existente quebra (`GraficoBarrasMensal`, `GraficoPizzaStatus`, `GraficoLinhaFinanceiro`, `GraficoAreaConversao` não passam `mensagemVazio`, então continuam usando o texto padrão igual a antes).

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/CardGrafico.tsx
git commit -m "feat: permite mensagem de vazio customizada em CardGrafico"
```

---

### Task 3: Componentes de apresentação do dashboard de composições

**Files:**
- Create: `components/composicoes/dashboard/CardKpiComposicoes.tsx`
- Create: `components/composicoes/dashboard/GraficoPizzaDisciplinas.tsx`
- Create: `components/composicoes/dashboard/GraficoBarrasUsoMensal.tsx`
- Create: `components/composicoes/dashboard/ListaComposicoes.tsx`

**Interfaces:**
- Consumes: `CardGrafico` (Task 2, com o novo prop `mensagemVazio`).
- Produces: os 4 componentes — usados pela Task 4 (`ComposicoesDashboardClient`).

- [ ] **Step 1: Criar `components/composicoes/dashboard/CardKpiComposicoes.tsx`**

```typescript
import type { LucideIcon } from 'lucide-react'

const CORES = {
  azul: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  laranja: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  cinza: 'bg-gray-500/10 text-gray-600 dark:text-gray-300',
  vermelho: 'bg-red-500/10 text-red-600 dark:text-red-400',
} as const

interface Props {
  titulo: string
  valor: number
  icone: LucideIcon
  cor: keyof typeof CORES
}

export function CardKpiComposicoes({ titulo, valor, icone: Icone, cor }: Props) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{titulo}</p>
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${CORES[cor]}`}>
          <Icone className="size-5" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{valor}</p>
    </div>
  )
}
```

- [ ] **Step 2: Criar `components/composicoes/dashboard/GraficoPizzaDisciplinas.tsx`**

```typescript
'use client'

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { CardGrafico } from '@/components/dashboard/CardGrafico'

const CORES = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

export function GraficoPizzaDisciplinas({ dados }: { dados: { nome: string; quantidade: number }[] }) {
  const total = dados.reduce((s, d) => s + d.quantidade, 0)
  return (
    <CardGrafico titulo="Composições por Disciplina" vazio={total === 0} mensagemVazio="Nenhuma composição cadastrada">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={dados}
            dataKey="quantidade"
            nameKey="nome"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={3}
            label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
          >
            {dados.map((d, i) => (
              <Cell key={d.nome} fill={CORES[i % CORES.length]} stroke="var(--card)" />
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

- [ ] **Step 3: Criar `components/composicoes/dashboard/GraficoBarrasUsoMensal.tsx`**

```typescript
'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CardGrafico } from '@/components/dashboard/CardGrafico'

export function GraficoBarrasUsoMensal({ dados }: { dados: { mes: string; quantidade: number }[] }) {
  const vazio = dados.every(d => d.quantidade === 0)
  return (
    <CardGrafico titulo="Uso Mensal (últimos 12 meses)" vazio={vazio} mensagemVazio="Nenhum uso registrado nos últimos 12 meses">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="mes" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: 'var(--muted)' }}
            contentStyle={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--popover-foreground)' }}
          />
          <Bar dataKey="quantidade" name="Usos" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </CardGrafico>
  )
}
```

- [ ] **Step 4: Criar `components/composicoes/dashboard/ListaComposicoes.tsx`**

```typescript
'use client'

interface LinhaLista {
  id: string
  codigo: string
  nome: string
  detalhe: string
}

interface Props {
  titulo: string
  linhas: LinhaLista[]
  totalCount: number
  aoClicarComposicao: (id: string) => void
}

export function ListaComposicoes({ titulo, linhas, totalCount, aoClicarComposicao }: Props) {
  const restantes = totalCount - linhas.length
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold">{titulo}</h2>
      {linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma composição.</p>
      ) : (
        <ul className="space-y-1">
          {linhas.map(l => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => aoClicarComposicao(l.id)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <span className="truncate">
                  <span className="font-mono text-xs text-muted-foreground">{l.codigo}</span>{' '}
                  <span className="font-medium">{l.nome}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{l.detalhe}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {restantes > 0 && (
        <p className="mt-2 px-2 text-xs text-muted-foreground">+{restantes} mais</p>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 6: Commit**

```bash
git add components/composicoes/dashboard/CardKpiComposicoes.tsx components/composicoes/dashboard/GraficoPizzaDisciplinas.tsx components/composicoes/dashboard/GraficoBarrasUsoMensal.tsx components/composicoes/dashboard/ListaComposicoes.tsx
git commit -m "feat: componentes de apresentacao do dashboard de composicoes"
```

---

### Task 4: `ComposicoesDashboardClient` — monta a página + estado do modal

**Files:**
- Create: `components/composicoes/dashboard/ComposicoesDashboardClient.tsx`

**Interfaces:**
- Consumes: `DashboardComposicoesData` (Task 1, tipo), os 4 componentes da Task 3, `ComposicaoModal` (`components/composicoes/ComposicaoModal.tsx`, já existente desde B1 — props: `aberto`, `onOpenChange`, `composicaoId`, `disciplinas`, `unidades`, `onSalvo`).
- Produces: `ComposicoesDashboardClient` — usado pela Task 5 (a página).

- [ ] **Step 1: Criar `components/composicoes/dashboard/ComposicoesDashboardClient.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Package, AlertTriangle, PackageX, RefreshCcw } from 'lucide-react'
import { CardKpiComposicoes } from './CardKpiComposicoes'
import { GraficoPizzaDisciplinas } from './GraficoPizzaDisciplinas'
import { GraficoBarrasUsoMensal } from './GraficoBarrasUsoMensal'
import { ListaComposicoes } from './ListaComposicoes'
import ComposicaoModal from '@/components/composicoes/ComposicaoModal'
import type { DashboardComposicoesData } from '@/lib/composicoes/dashboard-metricas'

interface Props {
  dados: DashboardComposicoesData
  disciplinas: { id: string; nome: string }[]
  unidades: { id: string; sigla: string }[]
}

export function ComposicoesDashboardClient({ dados, disciplinas, unidades }: Props) {
  const router = useRouter()
  const [composicaoSelecionada, setComposicaoSelecionada] = useState<string | null>(null)

  if (dados.totalAtivas === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-6 py-24 text-center">
        <p className="text-lg font-medium text-foreground">Nenhuma composição cadastrada ainda</p>
        <p className="text-sm text-muted-foreground">Cadastre composições para ver os indicadores aqui.</p>
        <a
          href="/composicoes"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Ir para Composições
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Indicadores do Banco de Composições</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <CardKpiComposicoes titulo="Composições Ativas" valor={dados.totalAtivas} icone={Package} cor="azul" />
        <CardKpiComposicoes titulo="Incompletas" valor={dados.incompletas.count} icone={AlertTriangle} cor="laranja" />
        <CardKpiComposicoes titulo="Nunca Utilizadas" valor={dados.nuncaUtilizadas.count} icone={PackageX} cor="cinza" />
        <CardKpiComposicoes titulo="Itens com Composição Desatualizada" valor={dados.itensDesatualizados} icone={RefreshCcw} cor="vermelho" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <GraficoPizzaDisciplinas dados={dados.porDisciplina} />
        <GraficoBarrasUsoMensal dados={dados.usoMensal} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ListaComposicoes
          titulo="Mais Utilizadas"
          totalCount={dados.maisUtilizadas.length}
          linhas={dados.maisUtilizadas.map(c => ({
            id: c.id,
            codigo: c.codigo,
            nome: c.nome,
            detalhe: `${c.totalUsos} uso${c.totalUsos === 1 ? '' : 's'}`,
          }))}
          aoClicarComposicao={setComposicaoSelecionada}
        />
        <ListaComposicoes
          titulo="Nunca Utilizadas"
          totalCount={dados.nuncaUtilizadas.count}
          linhas={dados.nuncaUtilizadas.lista.map(c => ({
            id: c.id,
            codigo: c.codigo,
            nome: c.nome,
            detalhe: `criada em ${new Date(c.criadoEm).toLocaleDateString('pt-BR')}`,
          }))}
          aoClicarComposicao={setComposicaoSelecionada}
        />
        <ListaComposicoes
          titulo="Incompletas"
          totalCount={dados.incompletas.count}
          linhas={dados.incompletas.lista.map(c => ({
            id: c.id,
            codigo: c.codigo,
            nome: c.nome,
            detalhe: c.faltando === 'material' ? 'falta material' : 'falta mão de obra',
          }))}
          aoClicarComposicao={setComposicaoSelecionada}
        />
      </div>

      <ComposicaoModal
        aberto={composicaoSelecionada !== null}
        onOpenChange={aberto => { if (!aberto) setComposicaoSelecionada(null) }}
        composicaoId={composicaoSelecionada}
        disciplinas={disciplinas}
        unidades={unidades}
        onSalvo={() => router.refresh()}
      />
    </div>
  )
}
```

Nota: `totalCount={dados.maisUtilizadas.length}` para a lista "Mais Utilizadas" é intencional — essa lista é um ranking top-10 fixo, não um subconjunto filtrado de um total maior rastreado em algum lugar, então `restantes` sempre dá 0 e o "+N mais" nunca aparece ali. Isso é esperado, não um bug.

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add components/composicoes/dashboard/ComposicoesDashboardClient.tsx
git commit -m "feat: client component que monta o dashboard de composicoes"
```

---

### Task 5: `app/(app)/composicoes/dashboard/page.tsx` — consultas ao Supabase

**Files:**
- Create: `app/(app)/composicoes/dashboard/page.tsx`

**Interfaces:**
- Consumes: `calcularDashboardComposicoes`/tipos (Task 1), `ComposicoesDashboardClient` (Task 4), `composicaoIncompleta`... (não usado diretamente aqui — a incompletude é resolvida dentro de `calcularDashboardComposicoes` a partir de `temMateriais`/`temMaoObra`).

- [ ] **Step 1: Criar `app/(app)/composicoes/dashboard/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import {
  calcularDashboardComposicoes,
  type ComposicaoParaDashboard,
  type UsoParaDashboard,
  type ItemComComposicaoParaDashboard,
} from '@/lib/composicoes/dashboard-metricas'
import { ComposicoesDashboardClient } from '@/components/composicoes/dashboard/ComposicoesDashboardClient'

export default async function ComposicoesDashboardPage() {
  const supabase = await createClient()

  const [
    { data: composicoesData, error: erroComposicoes },
    { data: disciplinasData },
    { data: unidadesData },
  ] = await Promise.all([
    supabase.from('composicoes').select('id, codigo, nome, criado_em, disciplinas(nome)').eq('ativo', true),
    supabase.from('disciplinas').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('unidades_medida').select('id, sigla').order('sigla'),
  ])
  if (erroComposicoes) throw new Error(`Falha ao carregar o dashboard: ${erroComposicoes.message}`)

  const composicoes = composicoesData ?? []
  const idsComposicoes = composicoes.map(c => c.id)

  // Mesmo padrão "query separada + limite explícito" já usado em GET /api/composicoes
  // (B5a) — sem .limit(50000) o cap padrão do PostgREST poderia truncar a resposta
  // numa biblioteca grande, gerando contagens erradas.
  const [
    { data: usosData, error: erroUsos },
    { data: materiaisData, error: erroMateriais },
    { data: maoObraData, error: erroMaoObra },
    { data: itensData, error: erroItens },
  ] = await Promise.all([
    idsComposicoes.length > 0
      ? supabase.from('composicao_usos').select('composicao_id, criado_em').in('composicao_id', idsComposicoes).limit(50000)
      : Promise.resolve({ data: [], error: null }),
    idsComposicoes.length > 0
      ? supabase.from('composicao_materiais').select('composicao_id').in('composicao_id', idsComposicoes).limit(50000)
      : Promise.resolve({ data: [], error: null }),
    idsComposicoes.length > 0
      ? supabase.from('composicao_mao_obra').select('composicao_id').in('composicao_id', idsComposicoes).limit(50000)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('itens_orcamento').select('composicao_versao, composicoes(versao)').not('composicao_id', 'is', null).limit(50000),
  ])
  if (erroUsos) throw new Error(`Falha ao carregar o dashboard: ${erroUsos.message}`)
  if (erroMateriais) throw new Error(`Falha ao carregar o dashboard: ${erroMateriais.message}`)
  if (erroMaoObra) throw new Error(`Falha ao carregar o dashboard: ${erroMaoObra.message}`)
  if (erroItens) throw new Error(`Falha ao carregar o dashboard: ${erroItens.message}`)

  const idsComMateriais = new Set((materiaisData ?? []).map(m => m.composicao_id))
  const idsComMaoObra = new Set((maoObraData ?? []).map(m => m.composicao_id))

  const composicoesParaDashboard: ComposicaoParaDashboard[] = composicoes.map(c => ({
    id: c.id,
    codigo: c.codigo,
    nome: c.nome,
    disciplina_nome: (c.disciplinas as unknown as { nome: string } | null)?.nome ?? null,
    criado_em: c.criado_em,
    temMateriais: idsComMateriais.has(c.id),
    temMaoObra: idsComMaoObra.has(c.id),
  }))

  const usos: UsoParaDashboard[] = (usosData ?? []).map(u => ({
    composicao_id: u.composicao_id,
    criado_em: u.criado_em,
  }))

  const itensComComposicao: ItemComComposicaoParaDashboard[] = (itensData ?? [])
    .map(i => ({
      composicao_versao: i.composicao_versao,
      versao_atual: (i.composicoes as unknown as { versao: number } | null)?.versao ?? null,
    }))
    .filter((i): i is ItemComComposicaoParaDashboard => i.composicao_versao !== null && i.versao_atual !== null)

  const dados = calcularDashboardComposicoes(composicoesParaDashboard, usos, itensComComposicao)

  return (
    <ComposicoesDashboardClient
      dados={dados}
      disciplinas={disciplinasData ?? []}
      unidades={unidadesData ?? []}
    />
  )
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Verificação manual**

Com o servidor rodando (`npm run dev`), autenticado, acesse `http://localhost:3000/composicoes/dashboard` e confirme: os 4 KPIs aparecem com números plausíveis; o gráfico de disciplina mostra as disciplinas existentes; o gráfico de uso mensal mostra 12 meses; as 3 listas aparecem (ou "Nenhuma composição." se vazias); clicar numa composição de qualquer lista abre o `ComposicaoModal` para edição.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/composicoes/dashboard/page.tsx"
git commit -m "feat: pagina do dashboard de indicadores de composicoes"
```

---

### Task 6: Botão "Ver indicadores" na página de composições

**Files:**
- Modify: `components/composicoes/ComposicoesPageClient.tsx`

**Interfaces:**
- Consumes: rota `/composicoes/dashboard` (Task 5).
- Produces: nada consumido por outra task — é o último elo da cadeia.

- [ ] **Step 1: Adicionar `useRouter` ao import de `next/navigation`**

No topo de `components/composicoes/ComposicoesPageClient.tsx`, logo após o import de `'use client'` e a linha em branco (linha 3, `import { useState, useEffect, useCallback, useRef } from 'react'`), adicione uma nova linha de import logo abaixo:

```typescript
import { useRouter } from 'next/navigation'
```

- [ ] **Step 2: Instanciar o router**

Dentro do componente `ComposicoesPageClient`, logo após a linha `export default function ComposicoesPageClient({ disciplinas, unidades }: Props) {`, adicione como a primeira linha do corpo da função:

```typescript
  const router = useRouter()
```

- [ ] **Step 3: Adicionar o botão no cabeçalho**

Substitua o bloco do cabeçalho (linhas 135-146 do arquivo atual):

```tsx
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Composições</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportar} disabled={exportando}>
            ↓ Exportar
          </Button>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importando}>
            {importando ? 'Importando...' : '↑ Importar planilha'}
          </Button>
          <Button onClick={abrirNovo}>+ Nova composição</Button>
        </div>
      </div>
```

por:

```tsx
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Composições</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push('/composicoes/dashboard')}>
            Ver indicadores
          </Button>
          <Button variant="outline" onClick={exportar} disabled={exportando}>
            ↓ Exportar
          </Button>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importando}>
            {importando ? 'Importando...' : '↑ Importar planilha'}
          </Button>
          <Button onClick={abrirNovo}>+ Nova composição</Button>
        </div>
      </div>
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 5: Verificação manual no navegador**

Rode `npm run dev`, acesse `/composicoes` autenticado, clique em "Ver indicadores" e confirme que navega para `/composicoes/dashboard` mostrando os indicadores.

- [ ] **Step 6: Commit**

```bash
git add components/composicoes/ComposicoesPageClient.tsx
git commit -m "feat: botao Ver indicadores na pagina de composicoes"
```

---

## Critérios de aceite (herdados da spec)

1. `/composicoes/dashboard` carrega com dados reais do Supabase, sem números fictícios.
2. Os 4 KPIs batem exatamente com os mesmos critérios já usados em B2/B5a (`total_usos`, `incompleta`, versão desatualizada).
3. Gráfico de disciplina mostra todas as disciplinas com pelo menos 1 composição; composições sem disciplina aparecem como "Sem disciplina".
4. Gráfico de uso mensal mostra os últimos 12 meses, incluindo meses com 0 usos.
5. As 3 listas mostram no máximo 10 itens cada, com indicação de quantos mais existem quando aplicável.
6. Clicar em qualquer composição listada abre o `ComposicaoModal` existente, permitindo editar ali mesmo.
7. Botão "Ver indicadores" na página `/composicoes` navega para `/composicoes/dashboard`.
8. Biblioteca vazia (nenhuma composição ativa) mostra o empty state com CTA, não os 4 cards zerados.
9. `npm run test:run` verde; `npx tsc --noEmit` sem erros novos.
