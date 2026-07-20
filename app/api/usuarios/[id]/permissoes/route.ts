import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lerJson } from '@/lib/http'
import { obterUsuarioComPermissoes, requirePermission } from '@/lib/permissoes/servidor'
import { calcularOverrides } from '@/lib/permissoes/diff-overrides'
import type { Permissao } from '@/lib/permissoes/matriz'
import type { Papel } from '@/types/database'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const usuarioLogado = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuarioLogado || !requirePermission(usuarioLogado.permissoes, 'alterar_permissoes')) {
    return NextResponse.json({ error: 'Sem permissão para alterar permissões' }, { status: 403 })
  }

  const { id } = await params
  const body = await lerJson<{ permissoes?: string[] }>(request)
  if (!body || !Array.isArray(body.permissoes)) {
    return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 })
  }

  const { data: alvo, error: erroAlvo } = await supabase
    .from('usuarios').select('papel').eq('id', id).single()
  if (erroAlvo || !alvo) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
  }

  const permissoesDesejadas = new Set(body.permissoes) as Set<Permissao>
  const overrides = calcularOverrides(alvo.papel as Papel, permissoesDesejadas)

  // Substitui todos os overrides do usuário pelo novo conjunto calculado —
  // mesmo padrão de "apaga e recria" já usado em lib/composicoes/atualizar.ts
  // pros materiais/mão de obra de uma composição.
  const { error: erroDelete } = await supabase
    .from('usuario_permissoes').delete().eq('usuario_id', id)
  if (erroDelete) return NextResponse.json({ error: erroDelete.message }, { status: 500 })

  if (overrides.length > 0) {
    const { error: erroInsert } = await supabase.from('usuario_permissoes').insert(
      overrides.map(o => ({
        usuario_id: id,
        permissao: o.permissao,
        concedida: o.concedida,
        criado_por: user.id,
      }))
    )
    if (erroInsert) return NextResponse.json({ error: erroInsert.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
