// app/api/composicoes/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lerJson } from '@/lib/http'
import { composicaoIncompleta } from '@/lib/composicoes/calculos'
import { type MaterialBody, type MaoObraBody } from '@/lib/composicoes/normalizar'
import { criarComposicao } from '@/lib/composicoes/criar'
import { obterUsuarioComPermissoes, requirePermission } from '@/lib/permissoes/servidor'

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

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'visualizar_banco_composicoes')) {
    return NextResponse.json({ error: 'Sem permissão para acessar o banco de composições' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const busca = searchParams.get('busca') ?? ''
  const buscaSanitizada = busca.replace(/[(),]/g, '')
  const disciplinaId = searchParams.get('disciplina_id') ?? ''
  const tag = searchParams.get('tag') ?? ''
  const somenteFavoritos = searchParams.get('favoritos') === 'true'
  const ordenar = searchParams.get('ordenar') ?? ''

  const { data: favoritas, error: erroFavoritas } = await supabase
    .from('composicoes_favoritas')
    .select('composicao_id')
    .eq('usuario_id', user.id)
  if (erroFavoritas) return NextResponse.json({ error: erroFavoritas.message }, { status: 500 })
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

  const idsResultado = (data ?? []).map(c => c.id)
  const { data: usos, error: erroUsos } = idsResultado.length > 0
    ? await supabase.from('composicao_usos').select('composicao_id, criado_em').in('composicao_id', idsResultado)
    : { data: [], error: null }
  if (erroUsos) return NextResponse.json({ error: erroUsos.message }, { status: 500 })

  const usosPorComposicao = new Map<string, { total: number; ultimo: string }>()
  for (const uso of usos ?? []) {
    const atual = usosPorComposicao.get(uso.composicao_id)
    if (!atual) {
      usosPorComposicao.set(uso.composicao_id, { total: 1, ultimo: uso.criado_em })
    } else {
      atual.total += 1
      if (uso.criado_em > atual.ultimo) atual.ultimo = uso.criado_em
    }
  }

  // Limite explícito alto: sem isso, o cap padrão do PostgREST (geralmente 1000
  // linhas) poderia truncar a resposta numa biblioteca grande, gerando falso
  // positivo de "incompleta" pra composições cujas linhas caíram fora do corte.
  const { data: materiaisContagem, error: erroMateriais } = idsResultado.length > 0
    ? await supabase.from('composicao_materiais').select('composicao_id').in('composicao_id', idsResultado).limit(50000)
    : { data: [], error: null }
  if (erroMateriais) return NextResponse.json({ error: erroMateriais.message }, { status: 500 })
  const { data: maoObraContagem, error: erroMaoObra } = idsResultado.length > 0
    ? await supabase.from('composicao_mao_obra').select('composicao_id').in('composicao_id', idsResultado).limit(50000)
    : { data: [], error: null }
  if (erroMaoObra) return NextResponse.json({ error: erroMaoObra.message }, { status: 500 })

  const idsComMateriais = new Set((materiaisContagem ?? []).map(m => m.composicao_id))
  const idsComMaoObra = new Set((maoObraContagem ?? []).map(m => m.composicao_id))

  let comFavoritoEUsos = (data ?? []).map(c => ({
    ...c,
    favorito: idsFavoritos.has(c.id),
    total_usos: usosPorComposicao.get(c.id)?.total ?? 0,
    ultimo_uso: usosPorComposicao.get(c.id)?.ultimo ?? null,
    incompleta: composicaoIncompleta(idsComMateriais.has(c.id), idsComMaoObra.has(c.id)),
  }))

  if (ordenar === 'usos') {
    comFavoritoEUsos = [...comFavoritoEUsos].sort((a, b) => b.total_usos - a.total_usos)
  }

  return NextResponse.json(comFavoritoEUsos)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'cadastrar_composicoes')) {
    return NextResponse.json({ error: 'Sem permissão para cadastrar composições' }, { status: 403 })
  }

  const body = await lerJson<ComposicaoBody>(request)
  if (!body) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 })

  const resultado = await criarComposicao(supabase, user.id, {
    codigo: body.codigo ?? '',
    nome: body.nome ?? '',
    disciplina_id: body.disciplina_id ?? null,
    descricao_tecnica: body.descricao_tecnica ?? '',
    unidade_id: body.unidade_id ?? null,
    produtividade: body.produtividade ?? null,
    markup_sugerido: body.markup_sugerido ?? 1,
    observacoes: body.observacoes ?? null,
    tags: body.tags ?? [],
    materiais: body.materiais ?? [],
    mao_obra: body.mao_obra ?? [],
  })

  return NextResponse.json(resultado.body, { status: resultado.status })
}
