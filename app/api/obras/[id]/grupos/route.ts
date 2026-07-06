import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lerJson } from '@/lib/http'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id: obra_id } = await params
  const body = await lerJson<{ disciplina_id?: string }>(request)
  if (!body) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 })
  const { disciplina_id } = body

  if (!disciplina_id) {
    return NextResponse.json({ error: 'disciplina_id é obrigatório' }, { status: 400 })
  }

  // Próxima letra e ordem
  const { count } = await supabase
    .from('grupos_orcamento')
    .select('*', { count: 'exact', head: true })
    .eq('obra_id', obra_id)

  const ordem = (count ?? 0) + 1
  const letra = String.fromCharCode(64 + ordem)  // 1→A, 2→B, ...

  const { data, error } = await supabase
    .from('grupos_orcamento')
    .insert({ obra_id, disciplina_id, letra, ordem })
    .select('*, disciplinas(*), itens_orcamento(*, unidades_medida(*))')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
