import { describe, it, expect } from 'vitest'
import { obterUsuarioComPermissoes, requireRole, requirePermission } from './servidor'

function supabaseMock(usuario: { id: string; nome: string; papel: string } | null, overrides: { permissao: string; concedida: boolean }[]) {
  return {
    from(tabela: string) {
      if (tabela === 'usuarios') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: usuario, error: null }) }) }) }
      }
      if (tabela === 'usuario_permissoes') {
        return { select: () => ({ eq: async () => ({ data: overrides, error: null }) }) }
      }
      throw new Error(`tabela inesperada: ${tabela}`)
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('obterUsuarioComPermissoes', () => {
  it('retorna null quando o usuário não existe', async () => {
    const resultado = await obterUsuarioComPermissoes(supabaseMock(null, []), 'user-1')
    expect(resultado).toBeNull()
  })

  it('retorna usuário com permissões calculadas a partir do perfil', async () => {
    const resultado = await obterUsuarioComPermissoes(
      supabaseMock({ id: 'user-1', nome: 'Ana', papel: 'comercial' }, []),
      'user-1'
    )
    expect(resultado?.papel).toBe('comercial')
    expect(resultado?.permissoes.has('exportar_planilhas')).toBe(true)
    expect(resultado?.permissoes.has('visualizar_custos')).toBe(false)
  })

  it('aplica overrides individuais sobre o perfil', async () => {
    const resultado = await obterUsuarioComPermissoes(
      supabaseMock(
        { id: 'user-1', nome: 'Ana', papel: 'comercial' },
        [{ permissao: 'visualizar_custos', concedida: true }]
      ),
      'user-1'
    )
    expect(resultado?.permissoes.has('visualizar_custos')).toBe(true)
  })
})

describe('requireRole', () => {
  it('true quando o papel está entre os permitidos', () => {
    expect(requireRole('admin', 'admin', 'gerente')).toBe(true)
  })
  it('false quando o papel não está entre os permitidos', () => {
    expect(requireRole('visitante', 'admin', 'gerente')).toBe(false)
  })
})

describe('requirePermission', () => {
  it('true quando a permissão está no conjunto', () => {
    expect(requirePermission(new Set(['exportar_planilhas'] as const), 'exportar_planilhas')).toBe(true)
  })
  it('false quando a permissão não está no conjunto', () => {
    expect(requirePermission(new Set([] as const), 'exportar_planilhas')).toBe(false)
  })
})
