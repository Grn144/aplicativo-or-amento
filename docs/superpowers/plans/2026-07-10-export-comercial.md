# Export Comercial (14 colunas, preços de venda) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o export comercial gerar a planilha simples de 14 colunas (idêntica a `teste/comercial.xlsx`), mostrando os preços de venda ao cliente, e a rota escolher o gerador conforme `tipo`.

**Architecture:** Novo `lib/excel/export-comercial.ts` (`montarPlanilhaComercial`) produz o layout de 14 colunas com fórmulas nativas do Excel. Os preços de venda vêm de `calcularItem` (`lib/calculos.ts`) — sem duplicar fórmula monetária. A rota `app/api/obras/[id]/export/route.ts` passa a ramificar: `tipo=comercial` → gerador comercial (via `calcularItem`), `tipo=tecnico` → gerador de 28 colunas existente.

**Tech Stack:** Next.js 15, TypeScript strict, exceljs, Vitest.

## Global Constraints

- Todo texto de UI/planilha em português brasileiro.
- TypeScript strict; alias `@/*`.
- **Cálculo monetário só em `lib/calculos.ts`** — o preço de venda unitário DEVE vir de `calcularItem` (`preco_unit_mao_obra_venda`/`preco_unit_material_venda`), nunca recomputado no gerador ou na rota.
- Fórmulas monetárias no Excel são nativas (recalcula ao abrir) — subtotais/total como `{ formula }`.
- Commits em português no padrão `feat:`/`fix:`/`test:`.
- Rodar testes com `npm run test:run`.
- Referência estrutural: spec `docs/superpowers/specs/2026-07-10-export-comercial-design.md` e template `teste/comercial.xlsx` (14 colunas A–N + O espaçadora).

---

### Task 1: Criar o gerador `export-comercial.ts` (TDD)

**Files:**
- Create: `lib/excel/export-comercial.ts`
- Test: `lib/excel/export-comercial.test.ts`

**Interfaces:**
- Produces: `montarPlanilhaComercial(obra: ObraCabecalho, grupos: GrupoComItensComercial[]): ExcelJS.Workbook`.
  - `ObraCabecalho = { codigo: string; nome: string; cliente: { razao_social: string; endereco: string | null; cnpj: string | null } | null }`
  - `ItemComercial = { numero: number; descricao: string; disciplina_nome: string; local: string | null; unidade_sigla: string; quantidade: number; preco_unit_mao_obra_venda: number; preco_unit_material_venda: number; observacao: string | null; observacao_2: string | null }`
  - `GrupoComItensComercial = { letra: string; ordem: number; disciplina_nome: string; itens: ItemComercial[] }`

- [ ] **Step 1: Escrever o teste (deve falhar)**

Criar `lib/excel/export-comercial.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { montarPlanilhaComercial, type GrupoComItensComercial, type ObraCabecalho } from './export-comercial'

const obra: ObraCabecalho = {
  codigo: '08114',
  nome: 'UNILEVER - WT',
  cliente: { razao_social: 'UNILEVER DO BRASIL', endereco: 'AV. X, 1', cnpj: '61.068.276/0001-04' },
}
const grupos: GrupoComItensComercial[] = [{
  letra: 'A', ordem: 1, disciplina_nome: 'Pré-obra',
  itens: [
    { numero: 1, descricao: 'Demolição de forro', disciplina_nome: 'Pré-obra', local: '4B - SALA HC', unidade_sigla: 'M2',
      quantidade: 23, preco_unit_mao_obra_venda: 90.678, preco_unit_material_venda: 0,
      observacao: 'EXECUTADO', observacao_2: 'ABSORVER' },
    { numero: 2, descricao: 'Demolição de forro', disciplina_nome: 'Pré-obra', local: '4B - SALA CONFORT', unidade_sigla: 'M2',
      quantidade: 16, preco_unit_mao_obra_venda: 90.678, preco_unit_material_venda: 0,
      observacao: 'EXECUTADO', observacao_2: null },
  ],
}]

function build() {
  return montarPlanilhaComercial(obra, grupos).worksheets[0]
}

describe('montarPlanilhaComercial — estrutura (14 colunas)', () => {
  it('cabeçalho da empresa nas linhas 1-5', () => {
    const ws = build()
    expect(ws.getCell('C1').value).toBe('DESCRITIVO TÉCNICO E COMERCIAL')
    expect(ws.getCell('C2').value).toBe('UNILEVER DO BRASIL')
    expect(ws.getCell('C3').value).toBe('ENDEREÇO: AV. X, 1')
    expect(ws.getCell('C4').value).toBe('CNPJ: 61.068.276/0001-04')
    expect(ws.getCell('C5').value).toBe('08114 UNILEVER - WT')
  })

  it('títulos de bloco na linha 7', () => {
    const ws = build()
    expect(ws.getCell('H7').value).toBe('PREÇOS UNITÁRIOS')
    expect(ws.getCell('J7').value).toBe('SUB TOTAL')
    expect(ws.getCell('L7').value).toBe('TOTAL')
  })

  it('cabeçalhos de coluna na linha 8', () => {
    const ws = build()
    const esperado: Record<string, string> = {
      A8: 'ITEM', B8: 'Nº', C8: 'DESCRIÇÃO', D8: 'DISCIPLINA', E8: 'LOCAL', F8: 'UN.', G8: 'QT.',
      H8: 'M. OBRA', I8: 'MATERIAL', J8: 'M. OBRA', K8: 'MATERIAL', L8: 'TOTAL', M8: 'OBS.', N8: 'OBS.',
    }
    for (const [cel, val] of Object.entries(esperado)) expect(ws.getCell(cel).value).toBe(val)
  })

  it('totais na linha 6 (=SUM/2)', () => {
    const ws = build()
    for (const col of ['J', 'K', 'L']) {
      const f = (ws.getCell(`${col}6`).value as { formula: string }).formula
      expect(f).toMatch(new RegExp(`^SUM\\(${col}9:${col}\\d+\\)/2$`))
    }
  })
})

describe('montarPlanilhaComercial — linha de item (venda + fórmulas)', () => {
  it('primeiro item (linha 10): H/I = venda, J/K/L = fórmulas', () => {
    const ws = build()
    expect(ws.getCell('A10').value).toBe('A')
    expect(ws.getCell('B10').value).toBe(1)
    expect(ws.getCell('D10').value).toBe('Pré-obra')
    expect(ws.getCell('E10').value).toBe('4B - SALA HC')
    expect(ws.getCell('F10').value).toBe('M2')
    expect(ws.getCell('G10').value).toBe(23)
    expect(ws.getCell('H10').value).toBe(90.678) // venda M.OBRA, não custo
    expect(ws.getCell('I10').value).toBe(0)      // venda material
    expect((ws.getCell('J10').value as { formula: string }).formula).toBe('H10*G10')
    expect((ws.getCell('K10').value as { formula: string }).formula).toBe('I10*G10')
    expect((ws.getCell('L10').value as { formula: string }).formula).toBe('J10+K10')
    expect(ws.getCell('M10').value).toBe('EXECUTADO')
    expect(ws.getCell('N10').value).toBe('ABSORVER')
  })

  it('linha de disciplina (9): SUM nos subtotais e "-" nas colunas de item', () => {
    const ws = build()
    expect(ws.getCell('A9').value).toBe('A')
    expect(ws.getCell('C9').value).toBe('PRÉ-OBRA')
    expect(ws.getCell('E9').value).toBe('-')
    expect(ws.getCell('H9').value).toBe('-')
    expect((ws.getCell('J9').value as { formula: string }).formula).toBe('SUM(J10:J11)')
    expect((ws.getCell('K9').value as { formula: string }).formula).toBe('SUM(K10:K11)')
    expect((ws.getCell('L9').value as { formula: string }).formula).toBe('J9+K9')
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm run test:run -- lib/excel/export-comercial.test.ts`
Expected: FAIL — módulo `./export-comercial` não existe.

- [ ] **Step 3: Criar `lib/excel/export-comercial.ts`**

```typescript
import ExcelJS from 'exceljs'

// Layout comercial simples da empresa (14 colunas A–N + O espaçadora), idêntico
// ao template teste/comercial.xlsx (inspecionado em 2026-07-10). Mostra os preços
// de VENDA ao cliente (custo × FEE × markup, já calculados por lib/calculos.ts).
// Ver spec docs/superpowers/specs/2026-07-10-export-comercial-design.md.

const FONT_BASE = { name: 'Calibri', family: 2, size: 9, color: { theme: 1 } } as const
const FONT_BOLD = { ...FONT_BASE, bold: true } as const
const HAIR_SIDE = { style: 'hair' as const, color: { theme: 0, tint: -0.14996795556505021 } }
const HAIR_BORDER = { left: HAIR_SIDE, right: HAIR_SIDE, top: HAIR_SIDE, bottom: HAIR_SIDE }
const GROUP_FILL = {
  type: 'pattern' as const, pattern: 'solid' as const,
  fgColor: { theme: 0, tint: -0.1499984740745262 },
}
const NO_FILL = { type: 'pattern' as const, pattern: 'none' as const }
const NUMFMT_MONEY = '_-* #,##0.00_-;-* #,##0.00_-;_-* "-"??_-;_-@_-'
const NUMFMT_QT = '0.00'
const ALIGN_TOP_LEFT = { horizontal: 'left' as const, vertical: 'top' as const }
const ALIGN_WRAP = { ...ALIGN_TOP_LEFT, wrapText: true }
const MONEY_COLS = [8, 9, 10, 11, 12]
const COLUMN_WIDTHS = [
  5.8, 4.4, 72.4, 11.6, 13.6, 5.1, 4.8, 9.2, 10.0, 9.2, 10.0, 8.1, 11.6, 30.7, 0.5,
]

export interface ObraCabecalho {
  codigo: string
  nome: string
  cliente: { razao_social: string; endereco: string | null; cnpj: string | null } | null
}

export interface ItemComercial {
  numero: number
  descricao: string
  disciplina_nome: string
  local: string | null
  unidade_sigla: string
  quantidade: number
  preco_unit_mao_obra_venda: number
  preco_unit_material_venda: number
  observacao: string | null
  observacao_2: string | null
}

export interface GrupoComItensComercial {
  letra: string
  ordem: number
  disciplina_nome: string
  itens: ItemComercial[]
}

function estilizarLinha(
  row: ExcelJS.Row,
  opts: { bold: boolean; fill: typeof GROUP_FILL | typeof NO_FILL; qtCol?: number },
) {
  for (let c = 1; c <= 14; c++) {
    const cell = row.getCell(c)
    cell.font = opts.bold ? FONT_BOLD : FONT_BASE
    cell.fill = opts.fill
    cell.border = HAIR_BORDER
    cell.alignment = c === 3 ? ALIGN_WRAP : ALIGN_TOP_LEFT
    if (MONEY_COLS.includes(c)) cell.numFmt = NUMFMT_MONEY
    if (opts.qtCol === c) cell.numFmt = NUMFMT_QT
  }
}

export function montarPlanilhaComercial(
  obra: ObraCabecalho,
  grupos: GrupoComItensComercial[],
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.calcProperties.fullCalcOnLoad = true
  wb.creator = 'Sistema de Orçamentos'
  const ws = wb.addWorksheet('.')

  ws.columns = COLUMN_WIDTHS.map(width => ({ width }))
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 8, topLeftCell: 'A9', showGridLines: false }]

  ws.getCell('C1').value = 'DESCRITIVO TÉCNICO E COMERCIAL'
  ws.getCell('L1').value = { formula: 'TODAY()' }
  ws.getCell('L1').numFmt = 'mm-dd-yy'
  ws.getCell('C2').value = obra.cliente?.razao_social ?? ''
  ws.getCell('C3').value = `ENDEREÇO: ${obra.cliente?.endereco ?? ''}`
  ws.getCell('C4').value = `CNPJ: ${obra.cliente?.cnpj ?? ''}`
  ws.getCell('C5').value = `${obra.codigo} ${obra.nome}`
  for (let r = 1; r <= 5; r++) {
    for (let c = 1; c <= 15; c++) {
      const cell = ws.getRow(r).getCell(c)
      cell.font = FONT_BOLD
      cell.alignment = c === 3 ? ALIGN_WRAP : ALIGN_TOP_LEFT
    }
  }

  ws.mergeCells('H7:I7'); ws.getCell('H7').value = 'PREÇOS UNITÁRIOS'
  ws.mergeCells('J7:K7'); ws.getCell('J7').value = 'SUB TOTAL'
  ws.getCell('L7').value = 'TOTAL'

  const HEADERS = ['ITEM', 'Nº', 'DESCRIÇÃO', 'DISCIPLINA', 'LOCAL', 'UN.', 'QT.', 'M. OBRA', 'MATERIAL', 'M. OBRA', 'MATERIAL', 'TOTAL', 'OBS.', 'OBS.']
  HEADERS.forEach((h, i) => { ws.getCell(8, i + 1).value = h })

  estilizarLinha(ws.getRow(7), { bold: true, fill: NO_FILL })
  estilizarLinha(ws.getRow(8), { bold: true, fill: NO_FILL })

  let r = 9
  const primeiraLinha = r
  for (const grupo of grupos) {
    const grupoRow = r
    const primeiroItem = r + 1
    const ultimoItem = r + grupo.itens.length
    ws.getCell(grupoRow, 1).value = grupo.letra
    ws.getCell(grupoRow, 2).value = grupo.letra
    ws.getCell(grupoRow, 3).value = grupo.disciplina_nome.toUpperCase()
    for (const c of [4, 5, 6, 7, 8, 9]) ws.getCell(grupoRow, c).value = '-'
    ws.getCell(grupoRow, 10).value = { formula: `SUM(J${primeiroItem}:J${ultimoItem})` }
    ws.getCell(grupoRow, 11).value = { formula: `SUM(K${primeiroItem}:K${ultimoItem})` }
    ws.getCell(grupoRow, 12).value = { formula: `J${grupoRow}+K${grupoRow}` }
    estilizarLinha(ws.getRow(grupoRow), { bold: true, fill: GROUP_FILL })
    r++

    for (const item of grupo.itens) {
      ws.getCell(r, 1).value = grupo.letra
      ws.getCell(r, 2).value = item.numero
      ws.getCell(r, 3).value = item.descricao
      ws.getCell(r, 4).value = grupo.disciplina_nome
      ws.getCell(r, 5).value = item.local ?? ''
      ws.getCell(r, 6).value = item.unidade_sigla
      ws.getCell(r, 7).value = item.quantidade
      ws.getCell(r, 8).value = item.preco_unit_mao_obra_venda
      ws.getCell(r, 9).value = item.preco_unit_material_venda
      ws.getCell(r, 10).value = { formula: `H${r}*G${r}` }
      ws.getCell(r, 11).value = { formula: `I${r}*G${r}` }
      ws.getCell(r, 12).value = { formula: `J${r}+K${r}` }
      ws.getCell(r, 13).value = item.observacao ?? ''
      ws.getCell(r, 14).value = item.observacao_2 ?? ''
      estilizarLinha(ws.getRow(r), { bold: false, fill: NO_FILL, qtCol: 7 })
      r++
    }
  }
  const ultimaLinha = r - 1

  ws.getCell('J6').value = { formula: `SUM(J${primeiraLinha}:J${ultimaLinha})/2` }
  ws.getCell('K6').value = { formula: `SUM(K${primeiraLinha}:K${ultimaLinha})/2` }
  ws.getCell('L6').value = { formula: `SUM(L${primeiraLinha}:L${ultimaLinha})/2` }
  estilizarLinha(ws.getRow(6), { bold: true, fill: NO_FILL })

  ws.autoFilter = { from: 'A8', to: `N${ultimaLinha}` }

  return wb
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npm run test:run -- lib/excel/export-comercial.test.ts`
Expected: PASS (todos os testes deste arquivo).

- [ ] **Step 5: Rodar a suíte completa**

Run: `npm run test:run`
Expected: todos passando (a rota ainda não usa o gerador comercial — isso é a Task 2).

- [ ] **Step 6: Commit**

```bash
git add lib/excel/export-comercial.ts lib/excel/export-comercial.test.ts
git commit -m "feat: gerador do export comercial (14 colunas, precos de venda)"
```

---

### Task 2: Ramificar a rota de export por tipo + verificação manual

**Files:**
- Modify: `app/api/obras/[id]/export/route.ts`

**Interfaces:**
- Consumes: `montarPlanilhaComercial(obra, grupos)` (Task 1); `calcularItem(item, feeFatorObra)` de `@/lib/calculos` (retorna `preco_unit_mao_obra_venda`/`preco_unit_material_venda`); `montarPlanilhaDescritivo` (já usado hoje).

- [ ] **Step 1: Adicionar `observacao, observacao_2` ao select dos itens**

Em `app/api/obras/[id]/export/route.ts`, no bloco `itens_orcamento (...)` do `.select`, trocar a linha:

```typescript
          markup_mao_obra, markup_material, fee_mao_obra, fee_material,
          unidades_medida (sigla)
```

por:

```typescript
          markup_mao_obra, markup_material, fee_mao_obra, fee_material,
          observacao, observacao_2,
          unidades_medida (sigla)
```

- [ ] **Step 2: Importar o gerador comercial, `calcularItem` e o tipo `ItemOrcamento`**

No topo do arquivo, logo após o import de `montarPlanilhaDescritivo`, adicionar:

```typescript
import { montarPlanilhaComercial, type GrupoComItensComercial } from '@/lib/excel/export-comercial'
import { calcularItem } from '@/lib/calculos'
import type { ItemOrcamento } from '@/types/database'
```

- [ ] **Step 3: Ramificar a construção do workbook por tipo**

Substituir o trecho que hoje monta `grupos` e chama `montarPlanilhaDescritivo` (das linhas `const grupos: GrupoComItens[] = ...` até o fechamento da chamada `montarPlanilhaDescritivo(...)`, isto é, o bloco que termina em `)` antes de `const buffer = ...`) por:

```typescript
  const feeFator = Number(obra.fee_fator ?? 1.02)
  const gruposOrdenados = (obra.grupos_orcamento ?? [])
    .slice()
    .sort((a, b) => a.ordem - b.ordem)

  let wb
  if (tipo === 'comercial') {
    const grupos: GrupoComItensComercial[] = gruposOrdenados.map(g => {
      const disciplina_nome = (g.disciplinas as unknown as { nome: string } | null)?.nome ?? '—'
      return {
        letra: g.letra,
        ordem: g.ordem,
        disciplina_nome,
        itens: (g.itens_orcamento ?? [])
          .slice()
          .sort((a, b) => a.ordem - b.ordem)
          .map(item => {
            const calc = calcularItem({
              quantidade: Number(item.quantidade),
              custo_unit_mao_obra: Number(item.custo_unit_mao_obra),
              custo_unit_material: Number(item.custo_unit_material),
              markup_mao_obra: Number(item.markup_mao_obra),
              markup_material: Number(item.markup_material),
              fee_mao_obra: item.fee_mao_obra === null || item.fee_mao_obra === undefined ? null : Number(item.fee_mao_obra),
              fee_material: item.fee_material === null || item.fee_material === undefined ? null : Number(item.fee_material),
            } as ItemOrcamento, feeFator)
            return {
              numero: item.numero,
              descricao: item.descricao,
              disciplina_nome,
              local: item.local,
              unidade_sigla: (item.unidades_medida as unknown as { sigla: string } | null)?.sigla ?? '',
              quantidade: Number(item.quantidade),
              preco_unit_mao_obra_venda: calc.preco_unit_mao_obra_venda,
              preco_unit_material_venda: calc.preco_unit_material_venda,
              observacao: item.observacao ?? null,
              observacao_2: item.observacao_2 ?? null,
            }
          }),
      }
    })
    wb = montarPlanilhaComercial({ codigo: obra.codigo, nome: obra.nome, cliente }, grupos)
  } else {
    const grupos: GrupoComItens[] = gruposOrdenados.map(g => ({
      letra: g.letra,
      ordem: g.ordem,
      disciplina_nome: (g.disciplinas as unknown as { nome: string } | null)?.nome ?? '—',
      itens: (g.itens_orcamento ?? [])
        .slice()
        .sort((a, b) => a.ordem - b.ordem)
        .map(item => ({
          numero: item.numero,
          descricao: item.descricao,
          local: item.local,
          unidade_sigla: (item.unidades_medida as unknown as { sigla: string } | null)?.sigla ?? '',
          quantidade: Number(item.quantidade),
          custo_unit_mao_obra: Number(item.custo_unit_mao_obra),
          custo_unit_material: Number(item.custo_unit_material),
          markup_mao_obra: Number(item.markup_mao_obra),
          markup_material: Number(item.markup_material),
          fee_mao_obra: item.fee_mao_obra === null || item.fee_mao_obra === undefined ? null : Number(item.fee_mao_obra),
          fee_material: item.fee_material === null || item.fee_material === undefined ? null : Number(item.fee_material),
        })),
    }))
    wb = montarPlanilhaDescritivo(
      { codigo: obra.codigo, nome: obra.nome, cliente },
      grupos,
      {
        fee_fator: feeFator,
        comissao_valor: Number(obra.comissao_valor ?? 0),
        imposto_valor: Number(obra.imposto_valor ?? 0),
      },
    )
  }
```

(O restante do arquivo — `const buffer = await wb.xlsx.writeBuffer()` e a resposta — permanece igual.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: nenhum erro novo em `export/route.ts`, `export-comercial.ts` ou `export-template.ts`. Erros pré-existentes em `*.test.tsx` de auth (globals do vitest) não são desta task.

- [ ] **Step 5: Rodar a suíte completa**

Run: `npm run test:run`
Expected: todos passando.

- [ ] **Step 6: NÃO fazer a verificação manual (round-trip)** — é responsabilidade do controller. Parar após a suíte.

- [ ] **Step 7: Commit**

```bash
git add "app/api/obras/[id]/export/route.ts"
git commit -m "feat: rota de export escolhe gerador comercial ou tecnico por tipo"
```

---

## Self-Review

**Cobertura da spec:**
- Layout 14 colunas A–N idêntico ao template → Task 1 (HEADERS, larguras, merges, fórmulas). ✅
- H/I = preços de venda vindos de `calcularItem` → Task 1 (campos `preco_unit_*_venda`) + Task 2 (rota chama `calcularItem`). ✅
- Regra "cálculo só em lib/calculos.ts" → Task 2 usa `calcularItem`, gerador não recomputa. ✅
- Fórmulas nativas J/K/L e totais linha 6 `=SUM/2` → Task 1. ✅
- Duas colunas OBS → Task 1 (col 13/14) + Task 2 (select `observacao, observacao_2`). ✅
- Rota ramifica por tipo, técnica intacta → Task 2. ✅
- Estilo (fonte, bordas, fill, larguras, freeze, autofilter) → Task 1. ✅

**Placeholders:** nenhum — código de gerador, teste e rota completos acima.

**Consistência de tipos:** `ItemComercial.preco_unit_mao_obra_venda`/`preco_unit_material_venda` casam com os campos retornados por `calcularItem` (`lib/calculos.ts`) usados na Task 2. `montarPlanilhaComercial(obra, grupos)` tem a mesma assinatura na definição (Task 1), no teste (Task 1) e na chamada da rota (Task 2). O bloco `else` da Task 2 mantém exatamente a chamada atual de `montarPlanilhaDescritivo`.
