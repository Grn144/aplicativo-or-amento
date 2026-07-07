import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lerJson } from '@/lib/http'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; grupoId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { grupoId: grupo_id } = await params
  const body = await lerJson(request)
  if (!body) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 })

  // Próximo número e ordem
  const { count } = await supabase
    .from('itens_orcamento')
    .select('*', { count: 'exact', head: true })
    .eq('grupo_id', grupo_id)

  const numero = (count ?? 0) + 1
  const ordem = numero

  const { data, error } = await supabase
    .from('itens_orcamento')
    .insert({
      grupo_id,
      numero,
      ordem,
      descricao: body.descricao ?? 'Novo item',
      local: body.local ?? null,
      unidade_id: body.unidade_id ?? null,
      quantidade: body.quantidade ?? 0,
      custo_unit_mao_obra: body.custo_unit_mao_obra ?? 0,
      custo_unit_material: body.custo_unit_material ?? 0,
      observacao: body.observacao ?? null,
      observacao_2: body.observacao_2 ?? null,
    })
    .select('*, unidades_medida(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
