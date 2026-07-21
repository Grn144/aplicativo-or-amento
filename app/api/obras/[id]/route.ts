import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { lerJson } from '@/lib/http'
import { obterUsuarioComPermissoes, requirePermission } from '@/lib/permissoes/servidor'
import { mascararCamposFinanceiros } from '@/lib/permissoes/mascarar'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params

  const admin = await createAdminClient()
  const { data, error } = await admin
    .from('obras')
    .select(`
      *,
      clientes (*),
      usuarios (id, nome),
      grupos_orcamento (
        *,
        disciplinas (*),
        itens_orcamento (
          *,
          unidades_medida (*)
        )
      )
    `)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: 'Obra não encontrada' }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Ordenar grupos e itens
  if (data.grupos_orcamento) {
    data.grupos_orcamento.sort((a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem)
    data.grupos_orcamento.forEach((g: { itens_orcamento?: { ordem: number }[] }) => {
      g.itens_orcamento?.sort((a, b) => a.ordem - b.ordem)
    })
  }

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

  return NextResponse.json(mascararCamposFinanceiros(data, usuario.permissoes))
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'editar_obras')) {
    return NextResponse.json({ error: 'Sem permissão para editar orçamentos' }, { status: 403 })
  }

  const { id } = await params
  const body = await lerJson(request)
  if (!body) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 })
  if ('cliente_id' in body && !body.cliente_id) {
    return NextResponse.json({ error: 'Cliente é obrigatório' }, { status: 400 })
  }

  // Campos permitidos para atualização do cabeçalho
  const campos = ['codigo', 'nome', 'cliente_id', 'data_orcamento', 'status', 'fee_fator', 'comissao_valor', 'imposto_valor'] as const
  const updates: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  for (const campo of campos) {
    if (campo in body) updates[campo] = body[campo]
  }

  const { data, error } = await supabase
    .from('obras')
    .update(updates)
    .eq('id', id)
    .select('*, clientes(id, razao_social)')
    .single()

  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: 'Obra não encontrada' }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'excluir_obras')) {
    return NextResponse.json({ error: 'Sem permissão para excluir orçamentos' }, { status: 403 })
  }

  const { id } = await params

  const { error } = await supabase.from('obras').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
