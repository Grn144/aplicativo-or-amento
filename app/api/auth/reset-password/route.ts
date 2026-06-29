import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { email } = await request.json()

  if (!email) {
    return NextResponse.json({ error: 'Email obrigatório' }, { status: 400 })
  }

  const supabase = await createClient()

  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin}/nova-senha`

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  })

  if (error) {
    console.error('[reset-password] erro:', error.message)
    return NextResponse.json({ error: 'Erro ao enviar email de recuperação.' }, { status: 500 })
  }

  // Sempre retorna sucesso para não revelar se o email existe ou não
  return NextResponse.json({ ok: true })
}
