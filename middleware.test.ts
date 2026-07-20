import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const estado: { usuario: { id: string } | null; ativo: boolean | null; signOutChamado: boolean } = {
  usuario: null,
  ativo: null,
  signOutChamado: false,
}

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: estado.usuario } }),
      signOut: async () => {
        estado.signOutChamado = true
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: estado.ativo === null ? null : { ativo: estado.ativo },
            error: null,
          }),
        }),
      }),
    }),
  }),
}))

import { middleware } from './middleware'

function criarRequest(pathname: string, cookies: Record<string, string> = {}) {
  const request = new NextRequest(new URL(`http://localhost${pathname}`))
  for (const [nome, valor] of Object.entries(cookies)) {
    request.cookies.set(nome, valor)
  }
  return request
}

describe('middleware — bloqueio de usuário inativo', () => {
  beforeEach(() => {
    estado.usuario = { id: 'user-1' }
    estado.ativo = true
    estado.signOutChamado = false
  })

  it('permite acesso e renova o cookie de MFA quando o usuário está ativo', async () => {
    const request = criarRequest('/obras', { mfa_verificado: 'true' })
    const response = await middleware(request)
    expect(response.cookies.get('mfa_verificado')?.value).toBe('true')
    expect(estado.signOutChamado).toBe(false)
  })

  it('desloga e redireciona para /login quando o usuário foi desativado', async () => {
    estado.ativo = false
    const request = criarRequest('/obras', { mfa_verificado: 'true' })
    const response = await middleware(request)
    expect(estado.signOutChamado).toBe(true)
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/login')
  })
})
