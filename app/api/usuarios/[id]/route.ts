// app/api/usuarios/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lerJson } from '@/lib/http'
import { obterUsuarioComPermissoes, requirePermission } from '@/lib/permissoes/servidor'
import { calcularPermissoes, type OverridePermissao } from '@/lib/permissoes/resolver'
import type { Papel } from '@/types/database'

const CAMPOS_USUARIO = 'id, nome, email, papel, cargo, departamento, telefone, ativo, criado_em'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const usuarioLogado = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuarioLogado || !requirePermission(usuarioLogado.permissoes, 'editar_usuarios')) {
    return NextResponse.json({ error: 'Sem permissão para visualizar usuários' }, { status: 403 })
  }

  const { id } = await params
  const { data: dadosGerais, error } = await supabase
    .from('usuarios')
    .select(CAMPOS_USUARIO)
    .eq('id', id)
    .single()

  if (error || !dadosGerais) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
  }

  const { data: overrides } = await supabase
    .from('usuario_permissoes')
    .select('permissao, concedida')
    .eq('usuario_id', id)

  const permissoesEfetivas = calcularPermissoes(
    dadosGerais.papel as Papel,
    (overrides ?? []) as OverridePermissao[]
  )

  return NextResponse.json({
    ...dadosGerais,
    permissoes: Array.from(permissoesEfetivas),
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const usuarioLogado = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuarioLogado || !requirePermission(usuarioLogado.permissoes, 'editar_usuarios')) {
    return NextResponse.json({ error: 'Sem permissão para editar usuários' }, { status: 403 })
  }

  const { id } = await params
  const body = await lerJson<{
    nome?: string
    papel?: string
    cargo?: string | null
    departamento?: string | null
    telefone?: string | null
    ativo?: boolean
  }>(request)
  if (!body) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 })

  const campos = ['nome', 'papel', 'cargo', 'departamento', 'telefone', 'ativo'] as const
  const updates: Record<string, unknown> = {}
  for (const campo of campos) {
    if (campo in body) updates[campo] = body[campo]
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo enviado' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('usuarios')
    .update(updates)
    .eq('id', id)
    .select(CAMPOS_USUARIO)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
  return NextResponse.json(data)
}
