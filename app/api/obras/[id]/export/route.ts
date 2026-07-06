import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcularItem } from '@/lib/calculos'
import ExcelJS from 'exceljs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const tipo = request.nextUrl.searchParams.get('tipo') === 'tecnico' ? 'tecnico' : 'comercial'

  const { data: obra, error } = await supabase
    .from('obras')
    .select(`
      codigo, nome, fee_fator, comissao_pct, imposto_pct,
      clientes (razao_social),
      grupos_orcamento (
        letra, ordem,
        disciplinas (nome),
        itens_orcamento (
          numero, descricao, local, ordem,
          quantidade, custo_unit_mao_obra, custo_unit_material,
          markup_mao_obra, markup_material,
          unidades_medida (sigla)
        )
      )
    `)
    .eq('id', id)
    .single()

  if (error || !obra) {
    return NextResponse.json({ error: 'Obra não encontrada' }, { status: 404 })
  }

  const grupos = (obra.grupos_orcamento ?? []).sort((a, b) => a.ordem - b.ordem)
  grupos.forEach(g => { g.itens_orcamento?.sort((a, b) => a.ordem - b.ordem) })

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Sistema de Orçamentos'
  const titulo = tipo === 'tecnico' ? 'Orçamento Técnico' : 'Orçamento Comercial'
  const ws = wb.addWorksheet(titulo)
  const fmtBRL = '#,##0.00'

  const clienteNome = (obra.clientes as unknown as { razao_social: string } | null)?.razao_social ?? ''

  if (tipo === 'tecnico') {
    // ── EXPORTAÇÃO TÉCNICA (custos + margens + venda + lucro) ──
    ws.columns = [
      { key: 'item',    width: 8  },
      { key: 'num',     width: 6  },
      { key: 'desc',    width: 36 },
      { key: 'local',   width: 18 },
      { key: 'un',      width: 7  },
      { key: 'qt',      width: 9  },
      { key: 'cmo',     width: 14 },
      { key: 'cmat',    width: 14 },
      { key: 'tcusto',  width: 14 },
      { key: 'mgmo',    width: 10 },
      { key: 'mgmat',   width: 10 },
      { key: 'tvenda',  width: 14 },
      { key: 'lucro',   width: 14 },
      { key: 'mgef',    width: 10 },
    ]

    ws.mergeCells('A1:N1')
    ws.getCell('A1').value = `ORÇAMENTO TÉCNICO — ${obra.codigo} — ${obra.nome}`
    ws.getCell('A1').font = { bold: true, size: 13 }
    ws.getCell('A1').alignment = { horizontal: 'center' }
    if (clienteNome) {
      ws.mergeCells('A2:N2')
      ws.getCell('A2').value = `Cliente: ${clienteNome}`
      ws.getCell('A2').alignment = { horizontal: 'center' }
    }
    ws.addRow([])

    const hdr = ws.addRow([
      'Item', 'Nº', 'Descrição', 'Local', 'UN', 'QT',
      'Custo MO', 'Custo Mat.', 'Total Custo',
      'Mg. MO%', 'Mg. Mat%',
      'Total Venda', 'Lucro', 'Mg. Ef%',
    ])
    hdr.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })

    let totCusto = 0, totVenda = 0, totLucro = 0

    for (const grupo of grupos) {
      const disc = (grupo.disciplinas as unknown as { nome: string } | null)?.nome ?? '—'
      const gr = ws.addRow([grupo.letra, '', disc.toUpperCase()])
      gr.eachCell({ includeEmpty: true }, cell => {
        cell.font = { bold: true }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
      })

      for (const item of grupo.itens_orcamento ?? []) {
        const calc = calcularItem({
          id: '', grupo_id: '', numero: item.numero, descricao: item.descricao,
          local: item.local ?? null, unidade_id: null, observacao: null,
          observacao_2: null, ordem: item.ordem,
          quantidade: Number(item.quantidade),
          custo_unit_mao_obra: Number(item.custo_unit_mao_obra),
          custo_unit_material: Number(item.custo_unit_material),
          markup_mao_obra: Number(item.markup_mao_obra),
          markup_material: Number(item.markup_material),
        }, Number(obra.fee_fator))
        const sigla = (item.unidades_medida as unknown as { sigla: string } | null)?.sigla ?? ''
        const row = ws.addRow([
          grupo.letra, item.numero, item.descricao, item.local ?? '', sigla,
          Number(item.quantidade),
          calc.custo_unit_mao_obra, calc.custo_unit_material, calc.total_custo,
          calc.markup_mao_obra, calc.markup_material,
          calc.total_venda, calc.lucro, calc.margem_efetiva_pct,
        ])
        for (const col of [7, 8, 9, 12, 13]) { row.getCell(col).numFmt = fmtBRL; row.getCell(col).alignment = { horizontal: 'right' } }
        for (const col of [10, 11, 14]) { row.getCell(col).numFmt = '0.00"%"'; row.getCell(col).alignment = { horizontal: 'right' } }
        row.getCell(6).alignment = { horizontal: 'right' }
        row.getCell(5).alignment = { horizontal: 'center' }
        totCusto += calc.total_custo
        totVenda += calc.total_venda
        totLucro += calc.lucro
      }
    }

    ws.addRow([])
    const mgEf = totVenda > 0 ? (totLucro / totVenda) * 100 : 0
    const tot = ws.addRow(['', '', '', '', '', '', '', '', totCusto, '', '', totVenda, totLucro, mgEf])
    tot.getCell(8).value = 'TOTAL GERAL'
    tot.getCell(8).alignment = { horizontal: 'right' }
    tot.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
      if ([9, 12, 13].includes(col)) { cell.numFmt = fmtBRL; cell.alignment = { horizontal: 'right' } }
      if (col === 14) { cell.numFmt = '0.00"%"'; cell.alignment = { horizontal: 'right' } }
    })

  } else {
    // ── EXPORTAÇÃO COMERCIAL (apenas preços de venda, sem custos/margens) ──
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

    ws.mergeCells('A1:K1')
    ws.getCell('A1').value = `ORÇAMENTO COMERCIAL — ${obra.codigo} — ${obra.nome}`
    ws.getCell('A1').font = { bold: true, size: 13 }
    ws.getCell('A1').alignment = { horizontal: 'center' }
    if (clienteNome) {
      ws.mergeCells('A2:K2')
      ws.getCell('A2').value = `Cliente: ${clienteNome}`
      ws.getCell('A2').alignment = { horizontal: 'center' }
    }
    ws.addRow([])

    const hdr = ws.addRow([
      'Item', 'Nº', 'Descrição', 'Local', 'UN', 'QT',
      'P. Unit. MO', 'P. Unit. Mat.', 'Sub. MO', 'Sub. Mat.', 'Total',
    ])
    hdr.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })

    let totMO = 0, totMat = 0, totGeral = 0

    for (const grupo of grupos) {
      const disc = (grupo.disciplinas as unknown as { nome: string } | null)?.nome ?? '—'
      const gr = ws.addRow([grupo.letra, '', disc.toUpperCase()])
      gr.eachCell({ includeEmpty: true }, cell => {
        cell.font = { bold: true }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
      })

      for (const item of grupo.itens_orcamento ?? []) {
        const calc = calcularItem({
          id: '', grupo_id: '', numero: item.numero, descricao: item.descricao,
          local: item.local ?? null, unidade_id: null, observacao: null,
          observacao_2: null, ordem: item.ordem,
          quantidade: Number(item.quantidade),
          custo_unit_mao_obra: Number(item.custo_unit_mao_obra),
          custo_unit_material: Number(item.custo_unit_material),
          markup_mao_obra: Number(item.markup_mao_obra),
          markup_material: Number(item.markup_material),
        }, Number(obra.fee_fator))
        const sigla = (item.unidades_medida as unknown as { sigla: string } | null)?.sigla ?? ''
        const row = ws.addRow([
          grupo.letra, item.numero, item.descricao, item.local ?? '', sigla,
          Number(item.quantidade),
          calc.preco_unit_mao_obra_venda, calc.preco_unit_material_venda,
          calc.subtotal_mao_obra_venda, calc.subtotal_material_venda, calc.total_venda,
        ])
        for (const col of [7, 8, 9, 10, 11]) { row.getCell(col).numFmt = fmtBRL; row.getCell(col).alignment = { horizontal: 'right' } }
        row.getCell(6).alignment = { horizontal: 'right' }
        row.getCell(5).alignment = { horizontal: 'center' }
        totMO += calc.subtotal_mao_obra_venda
        totMat += calc.subtotal_material_venda
        totGeral += calc.total_venda
      }
    }

    ws.addRow([])
    const tot = ws.addRow(['', '', '', '', '', '', '', 'TOTAL GERAL', totMO, totMat, totGeral])
    tot.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
      if ([9, 10, 11].includes(col)) { cell.numFmt = fmtBRL; cell.alignment = { horizontal: 'right' } }
      if (col === 8) cell.alignment = { horizontal: 'right' }
    })
  }

  const buffer = await wb.xlsx.writeBuffer()
  const nomeArquivo = `orcamento-${tipo}-${obra.codigo.replace(/\s+/g, '-')}.xlsx`

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
    },
  })
}
