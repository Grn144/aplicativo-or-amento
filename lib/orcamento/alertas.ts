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

export type TipoAlerta =
  | 'duplicado'
  | 'valor_material_fora_padrao'
  | 'valor_mao_obra_fora_padrao'
  | 'markup_material_fora_faixa'
  | 'markup_mao_obra_fora_faixa'
  | 'quantidade_inconsistente'
  | 'unidade_divergente'

export interface Alerta {
  tipo: TipoAlerta
  mensagem: string
}

export interface ItemParaAlerta {
  id: string
  descricao: string
  composicao_id: string | null
  quantidade: number
  custo_unit_material: number
  custo_unit_mao_obra: number
  markup_material: number
  markup_mao_obra: number
  unidade_id: string | null
  composicoes?: { unidade_id: string | null } | null
}

function adicionarAlerta(alertas: Record<string, Alerta[]>, itemId: string, alerta: Alerta) {
  const lista = alertas[itemId] ?? []
  lista.push(alerta)
  alertas[itemId] = lista
}

export function calcularAlertasOrcamento(
  itens: ItemParaAlerta[],
  estatisticas: Record<string, EstatisticaComposicao>
): Record<string, Alerta[]> {
  const alertas: Record<string, Alerta[]> = {}

  const porComposicao = new Map<string, ItemParaAlerta[]>()
  const porDescricao = new Map<string, ItemParaAlerta[]>()
  for (const item of itens) {
    if (item.composicao_id) {
      const lista = porComposicao.get(item.composicao_id) ?? []
      lista.push(item)
      porComposicao.set(item.composicao_id, lista)
    }
    const chave = item.descricao.trim().toLowerCase()
    if (chave) {
      const lista = porDescricao.get(chave) ?? []
      lista.push(item)
      porDescricao.set(chave, lista)
    }
  }

  for (const lista of porComposicao.values()) {
    if (lista.length < 2) continue
    for (const item of lista) {
      const outro = lista.find(i => i.id !== item.id)!
      adicionarAlerta(alertas, item.id, { tipo: 'duplicado', mensagem: `Mesma composição do item "${outro.descricao}"` })
    }
  }
  for (const lista of porDescricao.values()) {
    if (lista.length < 2) continue
    for (const item of lista) {
      const jaSinalizadoPorComposicao = item.composicao_id != null && (porComposicao.get(item.composicao_id)?.length ?? 0) > 1
      if (jaSinalizadoPorComposicao) continue
      const outro = lista.find(i => i.id !== item.id)!
      adicionarAlerta(alertas, item.id, { tipo: 'duplicado', mensagem: `Mesma descrição do item "${outro.descricao}"` })
    }
  }

  for (const item of itens) {
    if (item.quantidade <= 0) {
      adicionarAlerta(alertas, item.id, { tipo: 'quantidade_inconsistente', mensagem: 'Quantidade zerada ou negativa' })
    }
  }

  return alertas
}
