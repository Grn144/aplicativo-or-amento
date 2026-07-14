import { describe, it, expect } from 'vitest'
import {
  textoEmbeddingComposicao,
  textoEmbeddingMaterial,
  filtrarPorSimilaridade,
  LIMIAR_SIMILARIDADE,
} from './embeddings-texto'

describe('textoEmbeddingComposicao', () => {
  it('junta nome e descrição técnica com espaço', () => {
    expect(textoEmbeddingComposicao('Alvenaria', 'Execução de alvenaria de blocos')).toBe(
      'Alvenaria Execução de alvenaria de blocos'
    )
  })

  it('remove espaços extras nas pontas de cada campo', () => {
    expect(textoEmbeddingComposicao('  Alvenaria  ', '  Descrição  ')).toBe('Alvenaria Descrição')
  })
})

describe('textoEmbeddingMaterial', () => {
  it('retorna a descrição sem espaços nas pontas', () => {
    expect(textoEmbeddingMaterial('  Bloco cerâmico  ')).toBe('Bloco cerâmico')
  })
})

describe('filtrarPorSimilaridade', () => {
  it('remove resultados abaixo do limiar', () => {
    const resultados = [{ id: 'a', similaridade: 0.9 }, { id: 'b', similaridade: 0.5 }]
    expect(filtrarPorSimilaridade(resultados, 0.75)).toEqual([{ id: 'a', similaridade: 0.9 }])
  })

  it('ordena do mais parecido pro menos parecido', () => {
    const resultados = [{ id: 'a', similaridade: 0.8 }, { id: 'b', similaridade: 0.95 }]
    expect(filtrarPorSimilaridade(resultados, 0.75).map(r => r.id)).toEqual(['b', 'a'])
  })

  it('corta no limite informado', () => {
    const resultados = [
      { id: 'a', similaridade: 0.95 },
      { id: 'b', similaridade: 0.9 },
      { id: 'c', similaridade: 0.85 },
    ]
    expect(filtrarPorSimilaridade(resultados, 0.75, 2).map(r => r.id)).toEqual(['a', 'b'])
  })

  it('sem limite informado, retorna todos os que passam no limiar', () => {
    const resultados = [{ id: 'a', similaridade: 0.95 }, { id: 'b', similaridade: 0.9 }]
    expect(filtrarPorSimilaridade(resultados, 0.75).map(r => r.id)).toEqual(['a', 'b'])
  })

  it('usa o limiar padrão (LIMIAR_SIMILARIDADE) quando não informado', () => {
    const resultados = [{ id: 'a', similaridade: LIMIAR_SIMILARIDADE - 0.01 }]
    expect(filtrarPorSimilaridade(resultados)).toEqual([])
  })
})
