export type MaterialBody = {
  descricao?: string
  quantidade?: number
  unidade_id?: string | null
  fornecedor?: string | null
  preco_unitario?: number
}

export type MaoObraBody = {
  cargo?: string
  horas?: number
  custo_hora?: number
}

export interface MaterialNormalizado {
  descricao: string
  quantidade: number
  unidade_id: string | null
  fornecedor: string | null
  preco_unitario: number
  ordem: number
  // Índice permite usar o resultado onde se espera Record<string, unknown>
  // (ex.: composicaoMudou em lib/composicoes/calculos.ts).
  [key: string]: unknown
}

export interface MaoObraNormalizada {
  cargo: string
  horas: number
  custo_hora: number
  ordem: number
  [key: string]: unknown
}

/** Normaliza a lista de materiais recebida no corpo da requisição (POST/PUT),
 * aplicando os defaults e trims usados ao gravar no banco. */
export function normalizarMateriais(materiais: MaterialBody[]): MaterialNormalizado[] {
  return materiais.map((m, i) => ({
    descricao: m.descricao ?? '',
    quantidade: m.quantidade ?? 0,
    unidade_id: m.unidade_id || null,
    fornecedor: m.fornecedor?.trim() || null,
    preco_unitario: m.preco_unitario ?? 0,
    ordem: i + 1,
  }))
}

/** Normaliza a lista de mão de obra recebida no corpo da requisição (POST/PUT),
 * aplicando os defaults usados ao gravar no banco. */
export function normalizarMaoObra(maoObra: MaoObraBody[]): MaoObraNormalizada[] {
  return maoObra.map((m, i) => ({
    cargo: m.cargo ?? '',
    horas: m.horas ?? 0,
    custo_hora: m.custo_hora ?? 0,
    ordem: i + 1,
  }))
}
