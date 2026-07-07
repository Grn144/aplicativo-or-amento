import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Retorna o usuário autenticado (nome e papel) para a UI decidir permissões.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, nome, papel')
    .eq('id', user.id)
    .single()

  if (!usuario) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
  return NextResponse.json(usuario)
}
