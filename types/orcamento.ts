import { ItemOrcamento, GrupoOrcamento } from './database'

export type TipoVisao = 'tecnica' | 'comercial'
export type TipoExport = 'tecnico' | 'comercial'

export interface ItemCalculado extends ItemOrcamento {
  subtotal_mao_obra_custo: number
  subtotal_material_custo: number
  total_custo: number
  fee_unit_mao_obra: number
  fee_unit_material: number
  preco_unit_mao_obra_venda: number
  preco_unit_material_venda: number
  subtotal_mao_obra_venda: number
  subtotal_material_venda: number
  total_venda: number
  lucro: number
  margem_efetiva_pct: number
}

export interface TotaisGrupo {
  subtotal_mao_obra_custo: number
  subtotal_material_custo: number
  total_custo: number
  subtotal_mao_obra_venda: number
  subtotal_material_venda: number
  total_venda: number
  lucro: number
}

export interface TotaisGerais {
  total_mao_obra_custo: number
  total_material_custo: number
  total_custo: number
  total_mao_obra_venda: number
  total_material_venda: number
  total_venda: number
  lucro: number
  margem_efetiva_pct: number
}

export interface GrupoCalculado extends GrupoOrcamento {
  itens_calculados: ItemCalculado[]
  totais: TotaisGrupo
}

export interface Rentabilidade {
  faturamento: number
  custo_total: number
  comissao: number
  imposto: number
  custo_com_fee: number
  liquido: number
  liquido_pct: number | null
}
