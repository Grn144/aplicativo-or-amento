import { describe, it, expect } from 'vitest'
import { calcularPermissoes } from './resolver'

describe('calcularPermissoes', () => {
  it('sem overrides, retorna exatamente a matriz padrão do perfil', () => {
    const permissoes = calcularPermissoes('visitante')
    expect(permissoes.has('visualizar_dashboard')).toBe(true)
    expect(permissoes.has('visualizar_custos')).toBe(false)
  })

  it('override concedida:true adiciona uma permissão que o perfil não tem', () => {
    const permissoes = calcularPermissoes('comercial', [
      { permissao: 'visualizar_custos', concedida: true },
    ])
    expect(permissoes.has('visualizar_custos')).toBe(true)
    // demais permissões do perfil comercial continuam intactas
    expect(permissoes.has('visualizar_margem')).toBe(false)
    expect(permissoes.has('exportar_planilhas')).toBe(true)
  })

  it('override concedida:false revoga uma permissão que o perfil tem', () => {
    const permissoes = calcularPermissoes('gerente', [
      { permissao: 'exportar_planilhas', concedida: false },
    ])
    expect(permissoes.has('exportar_planilhas')).toBe(false)
    expect(permissoes.has('editar_obras')).toBe(true)
  })

  it('não muta a matriz padrão original (Set independente por chamada)', () => {
    calcularPermissoes('comercial', [{ permissao: 'visualizar_custos', concedida: true }])
    const semOverride = calcularPermissoes('comercial')
    expect(semOverride.has('visualizar_custos')).toBe(false)
  })
})
