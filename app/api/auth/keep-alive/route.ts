import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MFA_TTL_SEGUNDOS } from '@/lib/sessao'

// Renova a janela de inatividade quando há atividade do usuário em páginas que
// só conversam com a API (ex.: editor de orçamento). Só estende uma sessão que
// já passou pelo MFA — nunca cria uma nova.
export async function POST(request: NextRequest) {
  const jaVerificado = request.cookies.get('mfa_verificado')?.value === 'true'
  if (!jaVerificado) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set('mfa_verificado', 'true', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MFA_TTL_SEGUNDOS,
  })
  return response
}
