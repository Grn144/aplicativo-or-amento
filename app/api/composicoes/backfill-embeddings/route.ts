// app/api/composicoes/backfill-embeddings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { gerarEmbedding } from '@/lib/embeddings/gerar'
import { textoEmbeddingComposicao, textoEmbeddingMaterial } from '@/lib/composicoes/embeddings-texto'

// Processa em lote (até 500 por vez) todas as composições e materiais com
// embedding IS NULL — idempotente, seguro rodar quantas vezes forem
// necessárias (não recalcula o que já tem embedding). Usado pra preencher
// composições/materiais criados antes da B5b.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: usuario } = await supabase.from('usuarios').select('papel').eq('id', user.id).single()
  if (usuario?.papel !== 'admin') {
    return NextResponse.json({ error: 'Apenas administradores podem rodar o backfill' }, { status: 403 })
  }

  const { data: composicoesSemEmbedding, error: erroComposicoes } = await supabase
    .from('composicoes')
    .select('id, nome, descricao_tecnica')
    .is('embedding', null)
    .limit(500)
  if (erroComposicoes) return NextResponse.json({ error: erroComposicoes.message }, { status: 500 })

  let composicoesAtualizadas = 0
  for (const c of composicoesSemEmbedding ?? []) {
    const embedding = await gerarEmbedding(textoEmbeddingComposicao(c.nome, c.descricao_tecnica))
    if (!embedding) continue
    const { error } = await supabase.from('composicoes').update({ embedding }).eq('id', c.id)
    if (!error) composicoesAtualizadas++
  }

  const { data: materiaisSemEmbedding, error: erroMateriais } = await supabase
    .from('composicao_materiais')
    .select('id, descricao')
    .is('embedding', null)
    .limit(500)
  if (erroMateriais) return NextResponse.json({ error: erroMateriais.message }, { status: 500 })

  let materiaisAtualizados = 0
  for (const m of materiaisSemEmbedding ?? []) {
    const embedding = await gerarEmbedding(textoEmbeddingMaterial(m.descricao))
    if (!embedding) continue
    const { error } = await supabase.from('composicao_materiais').update({ embedding }).eq('id', m.id)
    if (!error) materiaisAtualizados++
  }

  return NextResponse.json({
    composicoes_processadas: composicoesSemEmbedding?.length ?? 0,
    composicoes_atualizadas: composicoesAtualizadas,
    materiais_processados: materiaisSemEmbedding?.length ?? 0,
    materiais_atualizados: materiaisAtualizados,
  })
}
