// lib/composicoes/embeddings-texto.ts

/** Texto usado pra gerar o embedding de uma composição — nome + descrição
 * técnica é o que melhor representa "o que essa composição faz". */
export function textoEmbeddingComposicao(nome: string, descricaoTecnica: string): string {
  return `${nome.trim()} ${descricaoTecnica.trim()}`.trim()
}

/** Texto usado pra gerar o embedding de um material — só a descrição. */
export function textoEmbeddingMaterial(descricao: string): string {
  return descricao.trim()
}

/** Limiar mínimo de similaridade de cosseno (0 a 1) pra considerar um
 * resultado relevante o suficiente pra mostrar como sugestão. Valor inicial
 * empírico pro text-embedding-3-small em descrições técnicas curtas em
 * português — ajustável aqui sem precisar de migration. */
export const LIMIAR_SIMILARIDADE = 0.75

export interface ResultadoComSimilaridade {
  similaridade: number
}

/** Filtra um resultado bruto de busca por similaridade (já ordenado por
 * proximidade pela função SQL match_composicoes/match_materiais, mas sem
 * filtro de qualidade) pelo limiar mínimo, reordena por similaridade
 * decrescente (defensivo — não confia na ordem vinda do banco) e corta em
 * até `limite` resultados. */
export function filtrarPorSimilaridade<T extends ResultadoComSimilaridade>(
  resultados: T[],
  limiar: number = LIMIAR_SIMILARIDADE,
  limite?: number
): T[] {
  const filtrados = [...resultados]
    .filter(r => r.similaridade >= limiar)
    .sort((a, b) => b.similaridade - a.similaridade)
  return limite !== undefined ? filtrados.slice(0, limite) : filtrados
}
