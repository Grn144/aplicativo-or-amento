import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const busca = searchParams.get('busca') ?? ''
  const buscaSanitizada = busca.replace(/[(),]/g, '')
  const status = searchParams.get('status') ?? ''

  let query = supabase
    .from('obras')
    .select(`
      id, codigo, nome, status, data_orcamento, criado_em, atualizado_em,
      clientes (id, razao_social),
      grupos_orcamento (
        itens_orcamento (
          quantidade, custo_unit_mao_obra, custo_unit_material,
          margem_mao_obra_pct, margem_material_pct
        )
      )
    `)
    .order('atualizado_em', { ascending: false })
    .limit(100)

  if (status) query = query.eq('status', status)
  if (buscaSanitizada) {
    query = query.or(`codigo.ilike.%${buscaSanitizada}%,nome.ilike.%${buscaSanitizada}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await request.json()
  const { codigo, nome, cliente_id, data_orcamento } = body

  if (!codigo?.trim() || !nome?.trim()) {
    return NextResponse.json({ error: 'Código e nome são obrigatórios' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('obras')
    .insert({
      codigo: codigo.trim(),
      nome: nome.trim(),
      cliente_id: cliente_id ?? null,
      data_orcamento: data_orcamento ?? null,
      criado_por: user.id,
    })
    .select('*, clientes(id, razao_social)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
