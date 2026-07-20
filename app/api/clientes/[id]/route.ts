import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lerJson } from '@/lib/http'
import { obterUsuarioComPermissoes, requirePermission } from '@/lib/permissoes/servidor'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'editar_clientes')) {
    return NextResponse.json({ error: 'Sem permissão para editar clientes' }, { status: 403 })
  }

  const { id } = await params
  const body = await lerJson<{ razao_social?: string; cnpj?: string; endereco?: string }>(request)
  if (!body) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 })

  if (!body.razao_social?.trim()) {
    return NextResponse.json({ error: 'Razão social é obrigatória' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('clientes')
    .update({
      razao_social: body.razao_social.trim(),
      cnpj: body.cnpj?.trim() || null,
      endereco: body.endereco?.trim() || null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
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
  if (!usuario || !requirePermission(usuario.permissoes, 'excluir_clientes')) {
    return NextResponse.json({ error: 'Sem permissão para excluir clientes' }, { status: 403 })
  }

  const { id } = await params

  const { error } = await supabase.from('clientes').delete().eq('id', id)
  if (error) {
    // A FK obras→clientes usa ON DELETE RESTRICT: cliente com obras não pode ser excluído.
    const mensagem = /violates foreign key|restrict/i.test(error.message)
      ? 'Não é possível excluir: existem obras vinculadas a este cliente.'
      : error.message
    return NextResponse.json({ error: mensagem }, { status: 409 })
  }
  return new NextResponse(null, { status: 204 })
}
