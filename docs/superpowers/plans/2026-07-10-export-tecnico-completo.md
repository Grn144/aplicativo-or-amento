# Export Técnico Completo (28 colunas) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o export técnico gerar a planilha idêntica ao descritivo técnico e comercial real (28 colunas A–AB: custo → FEE → venda → rentabilidade), com fórmulas nativas do Excel.

**Architecture:** Reescrever `lib/excel/export-template.ts` (`montarPlanilhaDescritivo`) para emitir as 28 colunas. Estender as interfaces de entrada para carregar markup por item, FEE por item e os fatores da obra (`fee_fator`, `comissao_valor`, `imposto_valor`). Ajustar a rota `app/api/obras/[id]/export/route.ts` para buscar e passar esses dados. Nenhuma mudança em `lib/calculos.ts` ou no import.

**Tech Stack:** Next.js 15, TypeScript strict, exceljs, Vitest.

## Global Constraints

- Todo texto de UI/planilha em português brasileiro.
- TypeScript strict; alias `@/*`.
- Fórmulas monetárias no Excel são nativas (recalcula ao abrir) — não pré-computar valores nas células de subtotal/venda.
- Commits em português no padrão `feat:`/`fix:`/`test:`.
- Rodar testes com `npm run test:run`.
- CATEGORIA (col E) e FRENTE (col F) saem como `"-"` (o app não tem esses campos).
- Comissão e imposto no bloco de rentabilidade usam os valores manuais da obra (`comissao_valor`/`imposto_valor`), não a fórmula 30% do template.
- Referência estrutural: spec `docs/superpowers/specs/2026-07-10-export-tecnico-completo-design.md`.

---

### Task 1: Reescrever o gerador `export-template.ts` (TDD)

**Files:**
- Modify: `lib/excel/export-template.ts`
- Test: `lib/excel/export-template.test.ts` (reescrito)

**Interfaces:**
- Produces: `montarPlanilhaDescritivo(obra: ObraCabecalho, grupos: GrupoComItens[], fatores: FatoresObra): ExcelJS.Workbook`.
  - `ObraCabecalho = { codigo: string; nome: string; cliente: { razao_social: string; endereco: string | null; cnpj: string | null } | null }`
  - `ItemDescritivo = { numero: number; descricao: string; local: string | null; unidade_sigla: string; quantidade: number; custo_unit_mao_obra: number; custo_unit_material: number; markup_mao_obra: number; markup_material: number; fee_mao_obra: number | null; fee_material: number | null }`
  - `GrupoComItens = { letra: string; ordem: number; disciplina_nome: string; itens: ItemDescritivo[] }`
  - `FatoresObra = { fee_fator: number; comissao_valor: number; imposto_valor: number }`

- [ ] **Step 1: Reescrever o teste (deve falhar)**

Substituir todo o conteúdo de `lib/excel/export-template.test.ts` por:

```typescript
import { describe, it, expect } from 'vitest'
import { montarPlanilhaDescritivo, type GrupoComItens, type ObraCabecalho, type FatoresObra } from './export-template'

const obra: ObraCabecalho = {
  codigo: '07982',
  nome: 'TESTE',
  cliente: { razao_social: 'CLIENTE LTDA', endereco: 'RUA X, 1', cnpj: '00.000.000/0001-00' },
}
const fatores: FatoresObra = { fee_fator: 1.02, comissao_valor: 500, imposto_valor: 1200 }
const grupos: GrupoComItens[] = [{
  letra: 'A', ordem: 1, disciplina_nome: 'Pré-obra',
  itens: [
    { numero: 1, descricao: 'Item 1', local: 'ELEVADORES', unidade_sigla: 'VB', quantidade: 1,
      custo_unit_mao_obra: 350, custo_unit_material: 700, markup_mao_obra: 1.7, markup_material: 1.7,
      fee_mao_obra: null, fee_material: null },
    { numero: 2, descricao: 'Item 2', local: 'GERAL', unidade_sigla: 'UNID', quantidade: 1,
      custo_unit_mao_obra: 0, custo_unit_material: 9800, markup_mao_obra: 1.7, markup_material: 1.7,
      fee_mao_obra: 1, fee_material: null },
  ],
}]

function build() {
  const wb = montarPlanilhaDescritivo(obra, grupos, fatores)
  return wb.worksheets[0]
}

describe('montarPlanilhaDescritivo — cabeçalho e estrutura (28 colunas)', () => {
  it('cabeçalho da empresa nas linhas 1-5', () => {
    const ws = build()
    expect(ws.getCell('C1').value).toBe('DESCRITIVO TÉCNICO E COMERCIAL')
    expect(ws.getCell('C2').value).toBe('CLIENTE LTDA')
    expect(ws.getCell('C3').value).toBe('ENDEREÇO: RUA X, 1')
    expect(ws.getCell('C4').value).toBe('CNPJ: 00.000.000/0001-00')
    expect(ws.getCell('C5').value).toBe('07982 TESTE')
  })

  it('títulos de bloco na linha 7 (com mesclagens)', () => {
    const ws = build()
    expect(ws.getCell('J7').value).toBe('PREÇOS UNITÁRIOS')
    expect(ws.getCell('L7').value).toBe('SUB TOTAL')
    expect(ws.getCell('N7').value).toBe('TOTAL')
    expect(ws.getCell('O7').value).toBe('FEE M.OBRA')
    expect(ws.getCell('P7').value).toBe('$ M.OBRA')
    expect(ws.getCell('Q7').value).toBe('FEE MAT')
    expect(ws.getCell('R7').value).toBe('$ MAT')
    expect(ws.getCell('U7').value).toBe('PREÇOS UNITÁRIOS')
    expect(ws.getCell('W7').value).toBe('SUB TOTAL')
    expect(ws.getCell('Y7').value).toBe('TOTAL')
  })

  it('cabeçalhos de coluna na linha 8 (todas as 28 colunas relevantes)', () => {
    const ws = build()
    const esperado: Record<string, string> = {
      A8: 'ITEM', B8: 'Nº', C8: 'DESCRIÇÃO', D8: 'DISCIPLINA', E8: 'CATEGORIA', F8: 'FRENTE',
      G8: 'LOCAL', H8: 'UN.', I8: 'QT.', J8: 'M. OBRA', K8: 'MAT', L8: 'M. OBRA', M8: 'MAT',
      N8: 'TOTAL', S8: 'UN.', T8: 'QT.', U8: 'M. OBRA', V8: 'MATERIAL', W8: 'M. OBRA',
      X8: 'MATERIAL', Y8: 'TOTAL',
    }
    for (const [cel, val] of Object.entries(esperado)) expect(ws.getCell(cel).value).toBe(val)
  })

  it('bloco de rentabilidade AA/AB', () => {
    const ws = build()
    expect(ws.getCell('AA6').value).toBe('líq')
    expect(ws.getCell('AB6').value).toBe('líq%')
    expect((ws.getCell('AA7').value as { formula: string }).formula).toBe('Y6-AA8-AA9-AA10')
    expect((ws.getCell('AB7').value as { formula: string }).formula).toBe('AA7/Y6')
    expect(ws.getCell('AA8').value).toBe(500)
    expect(ws.getCell('AB8').value).toBe('comissao')
    expect(ws.getCell('AA9').value).toBe(1200)
    expect(ws.getCell('AB9').value).toBe('imposto')
    expect((ws.getCell('AA10').value as { formula: string }).formula).toBe('N6*1.02')
    expect(ws.getCell('AB10').value).toBe('custo')
  })

  it('totais na linha 6 (=SUM/2)', () => {
    const ws = build()
    for (const col of ['L', 'M', 'N', 'W', 'X', 'Y']) {
      const f = (ws.getCell(`${col}6`).value as { formula: string }).formula
      expect(f).toMatch(new RegExp(`^SUM\\(${col}9:${col}\\d+\\)/2$`))
    }
  })
})

describe('montarPlanilhaDescritivo — linha de item (fórmulas)', () => {
  it('primeiro item (linha 10): fórmulas de custo, FEE, venda', () => {
    const ws = build()
    // grupo A ocupa linha 9; itens em 10 e 11
    expect(ws.getCell('A10').value).toBe('A')
    expect(ws.getCell('B10').value).toBe(1)
    expect(ws.getCell('E10').value).toBe('-')
    expect(ws.getCell('F10').value).toBe('-')
    expect(ws.getCell('J10').value).toBe(350)
    expect(ws.getCell('K10').value).toBe(700)
    expect((ws.getCell('L10').value as { formula: string }).formula).toBe('J10*I10')
    expect((ws.getCell('M10').value as { formula: string }).formula).toBe('K10*I10')
    expect((ws.getCell('N10').value as { formula: string }).formula).toBe('L10+M10')
    expect((ws.getCell('O10').value as { formula: string }).formula).toBe('J10*1.02')
    expect((ws.getCell('P10').value as { formula: string }).formula).toBe('O10*1.7')
    expect((ws.getCell('Q10').value as { formula: string }).formula).toBe('K10*1.02')
    expect((ws.getCell('R10').value as { formula: string }).formula).toBe('Q10*1.7')
    expect((ws.getCell('S10').value as { formula: string }).formula).toBe('H10')
    expect((ws.getCell('T10').value as { formula: string }).formula).toBe('I10')
    expect((ws.getCell('U10').value as { formula: string }).formula).toBe('P10')
    expect((ws.getCell('V10').value as { formula: string }).formula).toBe('R10')
    expect((ws.getCell('W10').value as { formula: string }).formula).toBe('U10*T10')
    expect((ws.getCell('X10').value as { formula: string }).formula).toBe('V10*T10')
    expect((ws.getCell('Y10').value as { formula: string }).formula).toBe('W10+X10')
  })

  it('FEE por item: item 2 tem fee_mao_obra=1 → O11=K? não, O11=J11*1', () => {
    const ws = build()
    expect((ws.getCell('O11').value as { formula: string }).formula).toBe('J11*1')
    // material do item 2 sem override → usa fee_fator 1.02
    expect((ws.getCell('Q11').value as { formula: string }).formula).toBe('K11*1.02')
  })

  it('linha de disciplina (9): subtotais por SUM e "-" nas colunas de item', () => {
    const ws = build()
    expect(ws.getCell('A9').value).toBe('A')
    expect(ws.getCell('C9').value).toBe('PRÉ-OBRA')
    expect(ws.getCell('E9').value).toBe('-')
    expect((ws.getCell('L9').value as { formula: string }).formula).toBe('SUM(L10:L11)')
    expect((ws.getCell('M9').value as { formula: string }).formula).toBe('SUM(M10:M11)')
    expect((ws.getCell('N9').value as { formula: string }).formula).toBe('L9+M9')
    expect((ws.getCell('W9').value as { formula: string }).formula).toBe('SUM(W10:W11)')
    expect((ws.getCell('X9').value as { formula: string }).formula).toBe('SUM(X10:X11)')
    expect((ws.getCell('Y9').value as { formula: string }).formula).toBe('W9+X9')
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm run test:run -- lib/excel/export-template.test.ts`
Expected: FAIL — a assinatura antiga de `montarPlanilhaDescritivo` não aceita `fatores`; colunas O–AB e formatos novos não existem.

- [ ] **Step 3: Reescrever `lib/excel/export-template.ts`**

Substituir todo o conteúdo do arquivo por:

```typescript
import ExcelJS from 'exceljs'

// Fidelidade ao descritivo técnico e comercial real da empresa (28 colunas A–AB),
// inspecionado célula a célula em 2026-07-10 sobre 07982 sp check-up - mykonos.xlsx.
// Ver spec docs/superpowers/specs/2026-07-10-export-tecnico-completo-design.md.

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

// Colunas da grade principal (A..Y = 1..25). Z(26) espaçadora, AA/AB(27/28) rentabilidade.
const GRID_COLS = 25
const MONEY_COLS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25]
const QT_COLS = [9, 20]
const COLUMN_WIDTHS = [
  5.8, 4.4, 59.9, 18.1, 9.9, 7.3, 10.3, 5.1, 4.8, 8.5, 7.0, 8.8, 8.8, 8.8,
  8.6, 7.2, 7.0, 7.0, 5.1, 4.8, 8.5, 9.3, 8.8, 9.3, 8.8, 0.5, 8.8, 6.7,
]

export interface ObraCabecalho {
  codigo: string
  nome: string
  cliente: { razao_social: string; endereco: string | null; cnpj: string | null } | null
}

export interface ItemDescritivo {
  numero: number
  descricao: string
  local: string | null
  unidade_sigla: string
  quantidade: number
  custo_unit_mao_obra: number
  custo_unit_material: number
  markup_mao_obra: number
  markup_material: number
  fee_mao_obra: number | null
  fee_material: number | null
}

export interface GrupoComItens {
  letra: string
  ordem: number
  disciplina_nome: string
  itens: ItemDescritivo[]
}

export interface FatoresObra {
  fee_fator: number
  comissao_valor: number
  imposto_valor: number
}

// Número cru para embutir em fórmula (sem notação científica em faixa normal).
function num(n: number): string {
  return (Number.isFinite(n) ? n : 0).toString()
}

function estilizarGrade(
  row: ExcelJS.Row,
  opts: { bold: boolean; fill: typeof GROUP_FILL | typeof NO_FILL },
) {
  for (let c = 1; c <= GRID_COLS; c++) {
    const cell = row.getCell(c)
    cell.font = opts.bold ? FONT_BOLD : FONT_BASE
    cell.fill = opts.fill
    cell.border = HAIR_BORDER
    cell.alignment = c === 3 ? ALIGN_WRAP : ALIGN_TOP_LEFT
    if (MONEY_COLS.includes(c)) cell.numFmt = NUMFMT_MONEY
    if (QT_COLS.includes(c)) cell.numFmt = NUMFMT_QT
  }
}

export function montarPlanilhaDescritivo(
  obra: ObraCabecalho,
  grupos: GrupoComItens[],
  fatores: FatoresObra,
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.calcProperties.fullCalcOnLoad = true
  wb.creator = 'Sistema de Orçamentos'
  const ws = wb.addWorksheet('.')

  ws.columns = COLUMN_WIDTHS.map(width => ({ width }))
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 8, topLeftCell: 'A9', showGridLines: false }]

  // Cabeçalho da empresa (linhas 1-5)
  ws.getCell('C1').value = 'DESCRITIVO TÉCNICO E COMERCIAL'
  ws.getCell('Y1').value = { formula: 'TODAY()' }
  ws.getCell('Y1').numFmt = 'mm-dd-yy'
  ws.getCell('C2').value = obra.cliente?.razao_social ?? ''
  ws.getCell('C3').value = `ENDEREÇO: ${obra.cliente?.endereco ?? ''}`
  ws.getCell('C4').value = `CNPJ: ${obra.cliente?.cnpj ?? ''}`
  ws.getCell('C5').value = `${obra.codigo} ${obra.nome}`
  for (let r = 1; r <= 5; r++) {
    for (let c = 1; c <= 28; c++) {
      const cell = ws.getRow(r).getCell(c)
      cell.font = FONT_BOLD
      cell.alignment = c === 3 ? ALIGN_WRAP : ALIGN_TOP_LEFT
    }
  }

  // Linha 7: títulos de bloco (mesclados onde o original mescla)
  ws.mergeCells('J7:K7'); ws.getCell('J7').value = 'PREÇOS UNITÁRIOS'
  ws.mergeCells('L7:M7'); ws.getCell('L7').value = 'SUB TOTAL'
  ws.getCell('N7').value = 'TOTAL'
  ws.getCell('O7').value = 'FEE M.OBRA'
  ws.getCell('P7').value = '$ M.OBRA'
  ws.getCell('Q7').value = 'FEE MAT'
  ws.getCell('R7').value = '$ MAT'
  ws.mergeCells('U7:V7'); ws.getCell('U7').value = 'PREÇOS UNITÁRIOS'
  ws.mergeCells('W7:X7'); ws.getCell('W7').value = 'SUB TOTAL'
  ws.getCell('Y7').value = 'TOTAL'

  // Linha 8: cabeçalhos de coluna (O–R ficam vazios; título fica na linha 7)
  const HEADERS: [number, string][] = [
    [1, 'ITEM'], [2, 'Nº'], [3, 'DESCRIÇÃO'], [4, 'DISCIPLINA'], [5, 'CATEGORIA'],
    [6, 'FRENTE'], [7, 'LOCAL'], [8, 'UN.'], [9, 'QT.'], [10, 'M. OBRA'], [11, 'MAT'],
    [12, 'M. OBRA'], [13, 'MAT'], [14, 'TOTAL'], [19, 'UN.'], [20, 'QT.'],
    [21, 'M. OBRA'], [22, 'MATERIAL'], [23, 'M. OBRA'], [24, 'MATERIAL'], [25, 'TOTAL'],
  ]
  for (const [c, h] of HEADERS) ws.getCell(8, c).value = h

  estilizarGrade(ws.getRow(7), { bold: true, fill: NO_FILL })
  estilizarGrade(ws.getRow(8), { bold: true, fill: NO_FILL })

  // Linhas de dados a partir da 9
  let r = 9
  const primeiraLinha = r
  for (const grupo of grupos) {
    const grupoRow = r
    const primeiroItem = r + 1
    const ultimoItem = r + grupo.itens.length
    ws.getCell(grupoRow, 1).value = grupo.letra
    ws.getCell(grupoRow, 2).value = grupo.letra
    ws.getCell(grupoRow, 3).value = grupo.disciplina_nome.toUpperCase()
    for (const c of [4, 5, 6, 7, 8, 9, 10, 11, 15, 16, 17, 18, 19, 20, 21, 22]) {
      ws.getCell(grupoRow, c).value = '-'
    }
    ws.getCell(grupoRow, 12).value = { formula: `SUM(L${primeiroItem}:L${ultimoItem})` }
    ws.getCell(grupoRow, 13).value = { formula: `SUM(M${primeiroItem}:M${ultimoItem})` }
    ws.getCell(grupoRow, 14).value = { formula: `L${grupoRow}+M${grupoRow}` }
    ws.getCell(grupoRow, 23).value = { formula: `SUM(W${primeiroItem}:W${ultimoItem})` }
    ws.getCell(grupoRow, 24).value = { formula: `SUM(X${primeiroItem}:X${ultimoItem})` }
    ws.getCell(grupoRow, 25).value = { formula: `W${grupoRow}+X${grupoRow}` }
    estilizarGrade(ws.getRow(grupoRow), { bold: true, fill: GROUP_FILL })
    r++

    for (const item of grupo.itens) {
      const feeMO = item.fee_mao_obra ?? fatores.fee_fator
      const feeMAT = item.fee_material ?? fatores.fee_fator
      ws.getCell(r, 1).value = grupo.letra
      ws.getCell(r, 2).value = item.numero
      ws.getCell(r, 3).value = item.descricao
      ws.getCell(r, 4).value = grupo.disciplina_nome
      ws.getCell(r, 5).value = '-'
      ws.getCell(r, 6).value = '-'
      ws.getCell(r, 7).value = item.local ?? ''
      ws.getCell(r, 8).value = item.unidade_sigla
      ws.getCell(r, 9).value = item.quantidade
      ws.getCell(r, 10).value = item.custo_unit_mao_obra
      ws.getCell(r, 11).value = item.custo_unit_material
      ws.getCell(r, 12).value = { formula: `J${r}*I${r}` }
      ws.getCell(r, 13).value = { formula: `K${r}*I${r}` }
      ws.getCell(r, 14).value = { formula: `L${r}+M${r}` }
      ws.getCell(r, 15).value = { formula: `J${r}*${num(feeMO)}` }
      ws.getCell(r, 16).value = { formula: `O${r}*${num(item.markup_mao_obra)}` }
      ws.getCell(r, 17).value = { formula: `K${r}*${num(feeMAT)}` }
      ws.getCell(r, 18).value = { formula: `Q${r}*${num(item.markup_material)}` }
      ws.getCell(r, 19).value = { formula: `H${r}` }
      ws.getCell(r, 20).value = { formula: `I${r}` }
      ws.getCell(r, 21).value = { formula: `P${r}` }
      ws.getCell(r, 22).value = { formula: `R${r}` }
      ws.getCell(r, 23).value = { formula: `U${r}*T${r}` }
      ws.getCell(r, 24).value = { formula: `V${r}*T${r}` }
      ws.getCell(r, 25).value = { formula: `W${r}+X${r}` }
      estilizarGrade(ws.getRow(r), { bold: false, fill: NO_FILL })
      r++
    }
  }
  const ultimaLinha = r - 1

  // Linha 6: totais /2 (cada subtotal aparece uma vez nos itens e uma nas disciplinas)
  ws.getCell('L6').value = { formula: `SUM(L${primeiraLinha}:L${ultimaLinha})/2` }
  ws.getCell('M6').value = { formula: `SUM(M${primeiraLinha}:M${ultimaLinha})/2` }
  ws.getCell('N6').value = { formula: `SUM(N${primeiraLinha}:N${ultimaLinha})/2` }
  ws.getCell('W6').value = { formula: `SUM(W${primeiraLinha}:W${ultimaLinha})/2` }
  ws.getCell('X6').value = { formula: `SUM(X${primeiraLinha}:X${ultimaLinha})/2` }
  ws.getCell('Y6').value = { formula: `SUM(Y${primeiraLinha}:Y${ultimaLinha})/2` }
  estilizarGrade(ws.getRow(6), { bold: true, fill: NO_FILL })

  // Bloco de rentabilidade (AA/AB), fora da grade principal
  ws.getCell('AA6').value = 'líq'
  ws.getCell('AB6').value = 'líq%'
  ws.getCell('AA7').value = { formula: 'Y6-AA8-AA9-AA10' }
  ws.getCell('AB7').value = { formula: 'AA7/Y6' }
  ws.getCell('AA8').value = fatores.comissao_valor
  ws.getCell('AB8').value = 'comissao'
  ws.getCell('AA9').value = fatores.imposto_valor
  ws.getCell('AB9').value = 'imposto'
  ws.getCell('AA10').value = { formula: `N6*${num(fatores.fee_fator)}` }
  ws.getCell('AB10').value = 'custo'
  for (let rr = 6; rr <= 10; rr++) {
    ws.getCell(rr, 27).font = FONT_BOLD
    ws.getCell(rr, 28).font = FONT_BOLD
  }
  for (const cel of ['AA7', 'AA8', 'AA9', 'AA10']) ws.getCell(cel).numFmt = NUMFMT_MONEY
  ws.getCell('AB7').numFmt = NUMFMT_QT

  ws.autoFilter = { from: 'A8', to: `Y${ultimaLinha}` }

  return wb
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npm run test:run -- lib/excel/export-template.test.ts`
Expected: PASS (todos os testes deste arquivo).

- [ ] **Step 5: Rodar a suíte completa**

Run: `npm run test:run`
Expected: todos passando (a rota ainda não foi atualizada, mas ela não tem teste unitário; o typecheck da rota é tratado na Task 2).

- [ ] **Step 6: Commit**

```bash
git add lib/excel/export-template.ts lib/excel/export-template.test.ts
git commit -m "feat: export tecnico com layout completo de 28 colunas (custo/fee/venda/rentabilidade)"
```

---

### Task 2: Ligar a rota de export aos novos dados + verificação manual

**Files:**
- Modify: `app/api/obras/[id]/export/route.ts`

**Interfaces:**
- Consumes: `montarPlanilhaDescritivo(obra, grupos, fatores)` (Task 1) — precisa de `markup_mao_obra`, `markup_material`, `fee_mao_obra`, `fee_material` por item e `FatoresObra`.

- [ ] **Step 1: Atualizar o select e o mapeamento na rota**

Em `app/api/obras/[id]/export/route.ts`, trocar o `.select(...)` da query (linhas ~18-32) por:

```typescript
    .select(`
      codigo, nome, fee_fator, comissao_valor, imposto_valor,
      clientes (razao_social, endereco, cnpj),
      grupos_orcamento (
        letra, ordem,
        disciplinas (nome),
        itens_orcamento (
          numero, descricao, local, ordem,
          quantidade, custo_unit_mao_obra, custo_unit_material,
          markup_mao_obra, markup_material, fee_mao_obra, fee_material,
          unidades_medida (sigla)
        )
      )
    `)
```

Trocar o `.map(item => ({ ... }))` (linhas ~52-62) por:

```typescript
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
```

Trocar a chamada de `montarPlanilhaDescritivo` (linhas ~65-68) por:

```typescript
  const wb = montarPlanilhaDescritivo(
    { codigo: obra.codigo, nome: obra.nome, cliente },
    grupos,
    {
      fee_fator: Number(obra.fee_fator ?? 1.02),
      comissao_valor: Number(obra.comissao_valor ?? 0),
      imposto_valor: Number(obra.imposto_valor ?? 0),
    },
  )
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: nenhum erro novo nos arquivos tocados (`export-template.ts`, `export/route.ts`). Erros pré-existentes em `*.test.tsx` de auth (falta de globals do vitest) não são desta task.

- [ ] **Step 3: Verificação manual (round-trip com obra real)**

1. Garantir o dev server rodando (`npm run dev`).
2. Abrir a obra mykonos no app e clicar em **↓ Exportar Técnico**.
3. Abrir o `.xlsx` baixado no Excel e conferir:
   - Todas as 28 colunas (A–AB) presentes, na ordem da planilha original.
   - Linha 6: `Y6` = **5.957.042,00** (ou o total atual da obra), `N6` = total de custo.
   - Bloco AA/AB: comissão/imposto refletindo o que está na obra; `AA7` (líq) = `Y6 − comissão − imposto − custo`.
   - Linhas de disciplina em cinza; itens com FEE (`O`) = custo×1,02 (ou ×1 nos itens com override).
4. Comparar `Y6`, `N6`, `W6`, `X6` com a planilha original — devem bater (ao centavo, dado que a migration 009 já corrigiu a precisão do custo e a obra foi reimportada).

- [ ] **Step 4: Commit**

```bash
git add "app/api/obras/[id]/export/route.ts"
git commit -m "feat: rota de export passa markup, fee por item e fatores da obra ao gerador"
```

---

## Self-Review

**Cobertura da spec:**
- 28 colunas A–AB → Task 1 (HEADERS + fórmulas por coluna + AA/AB). ✅
- Fórmulas nativas (custo/FEE/venda) → Task 1 (células `{ formula }`). ✅
- Rentabilidade com valores manuais da obra → Task 1 (`AA8=comissao_valor`, `AA9=imposto_valor`, `AA10=N6*fee_fator`, `AA7` líq). ✅
- FEE por item (override) → Task 1 (`feeMO = item.fee_mao_obra ?? fee_fator`). ✅
- CATEGORIA/FRENTE = "-" → Task 1 (col 5/6 = '-'). ✅
- Totais linha 6 `=SUM/2` → Task 1. ✅
- Estilo (fonte, bordas, fill, larguras, merges, freeze, autofilter) → Task 1. ✅
- Rota passa markup/fee/fatores → Task 2. ✅

**Placeholders:** nenhum — todo o código de gerador, teste e rota está completo acima.

**Consistência de tipos:** `montarPlanilhaDescritivo(obra, grupos, fatores)` com `FatoresObra`/`ItemDescritivo`/`GrupoComItens` é usado igual na Task 1 (definição + teste) e na Task 2 (chamada da rota). `markup_mao_obra`/`markup_material`/`fee_mao_obra`/`fee_material` têm os mesmos nomes na interface, no select da rota e no map.
