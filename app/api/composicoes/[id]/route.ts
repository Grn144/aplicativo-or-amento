// app/api/composicoes/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lerJson } from '@/lib/http'
import { calcularCustoDireto, composicaoMudou } from '@/lib/composicoes/calculos'

type MaterialBody = { descricao?: string; quantidade?: number; unidade_id?: string | null; fornecedor?: string | null; preco_unitario?: number }
type MaoObraBody = { cargo?: string; horas?: number; custo_hora?: number }
type ComposicaoBody = {
  codigo?: string
  nome?: string
  disciplina_id?: string | null
  descricao_tecnica?: string
  unidade_id?: string | null
  produtividade?: string | null
  markup_sugerido?: number
  observacoes?: string | null
  tags?: string[]
  ativo?: boolean
  materiais?: MaterialBody[]
  mao_obra?: MaoObraBody[]
}

async function carregarComposicaoCompleta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string
) {
  const [composicaoRes, materiaisRes, maoObraRes] = await Promise.all([
    supabase.from('composicoes').select('*, disciplinas(id, nome), unidades_medida(id, sigla)').eq('id', id).single(),
    supabase.from('composicao_materiais').select('*, unidades_medida(id, sigla)').eq('composicao_id', id).order('ordem'),
    supabase.from('composicao_mao_obra').select('*').eq('composicao_id', id).order('ordem'),
  ])
  return { composicaoRes, materiaisRes, maoObraRes }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const { composicaoRes, materiaisRes, maoObraRes } = await carregarComposicaoCompleta(supabase, id)

  if (composicaoRes.error) {
    if (composicaoRes.error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Composição não encontrada' }, { status: 404 })
    }
    return NextResponse.json({ error: composicaoRes.error.message }, { status: 500 })
  }

  const { data: favorito } = await supabase
    .from('composicoes_favoritas')
    .select('composicao_id')
    .eq('usuario_id', user.id)
    .eq('composicao_id', id)
    .maybeSingle()

  return NextResponse.json({
    ...composicaoRes.data,
    favorito: !!favorito,
    composicao_materiais: materiaisRes.data ?? [],
    composicao_mao_obra: maoObraRes.data ?? [],
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const body = await lerJson<ComposicaoBody>(request)
  if (!body) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 })

  if (!body.codigo?.trim() || !body.nome?.trim() || !body.descricao_tecnica?.trim()) {
    return NextResponse.json({ error: 'Código, nome e descrição técnica são obrigatórios' }, { status: 400 })
  }
  const materiaisBody = body.materiais ?? []
  const maoObraBody = body.mao_obra ?? []
  if (materiaisBody.length === 0 && maoObraBody.length === 0) {
    return NextResponse.json(
      { error: 'A composição precisa ter ao menos um material ou item de mão de obra' },
      { status: 400 }
    )
  }

  const { composicaoRes: atual, materiaisRes: materiaisAtuais, maoObraRes: maoObraAtual } =
    await carregarComposicaoCompleta(supabase, id)
  if (atual.error) {
    if (atual.error.code === 'PGRST116') return NextResponse.json({ error: 'Composição não encontrada' }, { status: 404 })
    return NextResponse.json({ error: atual.error.message }, { status: 500 })
  }

  const camposNovos = {
    codigo: body.codigo.trim(),
    nome: body.nome.trim(),
    disciplina_id: body.disciplina_id || null,
    descricao_tecnica: body.descricao_tecnica.trim(),
    unidade_id: body.unidade_id || null,
    produtividade: body.produtividade?.trim() || null,
    markup_sugerido: body.markup_sugerido ?? 1,
    observacoes: body.observacoes?.trim() || null,
    tags: body.tags ?? [],
    ativo: body.ativo ?? true,
  }
  const materiaisNovos = materiaisBody.map((m, i) => ({
    descricao: m.descricao ?? '',
    quantidade: m.quantidade ?? 0,
    unidade_id: m.unidade_id || null,
    fornecedor: m.fornecedor?.trim() || null,
    preco_unitario: m.preco_unitario ?? 0,
    ordem: i + 1,
  }))
  const maoObraNova = maoObraBody.map((m, i) => ({
    cargo: m.cargo ?? '',
    horas: m.horas ?? 0,
    custo_hora: m.custo_hora ?? 0,
    ordem: i + 1,
  }))

  const camposAntigos = {
    codigo: atual.data.codigo,
    nome: atual.data.nome,
    disciplina_id: atual.data.disciplina_id,
    descricao_tecnica: atual.data.descricao_tecnica,
    unidade_id: atual.data.unidade_id,
    produtividade: atual.data.produtividade,
    markup_sugerido: atual.data.markup_sugerido,
    observacoes: atual.data.observacoes,
    tags: atual.data.tags,
    ativo: atual.data.ativo,
  }
  const materiaisAntigosNormalizados = (materiaisAtuais.data ?? []).map(m => ({
    descricao: m.descricao, quantidade: m.quantidade, unidade_id: m.unidade_id,
    fornecedor: m.fornecedor, preco_unitario: m.preco_unitario, ordem: m.ordem,
  }))
  const maoObraAntigaNormalizada = (maoObraAtual.data ?? []).map(m => ({
    cargo: m.cargo, horas: m.horas, custo_hora: m.custo_hora, ordem: m.ordem,
  }))

  const mudou = composicaoMudou(
    { campos: camposAntigos, materiais: materiaisAntigosNormalizados, maoDeObra: maoObraAntigaNormalizada },
    { campos: camposNovos, materiais: materiaisNovos, maoDeObra: maoObraNova }
  )

  if (!mudou) {
    return NextResponse.json({
      ...atual.data,
      composicao_materiais: materiaisAtuais.data ?? [],
      composicao_mao_obra: maoObraAtual.data ?? [],
    })
  }

  const custo_direto = calcularCustoDireto(
    materiaisNovos.map(m => ({ quantidade: m.quantidade, preco_unitario: m.preco_unitario })),
    maoObraNova.map(m => ({ horas: m.horas, custo_hora: m.custo_hora }))
  )
  const novaVersao = atual.data.versao + 1

  const { data: composicaoAtualizada, error: erroUpdate } = await supabase
    .from('composicoes')
    .update({ ...camposNovos, custo_direto, versao: novaVersao, atualizado_em: new Date().toISOString() })
    .eq('id', id)
    .select('*, disciplinas(id, nome), unidades_medida(id, sigla)')
    .single()
  if (erroUpdate) return NextResponse.json({ error: erroUpdate.message }, { status: 500 })

  const { error: erroDeleteMateriais } = await supabase.from('composicao_materiais').delete().eq('composicao_id', id)
  if (erroDeleteMateriais) return NextResponse.json({ error: erroDeleteMateriais.message }, { status: 500 })
  const { error: erroDeleteMaoObra } = await supabase.from('composicao_mao_obra').delete().eq('composicao_id', id)
  if (erroDeleteMaoObra) return NextResponse.json({ error: erroDeleteMaoObra.message }, { status: 500 })

  const [resMateriais, resMaoObra] = await Promise.all([
    materiaisNovos.length > 0
      ? supabase.from('composicao_materiais')
          .insert(materiaisNovos.map(m => ({ ...m, composicao_id: id })))
          .select('*, unidades_medida(id, sigla)')
      : Promise.resolve({ data: [], error: null }),
    maoObraNova.length > 0
      ? supabase.from('composicao_mao_obra')
          .insert(maoObraNova.map(m => ({ ...m, composicao_id: id })))
          .select('*')
      : Promise.resolve({ data: [], error: null }),
  ])
  if (resMateriais.error) return NextResponse.json({ error: resMateriais.error.message }, { status: 500 })
  if (resMaoObra.error) return NextResponse.json({ error: resMaoObra.error.message }, { status: 500 })

  const { error: erroVersao } = await supabase.from('composicao_versoes').insert({
    composicao_id: id,
    versao: novaVersao,
    snapshot: { composicao: composicaoAtualizada, materiais: resMateriais.data, mao_obra: resMaoObra.data },
    usuario_id: user.id,
  })
  if (erroVersao) return NextResponse.json({ error: erroVersao.message }, { status: 500 })

  return NextResponse.json({
    ...composicaoAtualizada,
    composicao_materiais: resMateriais.data,
    composicao_mao_obra: resMaoObra.data,
  })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const { error } = await supabase.from('composicoes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
