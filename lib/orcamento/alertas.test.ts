import { describe, it, expect } from 'vitest'
import { calcularEstatisticasHistoricas } from './alertas'

describe('calcularEstatisticasHistoricas', () => {
  it('agrupa por composicao_id e calcula a média de cada campo', () => {
    const itens = [
      { composicao_id: 'comp-1', custo_unit_material: 100, custo_unit_mao_obra: 50, markup_material: 1.2, markup_mao_obra: 1.3, quantidade: 10 },
      { composicao_id: 'comp-1', custo_unit_material: 200, custo_unit_mao_obra: 70, markup_material: 1.4, markup_mao_obra: 1.5, quantidade: 20 },
    ]
    const resultado = calcularEstatisticasHistoricas(itens)
    expect(resultado['comp-1'].amostras).toBe(2)
    expect(resultado['comp-1'].mediaCustoMaterial).toBeCloseTo(150)
    expect(resultado['comp-1'].mediaCustoMaoObra).toBeCloseTo(60)
    expect(resultado['comp-1'].mediaMarkupMaterial).toBeCloseTo(1.3)
    expect(resultado['comp-1'].mediaMarkupMaoObra).toBeCloseTo(1.4)
    expect(resultado['comp-1'].mediaQuantidade).toBeCloseTo(15)
  })

  it('não mistura itens de composições diferentes', () => {
    const itens = [
      { composicao_id: 'comp-1', custo_unit_material: 100, custo_unit_mao_obra: 50, markup_material: 1.2, markup_mao_obra: 1.3, quantidade: 10 },
      { composicao_id: 'comp-2', custo_unit_material: 500, custo_unit_mao_obra: 300, markup_material: 2.0, markup_mao_obra: 2.0, quantidade: 1 },
    ]
    const resultado = calcularEstatisticasHistoricas(itens)
    expect(resultado['comp-1'].amostras).toBe(1)
    expect(resultado['comp-2'].amostras).toBe(1)
    expect(resultado['comp-1'].mediaCustoMaterial).toBeCloseTo(100)
    expect(resultado['comp-2'].mediaCustoMaterial).toBeCloseTo(500)
  })

  it('retorna objeto vazio para lista vazia', () => {
    expect(calcularEstatisticasHistoricas([])).toEqual({})
  })
})
