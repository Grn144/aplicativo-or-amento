// lib/embeddings/gerar.ts
import OpenAI from 'openai'

const MODELO = 'text-embedding-3-small'

let cliente: OpenAI | null = null

function obterCliente(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  if (!cliente) cliente = new OpenAI({ apiKey })
  return cliente
}

/** Gera o embedding de um texto via OpenAI. Nunca lança — retorna null em
 * qualquer falha (chave ausente, erro de rede, limite de taxa, texto vazio
 * etc.), pra nunca bloquear a operação principal (criar/editar composição,
 * ou uma busca por similaridade) por causa desta feature secundária. */
export async function gerarEmbedding(texto: string): Promise<number[] | null> {
  const textoLimpo = texto.trim()
  if (!textoLimpo) return null

  const clienteOpenAI = obterCliente()
  if (!clienteOpenAI) {
    console.error('OPENAI_API_KEY não configurada — embedding não gerado')
    return null
  }

  try {
    const resposta = await clienteOpenAI.embeddings.create({ model: MODELO, input: textoLimpo })
    return resposta.data[0]?.embedding ?? null
  } catch (erro) {
    console.error('Falha ao gerar embedding:', erro instanceof Error ? erro.message : erro)
    return null
  }
}
