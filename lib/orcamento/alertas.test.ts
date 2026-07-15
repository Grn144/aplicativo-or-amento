import { describe, it, expect } from 'vitest'
import { calcularEstatisticasHistoricas, calcularAlertasOrcamento } from './alertas'

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

describe('calcularAlertasOrcamento — duplicado', () => {
  it('sinaliza dois itens com a mesma composicao_id', () => {
    const itens = [
      { id: 'item-1', descricao: 'Pintura sala', composicao_id: 'comp-1', quantidade: 10, custo_unit_material: 50, custo_unit_mao_obra: 30, markup_material: 1.2, markup_mao_obra: 1.2, unidade_id: 'un-m2' },
      { id: 'item-2', descricao: 'Pintura quarto', composicao_id: 'comp-1', quantidade: 5, custo_unit_material: 50, custo_unit_mao_obra: 30, markup_material: 1.2, markup_mao_obra: 1.2, unidade_id: 'un-m2' },
    ]
    const resultado = calcularAlertasOrcamento(itens, {})
    expect(resultado['item-1'].some(a => a.tipo === 'duplicado')).toBe(true)
    expect(resultado['item-2'].some(a => a.tipo === 'duplicado')).toBe(true)
  })

  it('sinaliza dois itens com a mesma descrição (ignorando maiúsculas/espaços), mesmo sem composição', () => {
    const itens = [
      { id: 'item-1', descricao: 'Instalação elétrica', composicao_id: null, quantidade: 10, custo_unit_material: 50, custo_unit_mao_obra: 30, markup_material: 1.2, markup_mao_obra: 1.2, unidade_id: null },
      { id: 'item-2', descricao: '  instalação elétrica  ', composicao_id: null, quantidade: 5, custo_unit_material: 50, custo_unit_mao_obra: 30, markup_material: 1.2, markup_mao_obra: 1.2, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, {})
    expect(resultado['item-1'].some(a => a.tipo === 'duplicado')).toBe(true)
    expect(resultado['item-2'].some(a => a.tipo === 'duplicado')).toBe(true)
  })

  it('não sinaliza itens com descrições e composições diferentes', () => {
    const itens = [
      { id: 'item-1', descricao: 'Pintura sala', composicao_id: 'comp-1', quantidade: 10, custo_unit_material: 50, custo_unit_mao_obra: 30, markup_material: 1.2, markup_mao_obra: 1.2, unidade_id: null },
      { id: 'item-2', descricao: 'Instalação elétrica', composicao_id: 'comp-2', quantidade: 5, custo_unit_material: 50, custo_unit_mao_obra: 30, markup_material: 1.2, markup_mao_obra: 1.2, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, {})
    expect(resultado['item-1'] ?? []).toEqual([])
    expect(resultado['item-2'] ?? []).toEqual([])
  })

  it('não duplica o alerta de descrição quando o par já foi sinalizado por composição', () => {
    const itens = [
      { id: 'item-1', descricao: 'Pintura sala', composicao_id: 'comp-1', quantidade: 10, custo_unit_material: 50, custo_unit_mao_obra: 30, markup_material: 1.2, markup_mao_obra: 1.2, unidade_id: null },
      { id: 'item-2', descricao: 'Pintura sala', composicao_id: 'comp-1', quantidade: 5, custo_unit_material: 50, custo_unit_mao_obra: 30, markup_material: 1.2, markup_mao_obra: 1.2, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, {})
    const alertasDuplicado = resultado['item-1'].filter(a => a.tipo === 'duplicado')
    expect(alertasDuplicado).toHaveLength(1)
  })
})

describe('calcularAlertasOrcamento — quantidade inconsistente (zero/negativa)', () => {
  it('sinaliza quantidade zero', () => {
    const itens = [
      { id: 'item-1', descricao: 'Item A', composicao_id: null, quantidade: 0, custo_unit_material: 50, custo_unit_mao_obra: 30, markup_material: 1.2, markup_mao_obra: 1.2, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, {})
    expect(resultado['item-1'].some(a => a.tipo === 'quantidade_inconsistente')).toBe(true)
  })

  it('sinaliza quantidade negativa', () => {
    const itens = [
      { id: 'item-1', descricao: 'Item A', composicao_id: null, quantidade: -5, custo_unit_material: 50, custo_unit_mao_obra: 30, markup_material: 1.2, markup_mao_obra: 1.2, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, {})
    expect(resultado['item-1'].some(a => a.tipo === 'quantidade_inconsistente')).toBe(true)
  })

  it('não sinaliza quantidade positiva sem histórico', () => {
    const itens = [
      { id: 'item-1', descricao: 'Item A', composicao_id: null, quantidade: 10, custo_unit_material: 50, custo_unit_mao_obra: 30, markup_material: 1.2, markup_mao_obra: 1.2, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, {})
    expect(resultado['item-1'] ?? []).toEqual([])
  })
})
