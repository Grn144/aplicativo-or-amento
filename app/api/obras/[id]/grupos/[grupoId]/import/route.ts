import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'

// Mapeamento flexível de nomes de colunas do Excel
const COLUMN_MAP: Record<string, string> = {
  'descrição': 'descricao', 'descricao': 'descricao', 'descrip': 'descricao',
  'description': 'descricao', 'desc': 'descricao', 'item': 'descricao',
  'local': 'local', 'localização': 'local', 'localizacao': 'local', 'location': 'local',
  'un': 'unidade', 'und': 'unidade', 'unid': 'unidade', 'unidade': 'unidade',
  'unidades': 'unidade', 'unit': 'unidade', 'sigla': 'unidade',
  'qt': 'quantidade', 'qtd': 'quantidade', 'qtde': 'quantidade', 'quantidade': 'quantidade',
  'qty': 'quantidade', 'quant': 'quantidade',
  'custo mo': 'custo_unit_mao_obra', 'custo mão de obra': 'custo_unit_mao_obra',
  'custo mao de obra': 'custo_unit_mao_obra', 'mo': 'custo_unit_mao_obra',
  'mão de obra': 'custo_unit_mao_obra', 'mao de obra': 'custo_unit_mao_obra',
  'custo_unit_mao_obra': 'custo_unit_mao_obra', 'p.unit mo': 'custo_unit_mao_obra',
  'custo mat': 'custo_unit_material', 'custo material': 'custo_unit_material',
  'material': 'custo_unit_material', 'mat': 'custo_unit_material',
  'custo_unit_material': 'custo_unit_material', 'p.unit mat': 'custo_unit_material',
  'margem mo%': 'margem_mao_obra_pct', 'margem mo': 'margem_mao_obra_pct',
  'mg mo': 'margem_mao_obra_pct', 'margem_mao_obra_pct': 'margem_mao_obra_pct',
  'margem mat%': 'margem_material_pct', 'margem mat': 'margem_material_pct',
  'mg mat': 'margem_material_pct', 'margem_material_pct': 'margem_material_pct',
  'obs': 'observacao', 'observação': 'observacao', 'observacao': 'observacao',
  'observações': 'observacao', 'observacoes': 'observacao',
}

function normalizar(s: string): string {
  return s.toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; grupoId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { grupoId: grupo_id } = await params

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0])

  const ws = wb.worksheets[0]
  if (!ws) return NextResponse.json({ error: 'Planilha vazia ou inválida' }, { status: 400 })

  // Detectar linha de cabeçalho (primeira linha não vazia)
  let headerRowNum = 1
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const row = ws.getRow(r)
    const vals = row.values as (string | undefined)[]
    if (vals.some(v => v && String(v).trim())) { headerRowNum = r; break }
  }

  const headerRow = ws.getRow(headerRowNum)
  const colMap: Record<number, string> = {}
  ;(headerRow.values as (string | undefined)[]).forEach((cell, idx) => {
    if (!cell) return
    const norm = normalizar(String(cell))
    const campo = COLUMN_MAP[norm]
    if (campo) colMap[idx] = campo
  })

  if (!colMap[Object.keys(colMap).map(Number).find(k => colMap[k] === 'descricao') ?? -1]) {
    // Tenta detectar sem cabeçalho (coluna A = descricao)
    colMap[1] = 'descricao'
  }

  // Buscar unidades para mapeamento de sigla → id
  const { data: unidades } = await supabase
    .from('unidades_medida')
    .select('id, sigla')

  const unidadeMap: Record<string, string> = {}
  for (const u of unidades ?? []) {
    unidadeMap[u.sigla.toUpperCase()] = u.id
  }

  // Número de itens já existentes no grupo (para numeração)
  const { count: countExistente } = await supabase
    .from('itens_orcamento')
    .select('*', { count: 'exact', head: true })
    .eq('grupo_id', grupo_id)

  let proximoNumero = (countExistente ?? 0) + 1
  const itensParaInserir: Record<string, unknown>[] = []

  for (let r = headerRowNum + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const vals = row.values as (unknown)[]

    const getVal = (campo: string): string => {
      const idx = Object.keys(colMap).map(Number).find(k => colMap[k] === campo)
      return idx !== undefined ? String(vals[idx] ?? '').trim() : ''
    }
    const getNum = (campo: string): number => {
      const v = getVal(campo)
      return v ? parseFloat(v.replace(',', '.')) || 0 : 0
    }

    const descricao = getVal('descricao')
    if (!descricao) continue  // pula linhas vazias

    const sigla = getVal('unidade').toUpperCase()
    const unidade_id = unidadeMap[sigla] ?? null

    itensParaInserir.push({
      grupo_id,
      numero: proximoNumero,
      ordem: proximoNumero,
      descricao,
      local: getVal('local') || null,
      unidade_id,
      quantidade: getNum('quantidade') || 1,
      custo_unit_mao_obra: getNum('custo_unit_mao_obra'),
      custo_unit_material: getNum('custo_unit_material'),
      margem_mao_obra_pct: getNum('margem_mao_obra_pct'),
      margem_material_pct: getNum('margem_material_pct'),
      observacao: getVal('observacao') || null,
      observacao_2: null,
    })
    proximoNumero++
  }

  if (itensParaInserir.length === 0) {
    return NextResponse.json({ error: 'Nenhum item encontrado na planilha' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('itens_orcamento')
    .insert(itensParaInserir)
    .select('*, unidades_medida(*)')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ itens: data, importados: data?.length ?? 0 }, { status: 201 })
}
