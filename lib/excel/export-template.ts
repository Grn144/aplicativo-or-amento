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
