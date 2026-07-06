import { describe, it, expect } from 'vitest'
import { lerJson } from './http'

function req(body: string): Request {
  return new Request('http://localhost/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
}

describe('lerJson', () => {
  it('retorna o objeto quando o corpo é JSON válido', async () => {
    const data = await lerJson<{ a: number }>(req('{"a":1}'))
    expect(data).toEqual({ a: 1 })
  })

  it('retorna null quando o corpo é JSON inválido (não lança)', async () => {
    const data = await lerJson(req('{"email":'))
    expect(data).toBeNull()
  })

  it('retorna null para corpo vazio', async () => {
    const data = await lerJson(req(''))
    expect(data).toBeNull()
  })

  it('retorna null para corpo que não é objeto (número/string)', async () => {
    expect(await lerJson(req('42'))).toBeNull()
    expect(await lerJson(req('"texto"'))).toBeNull()
    expect(await lerJson(req('null'))).toBeNull()
  })
})
