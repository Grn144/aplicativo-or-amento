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
        markup_mao_obra, markup_material
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
