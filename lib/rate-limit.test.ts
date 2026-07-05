import { describe, it, expect, vi, beforeEach } from 'vitest'

const estado: {
  registro: { contagem: number; janela_inicio: string } | null
  falhaBanco: boolean
} = { registro: null, falhaBanco: false }

const upsert = vi.fn(async () => ({ error: null }))
const updateEq = vi.fn(async () => ({ error: null }))
const update = vi.fn(() => ({ eq: updateEq }))

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (estado.falhaBanco) throw new Error('banco indisponível')
            return { data: estado.registro, error: null }
          },
        }),
      }),
      upsert,
      update,
    }),
  }),
}))

import { verificarRateLimit } from './rate-limit'

describe('verificarRateLimit', () => {
  beforeEach(() => {
    estado.registro = null
    estado.falhaBanco = false
    vi.clearAllMocks()
  })

  it('permite e abre janela quando não há registro', async () => {
    const ok = await verificarRateLimit('login:a@b.com', 5)
    expect(ok).toBe(true)
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ chave: 'login:a@b.com', contagem: 1 })
    )
  })

  it('permite e incrementa dentro da janela abaixo do limite', async () => {
    estado.registro = { contagem: 2, janela_inicio: new Date().toISOString() }
    const ok = await verificarRateLimit('login:a@b.com', 5)
    expect(ok).toBe(true)
    expect(update).toHaveBeenCalledWith({ contagem: 3 })
  })

  it('bloqueia quando o limite foi atingido dentro da janela', async () => {
    estado.registro = { contagem: 5, janela_inicio: new Date().toISOString() }
    const ok = await verificarRateLimit('login:a@b.com', 5)
    expect(ok).toBe(false)
    expect(update).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
  })

  it('reinicia a janela quando os 15 minutos expiraram', async () => {
    const antiga = new Date(Date.now() - 16 * 60 * 1000).toISOString()
    estado.registro = { contagem: 5, janela_inicio: antiga }
    const ok = await verificarRateLimit('login:a@b.com', 5)
    expect(ok).toBe(true)
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ contagem: 1 })
    )
  })

  it('permite (fail-open) quando o banco falha', async () => {
    estado.falhaBanco = true
    const ok = await verificarRateLimit('login:a@b.com', 5)
    expect(ok).toBe(true)
  })
})
