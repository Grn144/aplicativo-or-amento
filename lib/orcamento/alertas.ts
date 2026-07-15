export interface ItemHistoricoParaEstatistica {
  composicao_id: string
  custo_unit_material: number
  custo_unit_mao_obra: number
  markup_material: number
  markup_mao_obra: number
  quantidade: number
}

export interface EstatisticaComposicao {
  amostras: number
  mediaCustoMaterial: number
  mediaCustoMaoObra: number
  mediaMarkupMaterial: number
  mediaMarkupMaoObra: number
  mediaQuantidade: number
}

function media(lista: ItemHistoricoParaEstatistica[], campo: keyof Omit<ItemHistoricoParaEstatistica, 'composicao_id'>): number {
  return lista.reduce((acc, item) => acc + item[campo], 0) / lista.length
}

export function calcularEstatisticasHistoricas(
  itens: ItemHistoricoParaEstatistica[]
): Record<string, EstatisticaComposicao> {
  const porComposicao = new Map<string, ItemHistoricoParaEstatistica[]>()
  for (const item of itens) {
    const lista = porComposicao.get(item.composicao_id) ?? []
    lista.push(item)
    porComposicao.set(item.composicao_id, lista)
  }

  const resultado: Record<string, EstatisticaComposicao> = {}
  for (const [composicaoId, lista] of porComposicao) {
    resultado[composicaoId] = {
      amostras: lista.length,
      mediaCustoMaterial: media(lista, 'custo_unit_material'),
      mediaCustoMaoObra: media(lista, 'custo_unit_mao_obra'),
      mediaMarkupMaterial: media(lista, 'markup_material'),
      mediaMarkupMaoObra: media(lista, 'markup_mao_obra'),
      mediaQuantidade: media(lista, 'quantidade'),
    }
  }
  return resultado
}
