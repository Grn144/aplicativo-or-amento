// lib/composicoes/normalizar.test.ts
import { describe, it, expect } from 'vitest'
import { normalizarMateriais, normalizarMaoObra, extrairCamposDeSnapshot } from './normalizar'

describe('normalizarMateriais', () => {
  it('aplica defaults e ordem sequencial', () => {
    const resultado = normalizarMateriais([
      { descricao: 'Cabo', quantidade: 2, unidade_id: 'un-1', fornecedor: '  Fornecedor A  ', preco_unitario: 10 },
      { descricao: 'Conector' },
    ])
    expect(resultado).toEqual([
      { descricao: 'Cabo', quantidade: 2, unidade_id: 'un-1', fornecedor: 'Fornecedor A', preco_unitario: 10, ordem: 1 },
      { descricao: 'Conector', quantidade: 0, unidade_id: null, fornecedor: null, preco_unitario: 0, ordem: 2 },
    ])
  })
})

describe('normalizarMaoObra', () => {
  it('aplica defaults e ordem sequencial', () => {
    const resultado = normalizarMaoObra([{ cargo: 'Técnico', horas: 2, custo_hora: 40 }])
    expect(resultado).toEqual([{ cargo: 'Técnico', horas: 2, custo_hora: 40, ordem: 1 }])
  })
})

describe('extrairCamposDeSnapshot', () => {
  it('extrai apenas os campos editáveis, descartando os derivados/imutáveis', () => {
    const snapshotComposicao = {
      id: 'comp-1',
      codigo: 'C1',
      nome: 'Composição X',
      disciplina_id: 'disc-1',
      descricao_tecnica: 'Descrição técnica',
      unidade_id: 'un-1',
      produtividade: '0,5 m²/h',
      custo_direto: 500,
      markup_sugerido: 1.5,
      observacoes: 'obs',
      tags: ['a', 'b'],
      versao: 3,
      ativo: true,
      responsavel_id: 'user-1',
      criado_em: '2026-01-01T00:00:00Z',
      atualizado_em: '2026-01-02T00:00:00Z',
    }
    expect(extrairCamposDeSnapshot(snapshotComposicao)).toEqual({
      codigo: 'C1',
      nome: 'Composição X',
      disciplina_id: 'disc-1',
      descricao_tecnica: 'Descrição técnica',
      unidade_id: 'un-1',
      produtividade: '0,5 m²/h',
      markup_sugerido: 1.5,
      observacoes: 'obs',
      tags: ['a', 'b'],
      ativo: true,
    })
  })

  it('preenche tags/ativo com defaults quando ausentes no snapshot', () => {
    const snapshotComposicao = {
      codigo: 'C2',
      nome: 'Composição Y',
      disciplina_id: null,
      descricao_tecnica: 'Descrição',
      unidade_id: null,
      produtividade: null,
      markup_sugerido: 1,
      observacoes: null,
      tags: undefined,
      ativo: undefined,
    }
    const campos = extrairCamposDeSnapshot(snapshotComposicao)
    expect(campos.tags).toEqual([])
    expect(campos.ativo).toBe(true)
  })
})
