import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lerJson } from '@/lib/http'
import { obterUsuarioComPermissoes, requirePermission } from '@/lib/permissoes/servidor'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'editar_obras')) {
    return NextResponse.json({ error: 'Sem permissão para editar orçamentos' }, { status: 403 })
  }

  const { id: obra_id } = await params
  const body = await lerJson<{ disciplina_id?: string; disciplina_nome?: string }>(request)
  if (!body) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 })

  // Aceita uma disciplina existente (id) ou um nome digitado (cria se não existir)
  let disciplina_id = body.disciplina_id
  const nome = body.disciplina_nome?.trim()
  if (!disciplina_id && nome) {
    const { data: existente } = await supabase
      .from('disciplinas').select('id').ilike('nome', nome).maybeSingle()
    if (existente) {
      disciplina_id = existente.id
    } else {
      const { data: nova, error: errDisc } = await supabase
        .from('disciplinas').insert({ nome }).select('id').single()
      if (errDisc || !nova) {
        return NextResponse.json({ error: 'Falha ao criar disciplina' }, { status: 500 })
      }
      disciplina_id = nova.id
    }
  }

  if (!disciplina_id) {
    return NextResponse.json({ error: 'Informe a disciplina' }, { status: 400 })
  }

  // Próxima letra e ordem
  const { count } = await supabase
    .from('grupos_orcamento')
    .select('*', { count: 'exact', head: true })
    .eq('obra_id', obra_id)

  const ordem = (count ?? 0) + 1
  const letra = String.fromCharCode(64 + ordem)  // 1→A, 2→B, ...

  const { data, error } = await supabase
    .from('grupos_orcamento')
    .insert({ obra_id, disciplina_id, letra, ordem })
    .select('*, disciplinas(*), itens_orcamento(*, unidades_medida(*))')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
