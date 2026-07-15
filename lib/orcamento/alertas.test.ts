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

  it('sinaliza duas relações de duplicado distintas envolvendo o mesmo item, sem suprimir uma pela outra', () => {
    const itens = [
      { id: 'item-a', descricao: 'Pintura sala', composicao_id: 'comp-1', quantidade: 10, custo_unit_material: 50, custo_unit_mao_obra: 30, markup_material: 1.2, markup_mao_obra: 1.2, unidade_id: null },
      { id: 'item-b', descricao: 'Pintura quarto', composicao_id: 'comp-1', quantidade: 5, custo_unit_material: 50, custo_unit_mao_obra: 30, markup_material: 1.2, markup_mao_obra: 1.2, unidade_id: null },
      { id: 'item-c', descricao: 'Pintura sala', composicao_id: 'comp-2', quantidade: 8, custo_unit_material: 50, custo_unit_mao_obra: 30, markup_material: 1.2, markup_mao_obra: 1.2, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, {})
    // item-a é duplicado de item-b (mesma composição) E de item-c (mesma descrição) — duas relações distintas, ambas devem aparecer.
    const alertasA = resultado['item-a'].filter(a => a.tipo === 'duplicado')
    expect(alertasA).toHaveLength(2)
    // item-c só é duplicado de item-a (descrição) — não tem relação de composição com ninguém (comp-2 é usado só por ele).
    const alertasC = resultado['item-c'].filter(a => a.tipo === 'duplicado')
    expect(alertasC).toHaveLength(1)
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

describe('calcularAlertasOrcamento — valor/markup fora do padrão', () => {
  const estatisticasBase = {
    'comp-1': {
      amostras: 3,
      mediaCustoMaterial: 100,
      mediaCustoMaoObra: 50,
      mediaMarkupMaterial: 1.2,
      mediaMarkupMaoObra: 1.3,
      mediaQuantidade: 10,
    },
  }

  it('sinaliza custo de material fora do padrão quando desvia mais de 30% da média', () => {
    const itens = [
      { id: 'item-1', descricao: 'Item A', composicao_id: 'comp-1', quantidade: 10, custo_unit_material: 200, custo_unit_mao_obra: 50, markup_material: 1.2, markup_mao_obra: 1.3, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, estatisticasBase)
    expect(resultado['item-1'].some(a => a.tipo === 'valor_material_fora_padrao')).toBe(true)
  })

  it('não sinaliza quando o desvio é menor que 30%', () => {
    const itens = [
      { id: 'item-1', descricao: 'Item A', composicao_id: 'comp-1', quantidade: 10, custo_unit_material: 110, custo_unit_mao_obra: 50, markup_material: 1.2, markup_mao_obra: 1.3, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, estatisticasBase)
    expect(resultado['item-1'] ?? []).toEqual([])
  })

  it('não sinaliza quando a composição tem menos de 3 amostras históricas', () => {
    const estatisticasPoucaAmostra = { 'comp-1': { ...estatisticasBase['comp-1'], amostras: 2 } }
    const itens = [
      { id: 'item-1', descricao: 'Item A', composicao_id: 'comp-1', quantidade: 10, custo_unit_material: 500, custo_unit_mao_obra: 50, markup_material: 1.2, markup_mao_obra: 1.3, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, estatisticasPoucaAmostra)
    expect(resultado['item-1'] ?? []).toEqual([])
  })

  it('sinaliza markup de mão de obra fora da faixa', () => {
    const itens = [
      { id: 'item-1', descricao: 'Item A', composicao_id: 'comp-1', quantidade: 10, custo_unit_material: 100, custo_unit_mao_obra: 50, markup_material: 1.2, markup_mao_obra: 2.5, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, estatisticasBase)
    expect(resultado['item-1'].some(a => a.tipo === 'markup_mao_obra_fora_faixa')).toBe(true)
  })

  it('sinaliza quantidade fora do padrão histórico mesmo sendo positiva', () => {
    const itens = [
      { id: 'item-1', descricao: 'Item A', composicao_id: 'comp-1', quantidade: 50, custo_unit_material: 100, custo_unit_mao_obra: 50, markup_material: 1.2, markup_mao_obra: 1.3, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, estatisticasBase)
    expect(resultado['item-1'].some(a => a.tipo === 'quantidade_inconsistente')).toBe(true)
  })

  it('ignora as checagens de histórico para item sem composicao_id', () => {
    const itens = [
      { id: 'item-1', descricao: 'Item A', composicao_id: null, quantidade: 50, custo_unit_material: 9999, custo_unit_mao_obra: 9999, markup_material: 9999, markup_mao_obra: 9999, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, estatisticasBase)
    expect(resultado['item-1'] ?? []).toEqual([])
  })

  it('ignora a comparação de um campo quando o valor do item nesse campo é zero', () => {
    const itens = [
      { id: 'item-1', descricao: 'Item A', composicao_id: 'comp-1', quantidade: 10, custo_unit_material: 0, custo_unit_mao_obra: 50, markup_material: 1.2, markup_mao_obra: 1.3, unidade_id: null },
    ]
    const resultado = calcularAlertasOrcamento(itens, estatisticasBase)
    expect(resultado['item-1']?.some(a => a.tipo === 'valor_material_fora_padrao') ?? false).toBe(false)
  })
})

describe('calcularAlertasOrcamento — unidade divergente', () => {
  it('sinaliza quando a unidade do item difere da unidade da composição', () => {
    const itens = [
      {
        id: 'item-1', descricao: 'Item A', composicao_id: 'comp-1', quantidade: 10,
        custo_unit_material: 100, custo_unit_mao_obra: 50, markup_material: 1.2, markup_mao_obra: 1.3,
        unidade_id: 'un-un', composicoes: { unidade_id: 'un-m2' },
      },
    ]
    const resultado = calcularAlertasOrcamento(itens, {})
    expect(resultado['item-1'].some(a => a.tipo === 'unidade_divergente')).toBe(true)
  })

  it('não sinaliza quando as unidades são iguais', () => {
    const itens = [
      {
        id: 'item-1', descricao: 'Item A', composicao_id: 'comp-1', quantidade: 10,
        custo_unit_material: 100, custo_unit_mao_obra: 50, markup_material: 1.2, markup_mao_obra: 1.3,
        unidade_id: 'un-m2', composicoes: { unidade_id: 'un-m2' },
      },
    ]
    const resultado = calcularAlertasOrcamento(itens, {})
    expect(resultado['item-1'] ?? []).toEqual([])
  })

  it('não sinaliza quando o item não tem composição vinculada', () => {
    const itens = [
      { id: 'item-1', descricao: 'Item A', composicao_id: null, quantidade: 10, custo_unit_material: 100, custo_unit_mao_obra: 50, markup_material: 1.2, markup_mao_obra: 1.3, unidade_id: 'un-un' },
    ]
    const resultado = calcularAlertasOrcamento(itens, {})
    expect(resultado['item-1'] ?? []).toEqual([])
  })
})
