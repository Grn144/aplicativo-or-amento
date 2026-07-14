// lib/embeddings/gerar.ts
import { GoogleGenAI } from '@google/genai'

const MODELO = 'gemini-embedding-001'
// 1536 dimensões — mesma pontuação de qualidade (MTEB) do tamanho completo
// (3072) do gemini-embedding-001, mas metade do armazenamento. Precisa bater
// com a coluna vector(1536) das migrations (composicoes/composicao_materiais).
const DIMENSOES = 1536

let cliente: GoogleGenAI | null = null

function obterCliente(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null
  if (!cliente) cliente = new GoogleGenAI({ apiKey })
  return cliente
}

/** Gera o embedding de um texto via Google Gemini. Nunca lança — retorna
 * null em qualquer falha (chave ausente, erro de rede, limite de taxa,
 * texto vazio etc.), pra nunca bloquear a operação principal (criar/editar
 * composição, ou uma busca por similaridade) por causa desta feature
 * secundária. */
export async function gerarEmbedding(texto: string): Promise<number[] | null> {
  const textoLimpo = texto.trim()
  if (!textoLimpo) return null

  const clienteGemini = obterCliente()
  if (!clienteGemini) {
    console.error('GEMINI_API_KEY não configurada — embedding não gerado')
    return null
  }

  try {
    const resposta = await clienteGemini.models.embedContent({
      model: MODELO,
      contents: textoLimpo,
      config: { outputDimensionality: DIMENSOES },
    })
    return resposta.embeddings?.[0]?.values ?? null
  } catch (erro) {
    console.error('Falha ao gerar embedding:', erro instanceof Error ? erro.message : erro)
    return null
  }
}
