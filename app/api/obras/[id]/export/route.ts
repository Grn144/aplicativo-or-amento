import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcularItem } from '@/lib/calculos'
import ExcelJS from 'exceljs'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params

  const { data: obra, error } = await supabase
    .from('obras')
    .select(`
      codigo, nome,
      clientes (razao_social),
      grupos_orcamento (
        letra, ordem,
        disciplinas (nome),
        itens_orcamento (
          numero, descricao, local, ordem,
          quantidade, custo_unit_mao_obra, custo_unit_material,
          margem_mao_obra_pct, margem_material_pct,
          unidades_medida (sigla)
        )
      )
    `)
    .eq('id', id)
    .single()

  if (error || !obra) {
    return NextResponse.json({ error: 'Obra não encontrada' }, { status: 404 })
  }

  // Ordenar grupos e itens
  const grupos = (obra.grupos_orcamento ?? []).sort((a, b) => a.ordem - b.ordem)
  grupos.forEach(g => {
    g.itens_orcamento?.sort((a, b) => a.ordem - b.ordem)
  })

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Sistema de Orçamentos'
  const ws = wb.addWorksheet('Orçamento Comercial')

  // Larguras das colunas
  ws.columns = [
    { key: 'item',    width: 8  },
    { key: 'num',     width: 6  },
    { key: 'desc',    width: 40 },
    { key: 'local',   width: 20 },
    { key: 'un',      width: 8  },
    { key: 'qt',      width: 10 },
    { key: 'pu_mo',   width: 16 },
    { key: 'pu_mat',  width: 16 },
    { key: 'sub_mo',  width: 16 },
    { key: 'sub_mat', width: 16 },
    { key: 'total',   width: 16 },
  ]

  // Cabeçalho da obra
  const clienteNome = (obra.clientes as { razao_social: string } | null)?.razao_social ?? ''
  ws.mergeCells('A1:K1')
  ws.getCell('A1').value = `ORÇAMENTO COMERCIAL — ${obra.codigo} — ${obra.nome}`
  ws.getCell('A1').font = { bold: true, size: 13 }
  ws.getCell('A1').alignment = { horizontal: 'center' }

  if (clienteNome) {
    ws.mergeCells('A2:K2')
    ws.getCell('A2').value = `Cliente: ${clienteNome}`
    ws.getCell('A2').font = { size: 11 }
    ws.getCell('A2').alignment = { horizontal: 'center' }
  }

  ws.addRow([])

  // Cabeçalho das colunas
  const headerRow = ws.addRow([
    'Item', 'Nº', 'Descrição', 'Local', 'UN', 'QT',
    'P. Unit. MO', 'P. Unit. Mat.', 'Sub. MO', 'Sub. Mat.', 'Total',
  ])
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } }
  })

  const fmtBRL = '#,##0.00'
  let totalGeralMO = 0
  let totalGeralMat = 0
  let totalGeral = 0

  for (const grupo of grupos) {
    const disciplinaNome = (grupo.disciplinas as { nome: string } | null)?.nome ?? '—'

    // Linha de grupo
    const grupoRow = ws.addRow([grupo.letra, '', disciplinaNome.toUpperCase()])
    grupoRow.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { bold: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
      if (col <= 11) {
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } }
      }
    })

    const itens = grupo.itens_orcamento ?? []
    for (const item of itens) {
      const calc = calcularItem({
        id: '', grupo_id: '', numero: item.numero, descricao: item.descricao,
        local: item.local ?? null, unidade_id: null, observacao: null,
        observacao_2: null, ordem: item.ordem,
        quantidade: Number(item.quantidade),
        custo_unit_mao_obra: Number(item.custo_unit_mao_obra),
        custo_unit_material: Number(item.custo_unit_material),
        margem_mao_obra_pct: Number(item.margem_mao_obra_pct),
        margem_material_pct: Number(item.margem_material_pct),
      })

      const sigla = (item.unidades_medida as { sigla: string } | null)?.sigla ?? ''
      const itemRow = ws.addRow([
        grupo.letra,
        item.numero,
        item.descricao,
        item.local ?? '',
        sigla,
        Number(item.quantidade),
        calc.preco_unit_mao_obra_venda,
        calc.preco_unit_material_venda,
        calc.subtotal_mao_obra_venda,
        calc.subtotal_material_venda,
        calc.total_venda,
      ])

      // Formatar números
      for (const col of [7, 8, 9, 10, 11]) {
        const cell = itemRow.getCell(col)
        cell.numFmt = fmtBRL
        cell.alignment = { horizontal: 'right' }
      }
      itemRow.getCell(6).alignment = { horizontal: 'right' }
      itemRow.getCell(5).alignment = { horizontal: 'center' }

      totalGeralMO  += calc.subtotal_mao_obra_venda
      totalGeralMat += calc.subtotal_material_venda
      totalGeral    += calc.total_venda
    }
  }

  // Total geral
  ws.addRow([])
  const totalRow = ws.addRow([
    '', '', '', '', '', '', '', 'TOTAL GERAL',
    totalGeralMO, totalGeralMat, totalGeral,
  ])
  totalRow.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
    if (col >= 9 && col <= 11) {
      cell.numFmt = fmtBRL
      cell.alignment = { horizontal: 'right' }
    }
    if (col === 8) cell.alignment = { horizontal: 'right' }
  })

  // Gerar buffer e retornar
  const buffer = await wb.xlsx.writeBuffer()
  const nomeArquivo = `orcamento-comercial-${obra.codigo.replace(/\s+/g, '-')}.xlsx`

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
    },
  })
}
