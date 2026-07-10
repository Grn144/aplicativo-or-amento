import type { ItemOrcamento, GrupoOrcamento } from '@/types/database'
import type { ItemCalculado, TotaisGrupo, TotaisGerais, GrupoCalculado, Rentabilidade } from '@/types/orcamento'

export function calcularItem(item: ItemOrcamento, feeFatorObra: number): ItemCalculado {
  const subtotal_mao_obra_custo = item.custo_unit_mao_obra * item.quantidade
  const subtotal_material_custo = item.custo_unit_material * item.quantidade
  const total_custo = subtotal_mao_obra_custo + subtotal_material_custo

  const feeMaoObra = item.fee_mao_obra ?? feeFatorObra
  const feeMaterial = item.fee_material ?? feeFatorObra
  const fee_unit_mao_obra = item.custo_unit_mao_obra * feeMaoObra
  const fee_unit_material = item.custo_unit_material * feeMaterial
  const preco_unit_mao_obra_venda = fee_unit_mao_obra * item.markup_mao_obra
  const preco_unit_material_venda = fee_unit_material * item.markup_material
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
    fee_unit_mao_obra,
    fee_unit_material,
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
      subtotal_mao_obra_custo: 0, subtotal_material_custo: 0, total_custo: 0,
      subtotal_mao_obra_venda: 0, subtotal_material_venda: 0, total_venda: 0, lucro: 0,
    }
  )
}

export function calcularGrupo(
  grupo: GrupoOrcamento & { itens_orcamento: ItemOrcamento[] },
  feeFatorObra: number
): GrupoCalculado {
  const itens_calculados = grupo.itens_orcamento.map(it => calcularItem(it, feeFatorObra))
  const totais = calcularTotaisGrupo(itens_calculados)
  return { ...grupo, itens_calculados, totais }
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
      total_mao_obra_custo: 0, total_material_custo: 0, total_custo: 0,
      total_mao_obra_venda: 0, total_material_venda: 0, total_venda: 0, lucro: 0,
    }
  )
  const margem_efetiva_pct = acc.total_venda > 0 ? (acc.lucro / acc.total_venda) * 100 : 0
  return { ...acc, margem_efetiva_pct }
}

export function calcularRentabilidade(
  grupos: GrupoCalculado[],
  fatores: { fee_fator: number; comissao_valor: number; imposto_valor: number }
): Rentabilidade {
  const totais = calcularTotaisGerais(grupos)
  const faturamento = totais.total_venda
  const custo_total = totais.total_custo
  const comissao = fatores.comissao_valor
  const imposto = fatores.imposto_valor
  const custo_com_fee = custo_total * fatores.fee_fator
  const liquido = faturamento - comissao - imposto - custo_com_fee
  const liquido_pct = faturamento > 0 ? (liquido / faturamento) * 100 : null
  return { faturamento, custo_total, comissao, imposto, custo_com_fee, liquido, liquido_pct }
}
