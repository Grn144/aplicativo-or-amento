import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { obterUsuarioComPermissoes } from '@/lib/permissoes/servidor'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

  return NextResponse.json({
    id: usuario.id,
    nome: usuario.nome,
    papel: usuario.papel,
    permissoes: Array.from(usuario.permissoes),
  })
}
