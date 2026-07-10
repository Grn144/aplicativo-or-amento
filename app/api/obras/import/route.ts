import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parsePlanilhaObra, parseCabecalhoObra, resolverCelula, type Celula } from '@/lib/excel/parse-obra'
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
  let ws: ExcelJS.Worksheet | undefined
  try {
    await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0])
    ws = wb.worksheets[0]
  } catch {
    return NextResponse.json(
      { error: 'Arquivo inválido. Envie uma planilha .xlsx exportada pelo sistema.' },
      { status: 400 }
    )
  }
  if (!ws) return NextResponse.json({ error: 'Planilha vazia ou inválida' }, { status: 400 })

  // Worksheet → matriz de células (coluna 1 do exceljs = índice 1; normalizamos para 0)
  const linhas: Celula[][] = []
  ws.eachRow({ includeEmpty: true }, row => {
    const vals = row.values as unknown[]
    linhas.push(vals.slice(1).map(resolverCelula))
  })

  const cabecalho = parseCabecalhoObra(linhas)
  const disciplinasImportadas = parsePlanilhaObra(linhas)

  // Sem itens reconhecíveis não há o que importar (independe do tamanho da planilha):
  // o que precisa ser reconhecido são as COLUNAS (DESCRIÇÃO, M. OBRA, MAT, QT...), não o cabeçalho da obra.
  if (disciplinasImportadas.length === 0) {
    return NextResponse.json(
      { error: 'Não foi possível reconhecer itens na planilha. Verifique se há um cabeçalho com colunas como DESCRIÇÃO, M. OBRA, MAT e QT.' },
      { status: 400 }
    )
  }

  // Código e nome: usa o cabeçalho da obra quando disponível; senão, cai para o
  // nome do arquivo — assim a importação nunca falha só por não reconhecer o cabeçalho.
  const nomeArquivo = (file.name ?? '').replace(/\.[^.]+$/, '').trim()
  const codigo = (cabecalho.codigo ?? (nomeArquivo || 'IMPORTADO')).slice(0, 60)
  const nome = cabecalho.nome ?? (nomeArquivo || 'Obra importada')

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

  if (!cliente_id) {
    return NextResponse.json({ error: 'Cliente é obrigatório' }, { status: 400 })
  }

  // Obra
  const { data: obra, error: errObra } = await supabase
    .from('obras')
    .insert({ codigo, nome, cliente_id, criado_por: user.id })
    .select('id')
    .single()
  if (errObra || !obra) {
    return NextResponse.json({ error: errObra?.message ?? 'Falha ao criar obra' }, { status: 500 })
  }

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
