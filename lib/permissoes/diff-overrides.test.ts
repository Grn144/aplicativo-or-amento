import { describe, it, expect } from 'vitest'
import { calcularOverrides } from './diff-overrides'

describe('calcularOverrides', () => {
  it('sem diferenças em relação ao padrão do papel, não gera overrides', () => {
    const desejadas = new Set(['visualizar_dashboard', 'exportar_planilhas'] as const)
    expect(calcularOverrides('comercial', desejadas)).toEqual([])
  })

  it('permissão adicionada além do padrão vira override concedida:true', () => {
    const desejadas = new Set(['visualizar_dashboard', 'exportar_planilhas', 'visualizar_custos'] as const)
    const overrides = calcularOverrides('comercial', desejadas)
    expect(overrides).toEqual([{ permissao: 'visualizar_custos', concedida: true }])
  })

  it('permissão removida do padrão vira override concedida:false', () => {
    const desejadas = new Set(['visualizar_dashboard'] as const) // sem exportar_planilhas, que é padrão do gerente
    const overrides = calcularOverrides('gerente', desejadas)
    expect(overrides.filter(o => o.permissao === 'exportar_planilhas')).toEqual([
      { permissao: 'exportar_planilhas', concedida: false },
    ])
  })

  it('mistura de concessão e revogação no mesmo cálculo', () => {
    const desejadas = new Set(['visualizar_dashboard', 'visualizar_custos'] as const) // visitante ganhando custos
    const overrides = calcularOverrides('visitante', desejadas)
    expect(overrides).toEqual([{ permissao: 'visualizar_custos', concedida: true }])
  })
})
