import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcularItem, calcularGrupo, calcularRentabilidade } from '@/lib/calculos'
import type { ItemOrcamento, GrupoOrcamento } from '@/types/database'
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
      clientes (razao_social, endereco, cnpj),
      grupos_orcamento (
        letra, ordem,
        disciplinas (nome),
        itens_orcamento (
          numero, descricao, local, ordem,
          quantidade, custo_unit_mao_obra, custo_unit_material,
          markup_mao_obra, markup_material, observacao,
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
  const titulo = tipo === 'tecnico' ? 'Descritivo Técnico' : 'Orçamento Comercial'
  const ws = wb.addWorksheet(titulo)
  const fmtBRL = '#,##0.00'

  const cliente = obra.clientes as unknown as { razao_social: string; endereco: string | null; cnpj: string | null } | null
  const clienteNome = cliente?.razao_social ?? ''
  const feeFator = Number(obra.fee_fator)

  const construirItem = (item: {
    numero: number; descricao: string; local: string | null; ordem: number
    quantidade: number; custo_unit_mao_obra: number; custo_unit_material: number
    markup_mao_obra: number; markup_material: number; observacao: string | null
  }): ItemOrcamento => ({
    id: '', grupo_id: '', numero: item.numero, descricao: item.descricao,
    local: item.local ?? null, unidade_id: null, observacao: item.observacao ?? null,
    observacao_2: null, ordem: item.ordem,
    quantidade: Number(item.quantidade),
    custo_unit_mao_obra: Number(item.custo_unit_mao_obra),
    custo_unit_material: Number(item.custo_unit_material),
    markup_mao_obra: Number(item.markup_mao_obra),
    markup_material: Number(item.markup_material),
  })

  const headerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1F2937' } }
  const groupFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF3F4F6' } }

  if (tipo === 'tecnico') {
    // ── EXPORTAÇÃO TÉCNICA (dois blocos: custo/FEE e venda) ──
    ws.columns = [
      { key: 'item',       width: 8  },
      { key: 'num',        width: 6  },
      { key: 'desc',       width: 34 },
      { key: 'disciplina', width: 16 },
      { key: 'local',      width: 16 },
      { key: 'un1',        width: 7  },
      { key: 'qt1',        width: 9  },
      { key: 'mo',         width: 12 },
      { key: 'mat',        width: 12 },
      { key: 'subtmo_c',   width: 14 },
      { key: 'subtmat_c',  width: 14 },
      { key: 'total_c',    width: 14 },
      { key: 'fee_mo',     width: 12 },
      { key: 'p_mo',       width: 12 },
      { key: 'fee_mat',    width: 12 },
      { key: 'p_mat',      width: 12 },
      { key: 'un2',        width: 7  },
      { key: 'qt2',        width: 9  },
      { key: 'p_mo2',      width: 12 },
      { key: 'p_mat2',     width: 12 },
      { key: 'subtmo_v',   width: 14 },
      { key: 'subtmat_v',  width: 14 },
      { key: 'total_v',    width: 14 },
      { key: 'obs',        width: 24 },
    ]
    const NUM_COLS = ws.columns.length

    ws.mergeCells(1, 1, 1, NUM_COLS)
    ws.getCell(1, 1).value = 'DESCRITIVO TÉCNICO E COMERCIAL'
    ws.getCell(1, 1).font = { bold: true, size: 13 }
    ws.getCell(1, 1).alignment = { horizontal: 'center' }

    ws.mergeCells(2, 1, 2, NUM_COLS)
    ws.getCell(2, 1).value = clienteNome
    ws.getCell(2, 1).alignment = { horizontal: 'center' }

    ws.mergeCells(3, 1, 3, NUM_COLS)
    ws.getCell(3, 1).value = `ENDEREÇO: ${cliente?.endereco ?? ''}`
    ws.getCell(3, 1).alignment = { horizontal: 'center' }

    ws.mergeCells(4, 1, 4, NUM_COLS)
    ws.getCell(4, 1).value = `CNPJ: ${cliente?.cnpj ?? ''}`
    ws.getCell(4, 1).alignment = { horizontal: 'center' }

    ws.mergeCells(5, 1, 5, NUM_COLS)
    ws.getCell(5, 1).value = `${obra.codigo} ${obra.nome}`
    ws.getCell(5, 1).font = { bold: true }
    ws.getCell(5, 1).alignment = { horizontal: 'center' }

    const hdr = ws.addRow([
      'ITEM', 'Nº', 'DESCRIÇÃO', 'DISCIPLINA', 'LOCAL', 'UN.', 'QT.',
      'M. OBRA', 'MAT', 'SUB TOTAL M.OBRA', 'SUB TOTAL MAT', 'TOTAL',
      'FEE M.OBRA', '$ M.OBRA', 'FEE MAT', '$ MAT',
      'UN.', 'QT.', '$ M.OBRA', '$ MAT', 'SUB TOTAL M.OBRA', 'SUB TOTAL MAT', 'TOTAL',
      'OBS.',
    ])
    hdr.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = headerFill
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })

    const gruposCalculados = grupos.map(grupo =>
      calcularGrupo(
        {
          id: '', obra_id: '', disciplina_id: '', letra: grupo.letra, ordem: grupo.ordem,
          itens_orcamento: (grupo.itens_orcamento ?? []).map(construirItem),
        } as GrupoOrcamento & { itens_orcamento: ItemOrcamento[] },
        feeFator
      )
    )

    let totalCustoGeral = 0
    let totalVendaGeral = 0

    grupos.forEach((grupo, idx) => {
      const disc = (grupo.disciplinas as unknown as { nome: string } | null)?.nome ?? '—'
      const totaisGrupo = gruposCalculados[idx].totais

      const gr = ws.addRow([
        `${grupo.letra} ${disc.toUpperCase()}`, '', '', '', '', '', '',
        '', '', totaisGrupo.subtotal_mao_obra_custo, totaisGrupo.subtotal_material_custo, totaisGrupo.total_custo,
        '', '', '', '',
        '', '', '', '', totaisGrupo.subtotal_mao_obra_venda, totaisGrupo.subtotal_material_venda, totaisGrupo.total_venda,
        '',
      ])
      gr.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.font = { bold: true }
        cell.fill = groupFill
        if ([10, 11, 12, 20, 21, 22].includes(col)) { cell.numFmt = fmtBRL; cell.alignment = { horizontal: 'right' } }
      })

      totalCustoGeral += totaisGrupo.total_custo
      totalVendaGeral += totaisGrupo.total_venda

      for (const item of grupo.itens_orcamento ?? []) {
        const calc = calcularItem(construirItem(item), feeFator)
        const sigla = (item.unidades_medida as unknown as { sigla: string } | null)?.sigla ?? ''
        const row = ws.addRow([
          grupo.letra, item.numero, item.descricao, disc, item.local ?? '', sigla, Number(item.quantidade),
          calc.custo_unit_mao_obra, calc.custo_unit_material,
          calc.subtotal_mao_obra_custo, calc.subtotal_material_custo, calc.total_custo,
          calc.fee_unit_mao_obra, calc.preco_unit_mao_obra_venda, calc.fee_unit_material, calc.preco_unit_material_venda,
          sigla, Number(item.quantidade),
          calc.preco_unit_mao_obra_venda, calc.preco_unit_material_venda,
          calc.subtotal_mao_obra_venda, calc.subtotal_material_venda, calc.total_venda,
          calc.observacao ?? '',
        ])
        for (const col of [8, 9, 10, 11, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23]) {
          row.getCell(col).numFmt = fmtBRL
          row.getCell(col).alignment = { horizontal: 'right' }
        }
        row.getCell(7).alignment = { horizontal: 'right' }
        row.getCell(18).alignment = { horizontal: 'right' }
        row.getCell(6).alignment = { horizontal: 'center' }
        row.getCell(17).alignment = { horizontal: 'center' }
      }
    })

    ws.addRow([])
    const totRow = ws.addRow([
      '', '', '', '', '', '', '', '', '', '', 'TOTAL GERAL', totalCustoGeral,
      '', '', '', '', '', '', '', '', '', '', totalVendaGeral, '',
    ])
    totRow.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = headerFill
      if ([12, 23].includes(col)) { cell.numFmt = fmtBRL; cell.alignment = { horizontal: 'right' } }
      if (col === 11) cell.alignment = { horizontal: 'right' }
    })

    const rentabilidade = calcularRentabilidade(gruposCalculados, {
      fee_fator: feeFator,
      comissao_pct: Number(obra.comissao_pct),
      imposto_pct: Number(obra.imposto_pct),
    })

    ws.addRow([])
    const addResumo = (label: string, valor: number, formatoPct = false) => {
      const r = ws.addRow([label])
      r.getCell(1).font = { bold: true }
      const cell = r.getCell(2)
      cell.value = valor
      cell.numFmt = formatoPct ? '0.00"%"' : fmtBRL
      cell.alignment = { horizontal: 'right' }
    }
    addResumo('Comissão', rentabilidade.comissao)
    addResumo('Imposto', rentabilidade.imposto)
    addResumo('Custo', rentabilidade.custo_com_fee)
    addResumo('Líquido', rentabilidade.liquido)
    addResumo('Líquido %', rentabilidade.liquido_pct ?? 0, true)

  } else {
    // ── EXPORTAÇÃO COMERCIAL (apenas preços de venda, sem custos/FEE/markup) ──
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
      'ITEM', 'Nº', 'DESCRIÇÃO', 'LOCAL', 'UN.', 'QT.',
      '$ M.OBRA', '$ MAT', 'SUB TOTAL M.OBRA', 'SUB TOTAL MAT', 'TOTAL',
    ])
    hdr.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = headerFill
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })

    let totMO = 0, totMat = 0, totGeral = 0

    for (const grupo of grupos) {
      const disc = (grupo.disciplinas as unknown as { nome: string } | null)?.nome ?? '—'
      const gr = ws.addRow([grupo.letra, '', disc.toUpperCase()])
      gr.eachCell({ includeEmpty: true }, cell => {
        cell.font = { bold: true }
        cell.fill = groupFill
      })

      for (const item of grupo.itens_orcamento ?? []) {
        const calc = calcularItem(construirItem(item), feeFator)
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
      cell.fill = headerFill
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
