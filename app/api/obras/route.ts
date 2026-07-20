import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lerJson } from '@/lib/http'
import { obterUsuarioComPermissoes, requirePermission } from '@/lib/permissoes/servidor'

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
          markup_mao_obra, markup_material
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

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'criar_obras')) {
    return NextResponse.json({ error: 'Sem permissão para criar orçamentos' }, { status: 403 })
  }

  const body = await lerJson<{
    codigo?: string
    nome?: string
    cliente_id?: string | null
    data_orcamento?: string | null
  }>(request)
  if (!body) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 })
  const { codigo, nome, cliente_id, data_orcamento } = body

  if (!codigo?.trim() || !nome?.trim()) {
    return NextResponse.json({ error: 'Código e nome são obrigatórios' }, { status: 400 })
  }
  if (!cliente_id?.trim()) {
    return NextResponse.json({ error: 'Cliente é obrigatório' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('obras')
    .insert({
      codigo: codigo.trim(),
      nome: nome.trim(),
      cliente_id: cliente_id.trim(),
      data_orcamento: data_orcamento ?? null,
      criado_por: user.id,
    })
    .select('*, clientes(id, razao_social)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
