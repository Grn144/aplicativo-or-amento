import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lerJson } from '@/lib/http'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; grupoId: string; itemId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { itemId } = await params
  const body = await lerJson(request)
  if (!body) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 })

  // Unidade por sigla digitada: resolve para unidade_id (cria a unidade se não existir)
  if ('unidade_sigla' in body) {
    const sigla = String(body.unidade_sigla ?? '').trim().toUpperCase()
    if (!sigla) {
      body.unidade_id = null
    } else {
      const { data: existente } = await supabase
        .from('unidades_medida').select('id').ilike('sigla', sigla).maybeSingle()
      if (existente) {
        body.unidade_id = existente.id
      } else {
        const { data: nova, error: errUn } = await supabase
          .from('unidades_medida').insert({ sigla }).select('id').single()
        if (errUn || !nova) {
          return NextResponse.json({ error: 'Falha ao criar unidade' }, { status: 500 })
        }
        body.unidade_id = nova.id
      }
    }
  }

  const campos = [
    'descricao', 'local', 'unidade_id', 'quantidade',
    'custo_unit_mao_obra', 'custo_unit_material',
    'markup_mao_obra', 'markup_material',
    'observacao', 'observacao_2',
  ] as const

  const updates: Record<string, unknown> = {}
  for (const campo of campos) {
    if (campo in body) updates[campo] = body[campo]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo enviado' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('itens_orcamento')
    .update(updates)
    .eq('id', itemId)
    .select('*, unidades_medida(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; grupoId: string; itemId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { itemId } = await params

  const { error } = await supabase.from('itens_orcamento').delete().eq('id', itemId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
