import type { ItemOrcamento, GrupoOrcamento } from '@/types/database'
import type { ItemCalculado, TotaisGrupo, TotaisGerais, GrupoCalculado } from '@/types/orcamento'

export function calcularItem(item: ItemOrcamento): ItemCalculado {
  const subtotal_mao_obra_custo = item.custo_unit_mao_obra * item.quantidade
  const subtotal_material_custo = item.custo_unit_material * item.quantidade
  const total_custo = subtotal_mao_obra_custo + subtotal_material_custo

  const preco_unit_mao_obra_venda = item.custo_unit_mao_obra * (1 + item.margem_mao_obra_pct / 100)
  const preco_unit_material_venda = item.custo_unit_material * (1 + item.margem_material_pct / 100)
  const subtotal_mao_obra_venda = preco_unit_mao_obra_venda * item.quantidade
  const subtotal_material_venda = preco_unit_material_venda * item.quantidade
  const total_venda = subtotal_mao_obra_venda + subtotal_material_venda

  const lucro = total_venda - total_custo
  const margem_efetiva_pct = total_venda > 0 ? (lucro / total_venda) * 100 : 0

  return {
    ...item,
    subtotal_mao_obra_custo,
    subtotal_material_custo,
    total_custo,
    preco_unit_mao_obra_venda,
    preco_unit_material_venda,
    subtotal_mao_obra_venda,
    subtotal_material_venda,
    total_venda,
    lucro,
    margem_efetiva_pct,
  }
}

export function calcularTotaisGrupo(itens: ItemCalculado[]): TotaisGrupo {
  return itens.reduce(
    (acc, item) => ({
      subtotal_mao_obra_custo: acc.subtotal_mao_obra_custo + item.subtotal_mao_obra_custo,
      subtotal_material_custo: acc.subtotal_material_custo + item.subtotal_material_custo,
      total_custo: acc.total_custo + item.total_custo,
      subtotal_mao_obra_venda: acc.subtotal_mao_obra_venda + item.subtotal_mao_obra_venda,
      subtotal_material_venda: acc.subtotal_material_venda + item.subtotal_material_venda,
      total_venda: acc.total_venda + item.total_venda,
      lucro: acc.lucro + item.lucro,
    }),
    {
      subtotal_mao_obra_custo: 0,
      subtotal_material_custo: 0,
      total_custo: 0,
      subtotal_mao_obra_venda: 0,
      subtotal_material_venda: 0,
      total_venda: 0,
      lucro: 0,
    }
  )
}

export function calcularTotaisGerais(grupos: GrupoCalculado[]): TotaisGerais {
  const acc = grupos.reduce(
    (a, g) => ({
      total_mao_obra_custo: a.total_mao_obra_custo + g.totais.subtotal_mao_obra_custo,
      total_material_custo: a.total_material_custo + g.totais.subtotal_material_custo,
      total_custo: a.total_custo + g.totais.total_custo,
      total_mao_obra_venda: a.total_mao_obra_venda + g.totais.subtotal_mao_obra_venda,
      total_material_venda: a.total_material_venda + g.totais.subtotal_material_venda,
      total_venda: a.total_venda + g.totais.total_venda,
      lucro: a.lucro + g.totais.lucro,
    }),
    {
      total_mao_obra_custo: 0,
      total_material_custo: 0,
      total_custo: 0,
      total_mao_obra_venda: 0,
      total_material_venda: 0,
      total_venda: 0,
      lucro: 0,
    }
  )
  const margem_efetiva_pct = acc.total_venda > 0 ? (acc.lucro / acc.total_venda) * 100 : 0
  return { ...acc, margem_efetiva_pct }
}

export function calcularGrupo(
  grupo: GrupoOrcamento & { itens_orcamento: ItemOrcamento[] }
): GrupoCalculado {
  const itens_calculados = grupo.itens_orcamento.map(calcularItem)
  const totais = calcularTotaisGrupo(itens_calculados)
  return { ...grupo, itens_calculados, totais }
}
