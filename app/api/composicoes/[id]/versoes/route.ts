// app/api/composicoes/[id]/versoes/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { obterUsuarioComPermissoes, requirePermission } from '@/lib/permissoes/servidor'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'visualizar_banco_composicoes')) {
    return NextResponse.json({ error: 'Sem permissão para acessar o banco de composições' }, { status: 403 })
  }

  const { id } = await params
  const { data, error } = await supabase
    .from('composicao_versoes')
    .select('id, composicao_id, versao, usuario_id, criado_em, usuarios(nome)')
    .eq('composicao_id', id)
    .order('versao', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
