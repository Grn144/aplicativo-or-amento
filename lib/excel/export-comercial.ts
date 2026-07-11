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
