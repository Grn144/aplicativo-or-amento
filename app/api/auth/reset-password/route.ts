import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  const { email } = await request.json()

  if (!email) {
    return NextResponse.json({ error: 'Email obrigatório' }, { status: 400 })
  }

  // O SMTP embutido do Supabase não entrega de forma confiável (limitado a dev),
  // então geramos o link de recuperação via API admin e enviamos pelo Resend,
  // o mesmo canal já usado pelo código MFA do login.
  const admin = await createAdminClient()
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
  })

  if (error || !data?.properties?.hashed_token) {
    // Email não cadastrado cai aqui: logar no servidor, mas responder ok
    // para não revelar quais emails existem.
    console.error('[reset-password] generateLink:', error?.message ?? 'sem hashed_token')
    return NextResponse.json({ ok: true })
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
  const link = `${base}/nova-senha?token_hash=${encodeURIComponent(data.properties.hashed_token)}`

  const { error: emailError } = await resend.emails.send({
    from: 'Sistema de Orçamentos <onboarding@resend.dev>',
    to: email,
    subject: 'Redefinição de senha',
    html: `
      <p>Recebemos um pedido para redefinir a sua senha.</p>
      <p style="margin:24px 0">
        <a href="${link}" style="background:#2563eb;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
          Redefinir senha
        </a>
      </p>
      <p>Se o botão não funcionar, copie e cole este endereço no navegador:</p>
      <p style="font-family:monospace;word-break:break-all">${link}</p>
      <p>Se você não pediu a redefinição, ignore este email.</p>
    `,
  })

  if (emailError) {
    console.error('[reset-password] erro no Resend:', emailError)
    return NextResponse.json({ error: 'Erro ao enviar email de recuperação.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
