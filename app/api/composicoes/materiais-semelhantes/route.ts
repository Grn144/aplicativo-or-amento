// app/api/composicoes/materiais-semelhantes/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { obterUsuarioComPermissoes, requirePermission } from '@/lib/permissoes/servidor'
import { gerarEmbedding } from '@/lib/embeddings/gerar'
import { filtrarPorSimilaridade, LIMIAR_SIMILARIDADE } from '@/lib/composicoes/embeddings-texto'

// Busca materiais (de outras composições) semanticamente parecidos com o
// texto informado. ?excluir_composicao_id= evita sugerir os próprios
// materiais da composição sendo editada.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'visualizar_banco_composicoes')) {
    return NextResponse.json({ error: 'Sem permissão para acessar o banco de composições' }, { status: 403 })
  }

  const texto = request.nextUrl.searchParams.get('texto')?.trim() ?? ''
  if (!texto) return NextResponse.json([])
  const excluirComposicaoId = request.nextUrl.searchParams.get('excluir_composicao_id') || null

  const embedding = await gerarEmbedding(texto)
  if (!embedding) return NextResponse.json([])

  const { data, error } = await supabase.rpc('match_materiais', {
    query_embedding: embedding,
    limite: 20,
    excluir_composicao_id: excluirComposicaoId,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(filtrarPorSimilaridade(data ?? [], LIMIAR_SIMILARIDADE, 5))
}
