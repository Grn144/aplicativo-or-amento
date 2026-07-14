// app/api/composicoes/semelhantes/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { gerarEmbedding } from '@/lib/embeddings/gerar'
import { filtrarPorSimilaridade, LIMIAR_SIMILARIDADE } from '@/lib/composicoes/embeddings-texto'

// Busca composições semanticamente parecidas com o texto informado.
// ?limite= controla quantas mostrar no máximo (default 5; a funcionalidade
// 1, no editor de orçamento, pede limite=3).
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const texto = request.nextUrl.searchParams.get('texto')?.trim() ?? ''
  if (!texto) return NextResponse.json([])

  const limiteParam = Number(request.nextUrl.searchParams.get('limite'))
  const limite = Number.isFinite(limiteParam) && limiteParam > 0 ? limiteParam : 5

  const embedding = await gerarEmbedding(texto)
  if (!embedding) return NextResponse.json([])

  const { data, error } = await supabase.rpc('match_composicoes', { query_embedding: embedding, limite: 20 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(filtrarPorSimilaridade(data ?? [], LIMIAR_SIMILARIDADE, limite))
}
