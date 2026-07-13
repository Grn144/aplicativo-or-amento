import { describe, it, expect } from 'vitest'
import { calcularCustoDireto, mapearComposicaoParaItem, composicaoMudou, composicaoIncompleta } from './calculos'
import { normalizarMateriais } from './normalizar'

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

  it('compara materiais normalizados via normalizarMateriais, como no PUT (linhas do banco vs. corpo da requisição)', () => {
    // Formato "do banco": como viria de uma linha da tabela composicao_materiais (campos extras: id, composicao_id).
    const materiaisDoBanco = [
      {
        id: 'mat-1',
        composicao_id: 'comp-1',
        descricao: 'Cabo de rede',
        quantidade: 10,
        unidade_id: 'un-m',
        fornecedor: 'Fornecedor A',
        preco_unitario: 2.5,
        ordem: 1,
      },
    ]
    // Formato "do corpo": como viria do cliente no PUT (sem id/composicao_id).
    const materiaisDoCorpoIguais = [
      { descricao: 'Cabo de rede', quantidade: 10, unidade_id: 'un-m', fornecedor: 'Fornecedor A', preco_unitario: 2.5 },
    ]
    const materiaisDoCorpoComPrecoDiferente = [
      { descricao: 'Cabo de rede', quantidade: 10, unidade_id: 'un-m', fornecedor: 'Fornecedor A', preco_unitario: 3.0 },
    ]

    const antigosNormalizados = normalizarMateriais(materiaisDoBanco)
    const iguaisNormalizados = normalizarMateriais(materiaisDoCorpoIguais)
    const diferentesNormalizados = normalizarMateriais(materiaisDoCorpoComPrecoDiferente)

    expect(
      composicaoMudou(
        { campos: {}, materiais: antigosNormalizados, maoDeObra: [] },
        { campos: {}, materiais: iguaisNormalizados, maoDeObra: [] }
      )
    ).toBe(false)

    expect(
      composicaoMudou(
        { campos: {}, materiais: antigosNormalizados, maoDeObra: [] },
        { campos: {}, materiais: diferentesNormalizados, maoDeObra: [] }
      )
    ).toBe(true)
  })
})

describe('composicaoIncompleta', () => {
  it('retorna false quando tem materiais e mão de obra', () => {
    expect(composicaoIncompleta(true, true)).toBe(false)
  })

  it('retorna true quando só tem materiais', () => {
    expect(composicaoIncompleta(true, false)).toBe(true)
  })

  it('retorna true quando só tem mão de obra', () => {
    expect(composicaoIncompleta(false, true)).toBe(true)
  })
})
