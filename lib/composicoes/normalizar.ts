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

export interface CamposEditaveisComposicao {
  codigo: string
  nome: string
  disciplina_id: string | null
  descricao_tecnica: string
  unidade_id: string | null
  produtividade: string | null
  markup_sugerido: number
  observacoes: string | null
  tags: string[]
  ativo: boolean
}

type SnapshotComposicaoParcial = {
  codigo: string
  nome: string
  disciplina_id: string | null
  descricao_tecnica: string
  unidade_id: string | null
  produtividade: string | null
  markup_sugerido: number
  observacoes: string | null
  tags?: string[]
  ativo?: boolean
}

/** Extrai os campos editáveis de uma composição a partir de um snapshot
 * arquivado (composicao_versoes.snapshot.composicao), descartando campos
 * derivados/imutáveis (id, custo_direto, versao, responsavel_id, criado_em,
 * atualizado_em, relações). Usado ao restaurar uma versão anterior. */
export function extrairCamposDeSnapshot(composicao: SnapshotComposicaoParcial): CamposEditaveisComposicao {
  return {
    codigo: composicao.codigo,
    nome: composicao.nome,
    disciplina_id: composicao.disciplina_id,
    descricao_tecnica: composicao.descricao_tecnica,
    unidade_id: composicao.unidade_id,
    produtividade: composicao.produtividade,
    markup_sugerido: composicao.markup_sugerido,
    observacoes: composicao.observacoes,
    tags: composicao.tags ?? [],
    ativo: composicao.ativo ?? true,
  }
}
