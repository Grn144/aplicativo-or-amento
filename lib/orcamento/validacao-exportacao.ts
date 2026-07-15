export interface ItemParaValidarExportacao {
  id: string
  numero: number
  descricao: string
  unidade_id: string | null
  custo_unit_material: number
  custo_unit_mao_obra: number
  quantidade: number
  lucro: number
}

export type TipoProblemaExportacao =
  | 'descricao_ausente'
  | 'unidade_ausente'
  | 'valor_zerado'
  | 'quantidade_invalida'
  | 'custo_inconsistente'

export interface ProblemaExportacao {
  itemId: string
  itemNumero: number
  itemDescricao: string
  tipo: TipoProblemaExportacao
  mensagem: string
}

const DESCRICAO_PLACEHOLDER = 'Novo item'

export function validarOrcamentoParaExportacao(
  itens: ItemParaValidarExportacao[]
): ProblemaExportacao[] {
  const problemas: ProblemaExportacao[] = []

  for (const item of itens) {
    const adicionar = (tipo: TipoProblemaExportacao, mensagem: string) => {
      problemas.push({ itemId: item.id, itemNumero: item.numero, itemDescricao: item.descricao, tipo, mensagem })
    }

    const descricaoNormalizada = item.descricao.trim()
    if (descricaoNormalizada === '' || descricaoNormalizada === DESCRICAO_PLACEHOLDER) {
      adicionar('descricao_ausente', 'Descrição não preenchida')
    }
    if (item.unidade_id == null) {
      adicionar('unidade_ausente', 'Unidade de medida não selecionada')
    }
    if (item.custo_unit_material === 0 && item.custo_unit_mao_obra === 0) {
      adicionar('valor_zerado', 'Custo de material e de mão de obra zerados')
    }
    if (item.quantidade <= 0) {
      adicionar('quantidade_invalida', 'Quantidade zerada ou negativa')
    }
    if (item.lucro < 0) {
      adicionar('custo_inconsistente', 'Preço de venda menor que o custo (margem negativa)')
    }
  }

  return problemas
}
