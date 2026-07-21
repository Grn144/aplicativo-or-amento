import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { obterUsuarioComPermissoes, requirePermission } from '@/lib/permissoes/servidor'
import { parsePlanilhaObra, resolverCelula, type Celula } from '@/lib/excel/parse-obra'
import { inserirConteudoObra } from '@/lib/excel/importar-obra'
import { mascararCamposFinanceiros } from '@/lib/permissoes/mascarar'
import ExcelJS from 'exceljs'

// Importa uma planilha inteira da obra: cada linha de disciplina vira um grupo
// (reutilizando a disciplina existente pelo nome ou criando-a) e suas linhas de
// item viram itens. Acrescenta ao que já existe — não apaga o conteúdo atual.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'importar_planilhas')) {
    return NextResponse.json({ error: 'Sem permissão para importar planilhas' }, { status: 403 })
  }

  const { id: obra_id } = await params

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

  const disciplinasImportadas = parsePlanilhaObra(linhas)
  if (disciplinasImportadas.length === 0) {
    return NextResponse.json(
      { error: 'Nenhuma disciplina/item reconhecido na planilha' },
      { status: 400 }
    )
  }

  let resultado: { disciplinas: number; itens: number }
  try {
    resultado = await inserirConteudoObra(supabase, obra_id, disciplinasImportadas)
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : 'Falha ao importar planilha'
    return NextResponse.json({ error: mensagem }, { status: 500 })
  }

  // Retorna a estrutura completa e atualizada da obra para o editor recarregar
  const admin = await createAdminClient()
  const { data: grupos } = await admin
    .from('grupos_orcamento')
    .select('*, disciplinas(*), itens_orcamento(*, unidades_medida(*))')
    .eq('obra_id', obra_id)
    .order('ordem')

  return NextResponse.json(
    { grupos: mascararCamposFinanceiros(grupos ?? [], usuario.permissoes), disciplinas: resultado.disciplinas, itens: resultado.itens },
    { status: 201 }
  )
}
