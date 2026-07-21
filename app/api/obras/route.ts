import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { lerJson } from '@/lib/http'
import { obterUsuarioComPermissoes, requirePermission } from '@/lib/permissoes/servidor'
import { calcularItem } from '@/lib/calculos'
import type { ItemOrcamento } from '@/types/database'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const busca = searchParams.get('busca') ?? ''
  const buscaSanitizada = busca.replace(/[(),]/g, '')
  const status = searchParams.get('status') ?? ''

  // Leitura de custos via service_role: as colunas de custo/markup foram
  // revogadas do papel authenticated (migration 016). O total de VENDA é
  // derivado no servidor e é o único valor financeiro que vai ao navegador.
  const admin = await createAdminClient()
  let query = admin
    .from('obras')
    .select(`
      id, codigo, nome, status, data_orcamento, criado_em, atualizado_em,
      clientes (id, razao_social),
      grupos_orcamento (
        itens_orcamento (
          quantidade, custo_unit_mao_obra, custo_unit_material,
          markup_mao_obra, markup_material
        )
      )
    `)
    .order('atualizado_em', { ascending: false })
    .limit(100)

  if (status) query = query.eq('status', status)
  if (buscaSanitizada) {
    query = query.or(`codigo.ilike.%${buscaSanitizada}%,nome.ilike.%${buscaSanitizada}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Calcula o total de venda por obra no servidor e devolve só o derivado —
  // custos crus nunca saem daqui. fee_fator não é lido na listagem, então usa-se
  // o padrão 1.02 (mesmo comportamento do cálculo de total da listagem antiga).
  const obras = (data ?? []).map(obra => {
    const itens = (obra.grupos_orcamento ?? []).flatMap(g => g.itens_orcamento ?? [])
    const total_venda = itens.reduce((soma, item) => {
      const calc = calcularItem({
        quantidade: Number(item.quantidade),
        custo_unit_mao_obra: Number(item.custo_unit_mao_obra),
        custo_unit_material: Number(item.custo_unit_material),
        markup_mao_obra: Number(item.markup_mao_obra),
        markup_material: Number(item.markup_material),
        fee_mao_obra: null,
        fee_material: null,
      } as ItemOrcamento, 1.02)
      return soma + calc.total_venda
    }, 0)

    const { grupos_orcamento: _descartado, ...semItens } = obra
    return { ...semItens, total_venda }
  })

  return NextResponse.json(obras)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'criar_obras')) {
    return NextResponse.json({ error: 'Sem permissão para criar orçamentos' }, { status: 403 })
  }

  const body = await lerJson<{
    codigo?: string
    nome?: string
    cliente_id?: string | null
    data_orcamento?: string | null
  }>(request)
  if (!body) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 })
  const { codigo, nome, cliente_id, data_orcamento } = body

  if (!codigo?.trim() || !nome?.trim()) {
    return NextResponse.json({ error: 'Código e nome são obrigatórios' }, { status: 400 })
  }
  if (!cliente_id?.trim()) {
    return NextResponse.json({ error: 'Cliente é obrigatório' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('obras')
    .insert({
      codigo: codigo.trim(),
      nome: nome.trim(),
      cliente_id: cliente_id.trim(),
      data_orcamento: data_orcamento ?? null,
      criado_por: user.id,
    })
    .select('*, clientes(id, razao_social)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
