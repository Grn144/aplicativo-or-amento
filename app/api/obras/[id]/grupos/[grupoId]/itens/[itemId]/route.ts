import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; grupoId: string; itemId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { itemId } = await params
  const body = await request.json()

  const campos = [
    'descricao', 'local', 'unidade_id', 'quantidade',
    'custo_unit_mao_obra', 'custo_unit_material',
    'margem_mao_obra_pct', 'margem_material_pct',
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
