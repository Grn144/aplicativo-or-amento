import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; grupoId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { grupoId } = await params
  const body = await request.json()

  const updates: Record<string, unknown> = {}
  if ('disciplina_id' in body) updates.disciplina_id = body.disciplina_id

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo enviado' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('grupos_orcamento')
    .update(updates)
    .eq('id', grupoId)
    .select('*, disciplinas(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; grupoId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { grupoId } = await params

  const { error } = await supabase.from('grupos_orcamento').delete().eq('id', grupoId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
