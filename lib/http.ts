/**
 * Lê o corpo JSON de uma requisição de forma segura.
 * Retorna null se o corpo não for um objeto JSON válido — o chamador
 * responde 400, evitando um 500 não tratado quando o cliente envia lixo.
 */
export async function lerJson<T = Record<string, unknown>>(request: Request): Promise<T | null> {
  try {
    const data = await request.json()
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      return null
    }
    return data as T
  } catch {
    return null
  }
}
