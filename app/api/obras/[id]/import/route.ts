import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parsePlanilhaObra, type Celula } from '@/lib/excel/parse-obra'
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

  const { id: obra_id } = await params

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

  const disciplinasImportadas = parsePlanilhaObra(linhas)
  if (disciplinasImportadas.length === 0) {
    return NextResponse.json(
      { error: 'Nenhuma disciplina/item reconhecido na planilha' },
      { status: 400 }
    )
  }

  // Mapas de apoio: disciplinas e unidades existentes (por nome/sigla)
  const [{ data: discExistentes }, { data: unidades }] = await Promise.all([
    supabase.from('disciplinas').select('id, nome'),
    supabase.from('unidades_medida').select('id, sigla'),
  ])
  const discPorNome = new Map<string, string>()
  for (const d of discExistentes ?? []) discPorNome.set(d.nome.trim().toUpperCase(), d.id)
  const unidadePorSigla = new Map<string, string>()
  for (const u of unidades ?? []) unidadePorSigla.set(u.sigla.trim().toUpperCase(), u.id)

  // Grupos já existentes na obra, por disciplina (para reutilizar em vez de duplicar)
  const { data: gruposObra, count: totalGrupos } = await supabase
    .from('grupos_orcamento')
    .select('id, letra, ordem, disciplina_id', { count: 'exact' })
    .eq('obra_id', obra_id)
  const grupoPorDisciplina = new Map<string, { id: string }>()
  for (const g of gruposObra ?? []) {
    if (g.disciplina_id) grupoPorDisciplina.set(g.disciplina_id, { id: g.id })
  }

  let ordemGrupo = totalGrupos ?? 0
  let totalItens = 0

  for (const disc of disciplinasImportadas) {
    const chave = disc.disciplina.trim().toUpperCase()

    // 1. Disciplina: encontra ou cria
    let disciplina_id = discPorNome.get(chave)
    if (!disciplina_id) {
      const { data: nova, error: errDisc } = await supabase
        .from('disciplinas')
        .insert({ nome: disc.disciplina.trim() })
        .select('id')
        .single()
      if (errDisc || !nova) {
        // corrida: outra inserção criou a disciplina — busca de novo
        const { data: achada } = await supabase
          .from('disciplinas').select('id').ilike('nome', disc.disciplina.trim()).single()
        if (!achada) return NextResponse.json({ error: 'Falha ao criar disciplina' }, { status: 500 })
        disciplina_id = achada.id
      } else {
        disciplina_id = nova.id
      }
      discPorNome.set(chave, disciplina_id!)
    }
    if (!disciplina_id) continue
    const disciplinaIdFinal: string = disciplina_id

    // 2. Grupo: reutiliza o da obra para essa disciplina ou cria um novo
    let grupo_id: string | undefined = grupoPorDisciplina.get(disciplinaIdFinal)?.id
    if (!grupo_id) {
      ordemGrupo++
      const letra = String.fromCharCode(64 + ordemGrupo)
      const { data: novoGrupo, error: errGrupo } = await supabase
        .from('grupos_orcamento')
        .insert({ obra_id, disciplina_id: disciplinaIdFinal, letra, ordem: ordemGrupo })
        .select('id')
        .single()
      if (errGrupo || !novoGrupo) {
        return NextResponse.json({ error: 'Falha ao criar grupo da disciplina' }, { status: 500 })
      }
      const novoId: string = novoGrupo.id
      grupo_id = novoId
      grupoPorDisciplina.set(disciplinaIdFinal, { id: novoId })
    }
    if (!grupo_id) continue
    const grupoIdFinal: string = grupo_id

    // 3. Itens: numeração sequencial a partir do que já existe no grupo
    const { count: itensExistentes } = await supabase
      .from('itens_orcamento')
      .select('*', { count: 'exact', head: true })
      .eq('grupo_id', grupoIdFinal)
    let numero = (itensExistentes ?? 0)

    const itensParaInserir = disc.itens.map(it => {
      numero++
      return {
        grupo_id: grupoIdFinal,
        numero,
        ordem: numero,
        descricao: it.descricao,
        local: it.local,
        unidade_id: it.unidade ? unidadePorSigla.get(it.unidade.toUpperCase()) ?? null : null,
        quantidade: it.quantidade,
        custo_unit_mao_obra: it.custo_unit_mao_obra,
        custo_unit_material: it.custo_unit_material,
        margem_mao_obra_pct: it.margem_mao_obra_pct,
        margem_material_pct: it.margem_material_pct,
        observacao: it.observacao,
        observacao_2: null,
      }
    })

    if (itensParaInserir.length > 0) {
      const { error: errItens } = await supabase.from('itens_orcamento').insert(itensParaInserir)
      if (errItens) return NextResponse.json({ error: errItens.message }, { status: 500 })
      totalItens += itensParaInserir.length
    }
  }

  // Retorna a estrutura completa e atualizada da obra para o editor recarregar
  const { data: grupos } = await supabase
    .from('grupos_orcamento')
    .select('*, disciplinas(*), itens_orcamento(*, unidades_medida(*))')
    .eq('obra_id', obra_id)
    .order('ordem')

  return NextResponse.json(
    { grupos: grupos ?? [], disciplinas: totalItens > 0 ? disciplinasImportadas.length : 0, itens: totalItens },
    { status: 201 }
  )
}
