// app/api/composicoes/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lerJson } from '@/lib/http'
import { calcularCustoDireto } from '@/lib/composicoes/calculos'

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
  materiais?: MaterialBody[]
  mao_obra?: MaoObraBody[]
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const busca = searchParams.get('busca') ?? ''
  const buscaSanitizada = busca.replace(/[(),]/g, '')
  const disciplinaId = searchParams.get('disciplina_id') ?? ''
  const tag = searchParams.get('tag') ?? ''
  const somenteFavoritos = searchParams.get('favoritos') === 'true'

  const { data: favoritas } = await supabase
    .from('composicoes_favoritas')
    .select('composicao_id')
    .eq('usuario_id', user.id)
  const idsFavoritos = new Set((favoritas ?? []).map(f => f.composicao_id))

  let query = supabase
    .from('composicoes')
    .select('*, disciplinas(id, nome), unidades_medida(id, sigla)')
    .eq('ativo', true)
    .order('nome')

  if (buscaSanitizada) {
    query = query.or(
      `nome.ilike.%${buscaSanitizada}%,codigo.ilike.%${buscaSanitizada}%,descricao_tecnica.ilike.%${buscaSanitizada}%`
    )
  }
  if (disciplinaId) query = query.eq('disciplina_id', disciplinaId)
  if (tag) query = query.contains('tags', [tag])
  if (somenteFavoritos) {
    const ids = Array.from(idsFavoritos)
    if (ids.length === 0) return NextResponse.json([])
    query = query.in('id', ids)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const comFavorito = (data ?? []).map(c => ({ ...c, favorito: idsFavoritos.has(c.id) }))
  return NextResponse.json(comFavorito)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await lerJson<ComposicaoBody>(request)
  if (!body) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 })

  if (!body.codigo?.trim() || !body.nome?.trim() || !body.descricao_tecnica?.trim()) {
    return NextResponse.json({ error: 'Código, nome e descrição técnica são obrigatórios' }, { status: 400 })
  }
  const materiais = body.materiais ?? []
  const maoObra = body.mao_obra ?? []
  if (materiais.length === 0 && maoObra.length === 0) {
    return NextResponse.json(
      { error: 'A composição precisa ter ao menos um material ou item de mão de obra' },
      { status: 400 }
    )
  }

  const custo_direto = calcularCustoDireto(
    materiais.map(m => ({ quantidade: m.quantidade ?? 0, preco_unitario: m.preco_unitario ?? 0 })),
    maoObra.map(m => ({ horas: m.horas ?? 0, custo_hora: m.custo_hora ?? 0 }))
  )

  const { data: composicao, error: erroComposicao } = await supabase
    .from('composicoes')
    .insert({
      codigo: body.codigo.trim(),
      nome: body.nome.trim(),
      disciplina_id: body.disciplina_id || null,
      descricao_tecnica: body.descricao_tecnica.trim(),
      unidade_id: body.unidade_id || null,
      produtividade: body.produtividade?.trim() || null,
      custo_direto,
      markup_sugerido: body.markup_sugerido ?? 1,
      observacoes: body.observacoes?.trim() || null,
      tags: body.tags ?? [],
      versao: 1,
      responsavel_id: user.id,
    })
    .select('*, disciplinas(id, nome), unidades_medida(id, sigla)')
    .single()

  if (erroComposicao) return NextResponse.json({ error: erroComposicao.message }, { status: 500 })

  const materiaisParaInserir = materiais.map((m, i) => ({
    composicao_id: composicao.id,
    descricao: m.descricao ?? '',
    quantidade: m.quantidade ?? 0,
    unidade_id: m.unidade_id || null,
    fornecedor: m.fornecedor?.trim() || null,
    preco_unitario: m.preco_unitario ?? 0,
    ordem: i + 1,
  }))
  const maoObraParaInserir = maoObra.map((m, i) => ({
    composicao_id: composicao.id,
    cargo: m.cargo ?? '',
    horas: m.horas ?? 0,
    custo_hora: m.custo_hora ?? 0,
    ordem: i + 1,
  }))

  const [resMateriais, resMaoObra] = await Promise.all([
    materiaisParaInserir.length > 0
      ? supabase.from('composicao_materiais').insert(materiaisParaInserir).select('*, unidades_medida(id, sigla)')
      : Promise.resolve({ data: [], error: null }),
    maoObraParaInserir.length > 0
      ? supabase.from('composicao_mao_obra').insert(maoObraParaInserir).select('*')
      : Promise.resolve({ data: [], error: null }),
  ])
  if (resMateriais.error) return NextResponse.json({ error: resMateriais.error.message }, { status: 500 })
  if (resMaoObra.error) return NextResponse.json({ error: resMaoObra.error.message }, { status: 500 })

  const { error: erroVersao } = await supabase.from('composicao_versoes').insert({
    composicao_id: composicao.id,
    versao: 1,
    snapshot: { composicao, materiais: resMateriais.data, mao_obra: resMaoObra.data },
    usuario_id: user.id,
  })
  if (erroVersao) return NextResponse.json({ error: erroVersao.message }, { status: 500 })

  return NextResponse.json(
    { ...composicao, composicao_materiais: resMateriais.data, composicao_mao_obra: resMaoObra.data },
    { status: 201 }
  )
}
