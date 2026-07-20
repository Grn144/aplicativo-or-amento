// app/api/usuarios/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { lerJson } from '@/lib/http'
import { obterUsuarioComPermissoes, requirePermission } from '@/lib/permissoes/servidor'

const resend = new Resend(process.env.RESEND_API_KEY)

const CAMPOS_USUARIO = 'id, nome, email, papel, cargo, departamento, telefone, ativo, criado_em'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'editar_usuarios')) {
    return NextResponse.json({ error: 'Sem permissão para visualizar usuários' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('usuarios')
    .select(CAMPOS_USUARIO)
    .order('nome')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'editar_usuarios')) {
    return NextResponse.json({ error: 'Sem permissão para cadastrar usuários' }, { status: 403 })
  }

  const body = await lerJson<{
    nome?: string
    email?: string
    papel?: string
    cargo?: string
    departamento?: string
    telefone?: string
  }>(request)
  if (!body) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 })

  const { nome, email, papel, cargo, departamento, telefone } = body
  if (!nome?.trim() || !email?.trim() || !papel) {
    return NextResponse.json({ error: 'Nome, email e papel são obrigatórios' }, { status: 400 })
  }

  const admin = await createAdminClient()
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'invite',
    email: email.trim(),
  })

  if (linkError || !linkData?.user?.id || !linkData.properties?.hashed_token) {
    return NextResponse.json(
      { error: linkError?.message ?? 'Falha ao convidar usuário' },
      { status: 500 }
    )
  }

  const { data: novoUsuario, error: erroInsert } = await supabase
    .from('usuarios')
    .insert({
      id: linkData.user.id,
      nome: nome.trim(),
      email: email.trim(),
      papel,
      cargo: cargo?.trim() || null,
      departamento: departamento?.trim() || null,
      telefone: telefone?.trim() || null,
    })
    .select(CAMPOS_USUARIO)
    .single()

  if (erroInsert) {
    // Falha atômica: reverte o usuário criado no Auth pra não deixar órfão
    await admin.auth.admin.deleteUser(linkData.user.id)
    return NextResponse.json({ error: erroInsert.message }, { status: 500 })
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
  const link = `${base}/nova-senha?tipo=invite&token_hash=${encodeURIComponent(linkData.properties.hashed_token)}`

  const { error: emailError } = await resend.emails.send({
    from: 'Sistema de Orçamentos <onboarding@resend.dev>',
    to: email.trim(),
    subject: 'Você foi convidado para o Sistema de Orçamentos',
    html: `
      <p>Você foi cadastrado no Sistema de Orçamentos.</p>
      <p style="margin:24px 0">
        <a href="${link}" style="background:#2563eb;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
          Definir minha senha
        </a>
      </p>
      <p>Se o botão não funcionar, copie e cole este endereço no navegador:</p>
      <p style="font-family:monospace;word-break:break-all">${link}</p>
    `,
  })

  if (emailError) {
    // O usuário já foi criado com sucesso; a falha é só no envio do convite.
    // Um admin pode reenviar o acesso usando "Resetar Senha" na listagem.
    console.error('[usuarios] erro no Resend ao enviar convite:', emailError.message ?? emailError.name)
  }

  return NextResponse.json(novoUsuario, { status: 201 })
}
