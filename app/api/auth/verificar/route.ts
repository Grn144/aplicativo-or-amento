import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { codigo } = await request.json()

  if (!codigo) {
    return NextResponse.json({ error: 'Código obrigatório' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Sessão expirada' }, { status: 401 })
  }

  const admin = await createAdminClient()
  const { data: mfa } = await admin
    .from('mfa_pendente')
    .select('codigo, expires_at')
    .eq('user_id', user.id)
    .single()

  if (!mfa) {
    return NextResponse.json({ error: 'Código não encontrado. Faça login novamente.' }, { status: 400 })
  }

  if (new Date(mfa.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Código expirado. Faça login novamente.' }, { status: 400 })
  }

  if (mfa.codigo !== codigo.trim()) {
    return NextResponse.json({ error: 'Código incorreto' }, { status: 400 })
  }

  // Código válido: limpa o registro e seta cookie de MFA verificado
  await admin.from('mfa_pendente').delete().eq('user_id', user.id)

  const response = NextResponse.json({ ok: true })
  response.cookies.set('mfa_verificado', 'true', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 8, // 8 horas
    path: '/',
  })

  return response
}
