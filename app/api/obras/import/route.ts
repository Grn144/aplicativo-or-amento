import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parsePlanilhaObra, parseCabecalhoObra, type Celula } from '@/lib/excel/parse-obra'
import { inserirConteudoObra } from '@/lib/excel/importar-obra'
import ExcelJS from 'exceljs'

// Cria uma obra nova a partir de uma planilha exportada pelo sistema: lê o
// cabeçalho (código, nome, cliente, endereço, cnpj) para criar a obra e o
// cliente (se necessário), e importa disciplinas/grupos/itens do conteúdo.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0])
  const ws = wb.worksheets[0]
  if (!ws) return NextResponse.json({ error: 'Planilha vazia ou inválida' }, { status: 400 })

  // Worksheet → matriz de células (coluna 1 do exceljs = índice 1; normalizamos para 0)
  const linhas: Celula[][] = []
  ws.eachRow({ includeEmpty: true }, row => {
    const vals = row.values as Celula[]
    linhas.push(vals.slice(1))
  })

  const cabecalho = parseCabecalhoObra(linhas)
  if (!cabecalho.codigo || !cabecalho.nome) {
    return NextResponse.json(
      { error: 'Use uma planilha exportada pelo sistema' },
      { status: 400 }
    )
  }

  // Cliente: encontra ou cria a partir da razão social do cabeçalho
  let cliente_id: string | null = null
  if (cabecalho.cliente) {
    const { data: clienteExistente } = await supabase
      .from('clientes')
      .select('id')
      .ilike('razao_social', cabecalho.cliente)
      .single()

    if (clienteExistente) {
      cliente_id = clienteExistente.id
    } else {
      const { data: novoCliente, error: errCliente } = await supabase
        .from('clientes')
        .insert({
          razao_social: cabecalho.cliente,
          endereco: cabecalho.endereco,
          cnpj: cabecalho.cnpj,
        })
        .select('id')
        .single()
      if (errCliente || !novoCliente) {
        return NextResponse.json({ error: 'Falha ao criar cliente' }, { status: 500 })
      }
      cliente_id = novoCliente.id
    }
  }

  // Obra
  const { data: obra, error: errObra } = await supabase
    .from('obras')
    .insert({
      codigo: cabecalho.codigo,
      nome: cabecalho.nome,
      cliente_id,
      criado_por: user.id,
    })
    .select('id')
    .single()
  if (errObra || !obra) {
    return NextResponse.json({ error: errObra?.message ?? 'Falha ao criar obra' }, { status: 500 })
  }

  const disciplinasImportadas = parsePlanilhaObra(linhas)

  let resultado: { disciplinas: number; itens: number }
  try {
    resultado = await inserirConteudoObra(supabase, obra.id, disciplinasImportadas)
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : 'Falha ao importar conteúdo da planilha'
    return NextResponse.json({ error: mensagem }, { status: 500 })
  }

  return NextResponse.json(
    { id: obra.id, disciplinas: resultado.disciplinas, itens: resultado.itens },
    { status: 201 }
  )
}
