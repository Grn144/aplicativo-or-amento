import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

function gerarCodigo(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(request: NextRequest) {
  const { email, password } = await request.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'Email e senha obrigatórios' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.user) {
    return NextResponse.json({ error: 'Email ou senha incorretos' }, { status: 401 })
  }

  const userId = data.user.id
  const codigo = gerarCodigo()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutos

  // Gravar código no banco (upsert — substitui qualquer código anterior)
  const admin = await createAdminClient()
  await admin
    .from('mfa_pendente')
    .upsert({ user_id: userId, codigo, expires_at: expiresAt }, { onConflict: 'user_id' })

  // Enviar email com o código
  await resend.emails.send({
    from: 'Sistema de Orçamentos <onboarding@resend.dev>',
    to: email,
    subject: 'Código de verificação',
    html: `
      <p>Seu código de verificação é:</p>
      <h1 style="font-size:40px;letter-spacing:8px;font-family:monospace">${codigo}</h1>
      <p>Válido por 10 minutos.</p>
    `,
  })

  return NextResponse.json({ ok: true })
}
