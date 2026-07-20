// app/api/obras/[id]/grupos/[grupoId]/itens/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lerJson } from '@/lib/http'
import { mapearComposicaoParaItem } from '@/lib/composicoes/calculos'
import { obterUsuarioComPermissoes, requirePermission } from '@/lib/permissoes/servidor'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; grupoId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'editar_obras')) {
    return NextResponse.json({ error: 'Sem permissão para editar orçamentos' }, { status: 403 })
  }

  const { id: obra_id, grupoId: grupo_id } = await params
  const body = await lerJson<{ composicao_id?: string; quantidade?: number }>(request)
  if (!body) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 })

  // Próximo número e ordem
  const { count } = await supabase
    .from('itens_orcamento')
    .select('*', { count: 'exact', head: true })
    .eq('grupo_id', grupo_id)

  const numero = (count ?? 0) + 1
  const ordem = numero

  if (body.composicao_id) {
    if (!body.quantidade || body.quantidade <= 0) {
      return NextResponse.json(
        { error: 'Quantidade deve ser maior que zero para inserir uma composição' },
        { status: 400 }
      )
    }

    const [composicaoRes, materiaisRes, maoObraRes] = await Promise.all([
      supabase.from('composicoes').select('*').eq('id', body.composicao_id).single(),
      supabase.from('composicao_materiais').select('*').eq('composicao_id', body.composicao_id),
      supabase.from('composicao_mao_obra').select('*').eq('composicao_id', body.composicao_id),
    ])
    if (composicaoRes.error || !composicaoRes.data) {
      return NextResponse.json({ error: 'Composição não encontrada' }, { status: 404 })
    }

    const campos = mapearComposicaoParaItem(
      composicaoRes.data,
      (materiaisRes.data ?? []).map(m => ({ quantidade: m.quantidade, preco_unitario: m.preco_unitario })),
      (maoObraRes.data ?? []).map(m => ({ horas: m.horas, custo_hora: m.custo_hora }))
    )

    const { data, error } = await supabase
      .from('itens_orcamento')
      .insert({
        grupo_id,
        numero,
        ordem,
        descricao: campos.descricao,
        unidade_id: campos.unidade_id,
        quantidade: body.quantidade,
        custo_unit_mao_obra: campos.custo_unit_mao_obra,
        custo_unit_material: campos.custo_unit_material,
        markup_mao_obra: campos.markup_mao_obra,
        markup_material: campos.markup_material,
        composicao_id: composicaoRes.data.id,
        composicao_versao: composicaoRes.data.versao,
      })
      .select('*, unidades_medida(*)')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Log de uso — não bloqueia a criação do item, que já foi commitada com
    // sucesso acima. É telemetria suplementar (histórico "quantas vezes essa
    // composição já foi usada"), não um dado crítico do orçamento.
    const { error: erroUso } = await supabase.from('composicao_usos').insert({
      composicao_id: composicaoRes.data.id,
      composicao_versao: composicaoRes.data.versao,
      obra_id,
      usuario_id: user.id,
    })
    if (erroUso) {
      console.error('Falha ao registrar uso da composição:', erroUso.message)
    }

    return NextResponse.json(data, { status: 201 })
  }

  const bodyGenerico = body as Record<string, unknown>
  const { data, error } = await supabase
    .from('itens_orcamento')
    .insert({
      grupo_id,
      numero,
      ordem,
      descricao: bodyGenerico.descricao ?? 'Novo item',
      local: bodyGenerico.local ?? null,
      unidade_id: bodyGenerico.unidade_id ?? null,
      quantidade: bodyGenerico.quantidade ?? 0,
      custo_unit_mao_obra: bodyGenerico.custo_unit_mao_obra ?? 0,
      custo_unit_material: bodyGenerico.custo_unit_material ?? 0,
      observacao: bodyGenerico.observacao ?? null,
      observacao_2: bodyGenerico.observacao_2 ?? null,
    })
    .select('*, unidades_medida(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
