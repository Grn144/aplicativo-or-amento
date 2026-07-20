import { describe, it, expect } from 'vitest'
import { MATRIZ_PADRAO, PERMISSOES } from './matriz'

describe('MATRIZ_PADRAO', () => {
  it('admin tem todas as permissões do catálogo', () => {
    for (const permissao of PERMISSOES) {
      expect(MATRIZ_PADRAO.admin.has(permissao)).toBe(true)
    }
  })

  it('gerente tem acesso operacional amplo mas não administra usuários/permissões/configurações', () => {
    const esperado = new Set([
      'visualizar_dashboard', 'visualizar_indicadores', 'editar_clientes',
      'criar_obras', 'editar_obras', 'visualizar_custos', 'visualizar_margem', 'visualizar_lucro',
      'visualizar_banco_composicoes', 'cadastrar_composicoes', 'editar_composicoes',
      'importar_planilhas', 'exportar_planilhas',
    ])
    for (const permissao of PERMISSOES) {
      expect(MATRIZ_PADRAO.gerente.has(permissao)).toBe(esperado.has(permissao))
    }
  })

  it('orcamentista monta orçamento mas não vê lucro nem edita o banco de composições', () => {
    const esperado = new Set([
      'visualizar_dashboard', 'editar_clientes', 'criar_obras', 'editar_obras',
      'visualizar_custos', 'visualizar_banco_composicoes', 'importar_planilhas', 'exportar_planilhas',
    ])
    for (const permissao of PERMISSOES) {
      expect(MATRIZ_PADRAO.orcamentista.has(permissao)).toBe(esperado.has(permissao))
    }
    expect(MATRIZ_PADRAO.orcamentista.has('visualizar_lucro')).toBe(false)
    expect(MATRIZ_PADRAO.orcamentista.has('cadastrar_composicoes')).toBe(false)
  })

  it('comercial não vê custo, margem, lucro nem o banco de composições', () => {
    const esperado = new Set(['visualizar_dashboard', 'exportar_planilhas'])
    for (const permissao of PERMISSOES) {
      expect(MATRIZ_PADRAO.comercial.has(permissao)).toBe(esperado.has(permissao))
    }
  })

  it('financeiro vê tudo que é financeiro mas não edita composições nem usuários', () => {
    const esperado = new Set([
      'visualizar_dashboard', 'visualizar_indicadores', 'visualizar_custos',
      'visualizar_margem', 'visualizar_lucro', 'visualizar_banco_composicoes',
      'importar_planilhas', 'exportar_planilhas',
    ])
    for (const permissao of PERMISSOES) {
      expect(MATRIZ_PADRAO.financeiro.has(permissao)).toBe(esperado.has(permissao))
    }
  })

  it('visitante só visualiza o dashboard', () => {
    const esperado = new Set(['visualizar_dashboard'])
    for (const permissao of PERMISSOES) {
      expect(MATRIZ_PADRAO.visitante.has(permissao)).toBe(esperado.has(permissao))
    }
  })
})
