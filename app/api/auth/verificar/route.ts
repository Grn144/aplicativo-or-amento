import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { verificarRateLimit } from '@/lib/rate-limit'
import { lerJson } from '@/lib/http'
import { MFA_TTL_SEGUNDOS } from '@/lib/sessao'

export async function POST(request: NextRequest) {
  const body = await lerJson<{ codigo?: string }>(request)
  if (!body) {
    return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 })
  }
  const { codigo } = body

  if (!codigo) {
    return NextResponse.json({ error: 'Código obrigatório' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  console.log('[verificar] user:', user?.id ?? null, 'error:', userError?.message ?? null)

  if (!user) {
    return NextResponse.json({ error: 'Sessão expirada. Faça login novamente.' }, { status: 401 })
  }

  // Impede contornar o limite de 5 tentativas do código reiniciando o login
  const permitido = await verificarRateLimit(`verificar:${user.id}`, 10)
  if (!permitido) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' },
      { status: 429 }
    )
  }

  const admin = await createAdminClient()
  const { data: mfa, error: mfaError } = await admin
    .from('mfa_pendente')
    .select('codigo, expires_at, tentativas')
    .eq('user_id', user.id)
    .single()

  console.log('[verificar] mfa:', mfa ? 'encontrado' : 'não encontrado', 'error:', mfaError?.message ?? null)

  if (!mfa) {
    return NextResponse.json({ error: 'Código não encontrado. Faça login novamente.' }, { status: 400 })
  }

  if ((mfa.tentativas ?? 0) >= 5) {
    await admin.from('mfa_pendente').delete().eq('user_id', user.id)
    return NextResponse.json({ error: 'Muitas tentativas incorretas. Faça login novamente.' }, { status: 400 })
  }

  if (new Date(mfa.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Código expirado. Faça login novamente.' }, { status: 400 })
  }

  if (typeof codigo !== 'string' || mfa.codigo !== codigo.trim()) {
    await admin.from('mfa_pendente').update({ tentativas: (mfa.tentativas ?? 0) + 1 }).eq('user_id', user.id)
    return NextResponse.json({ error: 'Código incorreto' }, { status: 400 })
  }

  // Código válido: limpa o registro e seta cookie de MFA verificado
  await admin.from('mfa_pendente').delete().eq('user_id', user.id)

  const response = NextResponse.json({ ok: true })
  // Expira por inatividade: o middleware renova o cookie a cada atividade.
  // Após MFA_TTL_SEGUNDOS sem uso (ou ao reabrir o app depois disso), exige novo login.
  response.cookies.set('mfa_verificado', 'true', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MFA_TTL_SEGUNDOS,
  })
  // Limpa o cookie de MFA em andamento
  response.cookies.delete('mfa_em_andamento')

  return response
}
