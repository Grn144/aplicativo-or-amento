import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { montarPlanilhaDescritivo, type GrupoComItens } from '@/lib/excel/export-template'
import { montarPlanilhaComercial, type GrupoComItensComercial } from '@/lib/excel/export-comercial'
import { calcularItem } from '@/lib/calculos'
import type { ItemOrcamento } from '@/types/database'
import { obterUsuarioComPermissoes, requirePermission } from '@/lib/permissoes/servidor'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  // tipo=comercial → 14 colunas (preços de venda ao cliente); tipo=tecnico → 28 colunas (descritivo custo/FEE/venda/rentabilidade)
  const tipo = request.nextUrl.searchParams.get('tipo') === 'tecnico' ? 'tecnico' : 'comercial'

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'exportar_planilhas')) {
    return NextResponse.json({ error: 'Sem permissão para exportar orçamentos' }, { status: 403 })
  }
  if (tipo === 'tecnico' && !requirePermission(usuario.permissoes, 'visualizar_custos')) {
    return NextResponse.json({ error: 'Sem permissão para exportar a planilha técnica (com custos)' }, { status: 403 })
  }

  const admin = await createAdminClient()

  const { data: obra, error } = await admin
    .from('obras')
    .select(`
      codigo, nome, fee_fator, comissao_valor, imposto_valor,
      clientes (razao_social, endereco, cnpj),
      grupos_orcamento (
        letra, ordem,
        disciplinas (nome),
        itens_orcamento (
          numero, descricao, local, ordem,
          quantidade, custo_unit_mao_obra, custo_unit_material,
          markup_mao_obra, markup_material, fee_mao_obra, fee_material,
          observacao, observacao_2,
          unidades_medida (sigla)
        )
      )
    `)
    .eq('id', id)
    .single()

  if (error || !obra) {
    return NextResponse.json({ error: 'Obra não encontrada' }, { status: 404 })
  }

  const cliente = obra.clientes as unknown as { razao_social: string; endereco: string | null; cnpj: string | null } | null

  const feeFator = Number(obra.fee_fator ?? 1.02)
  const gruposOrdenados = (obra.grupos_orcamento ?? [])
    .slice()
    .sort((a, b) => a.ordem - b.ordem)

  let wb
  if (tipo === 'comercial') {
    const grupos: GrupoComItensComercial[] = gruposOrdenados.map(g => {
      const disciplina_nome = (g.disciplinas as unknown as { nome: string } | null)?.nome ?? '—'
      return {
        letra: g.letra,
        ordem: g.ordem,
        disciplina_nome,
        itens: (g.itens_orcamento ?? [])
          .slice()
          .sort((a, b) => a.ordem - b.ordem)
          .map(item => {
            const calc = calcularItem({
              quantidade: Number(item.quantidade),
              custo_unit_mao_obra: Number(item.custo_unit_mao_obra),
              custo_unit_material: Number(item.custo_unit_material),
              markup_mao_obra: Number(item.markup_mao_obra),
              markup_material: Number(item.markup_material),
              fee_mao_obra: item.fee_mao_obra === null || item.fee_mao_obra === undefined ? null : Number(item.fee_mao_obra),
              fee_material: item.fee_material === null || item.fee_material === undefined ? null : Number(item.fee_material),
            } as ItemOrcamento, feeFator)
            return {
              numero: item.numero,
              descricao: item.descricao,
              disciplina_nome,
              local: item.local,
              unidade_sigla: (item.unidades_medida as unknown as { sigla: string } | null)?.sigla ?? '',
              quantidade: Number(item.quantidade),
              preco_unit_mao_obra_venda: calc.preco_unit_mao_obra_venda,
              preco_unit_material_venda: calc.preco_unit_material_venda,
              observacao: item.observacao ?? null,
              observacao_2: item.observacao_2 ?? null,
            }
          }),
      }
    })
    wb = montarPlanilhaComercial({ codigo: obra.codigo, nome: obra.nome, cliente }, grupos)
  } else {
    const grupos: GrupoComItens[] = gruposOrdenados.map(g => ({
      letra: g.letra,
      ordem: g.ordem,
      disciplina_nome: (g.disciplinas as unknown as { nome: string } | null)?.nome ?? '—',
      itens: (g.itens_orcamento ?? [])
        .slice()
        .sort((a, b) => a.ordem - b.ordem)
        .map(item => ({
          numero: item.numero,
          descricao: item.descricao,
          local: item.local,
          unidade_sigla: (item.unidades_medida as unknown as { sigla: string } | null)?.sigla ?? '',
          quantidade: Number(item.quantidade),
          custo_unit_mao_obra: Number(item.custo_unit_mao_obra),
          custo_unit_material: Number(item.custo_unit_material),
          markup_mao_obra: Number(item.markup_mao_obra),
          markup_material: Number(item.markup_material),
          fee_mao_obra: item.fee_mao_obra === null || item.fee_mao_obra === undefined ? null : Number(item.fee_mao_obra),
          fee_material: item.fee_material === null || item.fee_material === undefined ? null : Number(item.fee_material),
        })),
    }))
    wb = montarPlanilhaDescritivo(
      { codigo: obra.codigo, nome: obra.nome, cliente },
      grupos,
      {
        fee_fator: feeFator,
        comissao_valor: Number(obra.comissao_valor ?? 0),
        imposto_valor: Number(obra.imposto_valor ?? 0),
      },
    )
  }

  const buffer = await wb.xlsx.writeBuffer()
  const nomeArquivo = `orcamento-${tipo}-${obra.codigo.replace(/\s+/g, '-')}.xlsx`

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
    },
  })
}
