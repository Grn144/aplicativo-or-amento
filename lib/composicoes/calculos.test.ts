import { describe, it, expect } from 'vitest'
import { calcularCustoDireto, mapearComposicaoParaItem, composicaoMudou } from './calculos'

describe('calcularCustoDireto', () => {
  it('soma materiais e mão de obra por 1 unidade de referência', () => {
    const materiais = [
      { quantidade: 2, preco_unitario: 10 },   // 20
      { quantidade: 0.5, preco_unitario: 100 }, // 50
    ]
    const maoDeObra = [
      { horas: 1, custo_hora: 30 },  // 30
      { horas: 2, custo_hora: 15 },  // 30
    ]
    expect(calcularCustoDireto(materiais, maoDeObra)).toBeCloseTo(130)
  })

  it('retorna 0 para composição sem materiais nem mão de obra', () => {
    expect(calcularCustoDireto([], [])).toBe(0)
  })
})

describe('mapearComposicaoParaItem', () => {
  it('agrega custo de material e mão de obra e replica o markup sugerido nos dois campos', () => {
    const composicao = {
      descricao_tecnica: 'Instalação, configuração e testes de câmera IP',
      unidade_id: 'un-1',
      markup_sugerido: 1.65,
    }
    const materiais = [{ quantidade: 1, preco_unitario: 250 }]
    const maoDeObra = [
      { horas: 2, custo_hora: 40 },
      { horas: 1, custo_hora: 25 },
    ]
    const campos = mapearComposicaoParaItem(composicao, materiais, maoDeObra)
    expect(campos.descricao).toBe('Instalação, configuração e testes de câmera IP')
    expect(campos.unidade_id).toBe('un-1')
    expect(campos.custo_unit_material).toBeCloseTo(250)
    expect(campos.custo_unit_mao_obra).toBeCloseTo(105)
    expect(campos.markup_material).toBe(1.65)
    expect(campos.markup_mao_obra).toBe(1.65)
  })
})

describe('composicaoMudou', () => {
  it('retorna false quando campos, materiais e mão de obra são idênticos', () => {
    const snapshot = {
      campos: { nome: 'Instalação de câmera' },
      materiais: [{ preco_unitario: 250 }],
      maoDeObra: [{ horas: 2 }],
    }
    expect(composicaoMudou(snapshot, { ...snapshot })).toBe(false)
  })

  it('retorna true quando um campo simples muda', () => {
    const antiga = { campos: { nome: 'X' }, materiais: [], maoDeObra: [] }
    const nova = { campos: { nome: 'Y' }, materiais: [], maoDeObra: [] }
    expect(composicaoMudou(antiga, nova)).toBe(true)
  })

  it('retorna true quando o preço de um material muda', () => {
    const antiga = { campos: {}, materiais: [{ preco_unitario: 10 }], maoDeObra: [] }
    const nova = { campos: {}, materiais: [{ preco_unitario: 12 }], maoDeObra: [] }
    expect(composicaoMudou(antiga, nova)).toBe(true)
  })
})
