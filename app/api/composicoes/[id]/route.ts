// app/api/composicoes/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lerJson } from '@/lib/http'
import { normalizarMateriais, normalizarMaoObra, type MaterialBody, type MaoObraBody } from '@/lib/composicoes/normalizar'
import { carregarComposicaoCompleta, atualizarComposicaoSeMudou } from '@/lib/composicoes/atualizar'

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
  const materiaisNovos = normalizarMateriais(materiaisBody)
  const maoObraNova = normalizarMaoObra(maoObraBody)

  const resultado = await atualizarComposicaoSeMudou(supabase, user.id, id, camposNovos, materiaisNovos, maoObraNova)
  return NextResponse.json(resultado.body, { status: resultado.status })
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
