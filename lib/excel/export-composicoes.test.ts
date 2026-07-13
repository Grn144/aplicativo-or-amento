import { describe, it, expect } from 'vitest'
import { montarPlanilhaComposicoes, type ComposicaoParaExportar } from './export-composicoes'

const composicoes: ComposicaoParaExportar[] = [{
  codigo: 'COMP-01',
  nome: 'Alvenaria de bloco',
  disciplina_nome: 'Alvenaria',
  descricao_tecnica: 'Execução de alvenaria de blocos',
  unidade_sigla: 'M2',
  produtividade: '8 h/m2',
  markup_sugerido: 1.3,
  observacoes: 'obs 1',
  tags: ['estrutura', 'alvenaria'],
  materiais: [
    { descricao: 'Bloco cerâmico', quantidade: 12, unidade_sigla: 'UN', fornecedor: 'Fornecedor X', preco_unitario: 2.5 },
  ],
  mao_obra: [
    { cargo: 'Pedreiro', horas: 4, custo_hora: 35 },
  ],
}]

describe('montarPlanilhaComposicoes', () => {
  it('cria as duas abas com os nomes esperados', () => {
    const wb = montarPlanilhaComposicoes(composicoes)
    expect(wb.worksheets.map(ws => ws.name)).toEqual(['Composições', 'Itens'])
  })

  it('aba Composições: cabeçalho e uma linha por composição', () => {
    const wb = montarPlanilhaComposicoes(composicoes)
    const ws = wb.getWorksheet('Composições')!
    expect(ws.getRow(1).values).toEqual([
      undefined, 'Código', 'Nome', 'Disciplina', 'Descrição Técnica', 'Unidade',
      'Produtividade', 'Markup Sugerido', 'Observações', 'Tags',
    ])
    expect(ws.getRow(2).values).toEqual([
      undefined, 'COMP-01', 'Alvenaria de bloco', 'Alvenaria', 'Execução de alvenaria de blocos',
      'M2', '8 h/m2', 1.3, 'obs 1', 'estrutura, alvenaria',
    ])
  })

  it('aba Itens: cabeçalho e uma linha por material/mão de obra', () => {
    const wb = montarPlanilhaComposicoes(composicoes)
    const ws = wb.getWorksheet('Itens')!
    expect(ws.getRow(1).values).toEqual([
      undefined, 'Código Composição', 'Tipo', 'Descrição', 'Quantidade', 'Unidade', 'Fornecedor', 'Valor Unitário',
    ])
    expect(ws.getRow(2).values).toEqual([
      undefined, 'COMP-01', 'Material', 'Bloco cerâmico', 12, 'UN', 'Fornecedor X', 2.5,
    ])
    expect(ws.getRow(3).values).toEqual([
      undefined, 'COMP-01', 'Mão de obra', 'Pedreiro', 4, '', '', 35,
    ])
  })

  it('composição sem disciplina/unidade/produtividade/observações/tags usa vazio', () => {
    const semOpcionais: ComposicaoParaExportar[] = [{
      codigo: 'COMP-02', nome: 'Nome', disciplina_nome: null, descricao_tecnica: 'Descrição',
      unidade_sigla: null, produtividade: null, markup_sugerido: 1, observacoes: null, tags: [],
      materiais: [], mao_obra: [],
    }]
    const wb = montarPlanilhaComposicoes(semOpcionais)
    const ws = wb.getWorksheet('Composições')!
    expect(ws.getRow(2).values).toEqual([
      undefined, 'COMP-02', 'Nome', '', 'Descrição', '', '', 1, '', '',
    ])
  })
})
