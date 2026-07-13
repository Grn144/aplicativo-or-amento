import { describe, it, expect } from 'vitest'
import { parseComposicoesExcel } from './parse-excel'

const HEADER_COMPOSICOES = [
  'Código', 'Nome', 'Disciplina', 'Descrição Técnica', 'Unidade',
  'Produtividade', 'Markup Sugerido', 'Observações', 'Tags',
]
const HEADER_ITENS = [
  'Código Composição', 'Tipo', 'Descrição', 'Quantidade', 'Unidade', 'Fornecedor', 'Valor Unitário',
]

describe('parseComposicoesExcel', () => {
  it('parseia uma composição válida com materiais e mão de obra', () => {
    const linhasComposicoes = [
      HEADER_COMPOSICOES,
      ['COMP-01', 'Alvenaria de bloco', 'Alvenaria', 'Execução de alvenaria de blocos', 'M2', '8 h/m2', 1.3, 'obs 1', 'estrutura, alvenaria'],
    ]
    const linhasItens = [
      HEADER_ITENS,
      ['COMP-01', 'Material', 'Bloco cerâmico', 12, 'UN', 'Fornecedor X', 2.5],
      ['COMP-01', 'Mão de obra', 'Pedreiro', 4, '', '', 35],
    ]

    const resultado = parseComposicoesExcel(linhasComposicoes, linhasItens)

    expect(resultado.erros).toEqual([])
    expect(resultado.composicoes).toEqual([{
      linha: 2,
      codigo: 'COMP-01',
      nome: 'Alvenaria de bloco',
      disciplina: 'Alvenaria',
      descricao_tecnica: 'Execução de alvenaria de blocos',
      unidade: 'M2',
      produtividade: '8 h/m2',
      markup_sugerido: 1.3,
      observacoes: 'obs 1',
      tags: ['estrutura', 'alvenaria'],
      itens: [
        { tipo: 'material', descricao: 'Bloco cerâmico', quantidade: 12, unidade: 'UN', fornecedor: 'Fornecedor X', valor_unitario: 2.5 },
        { tipo: 'mao_obra', descricao: 'Pedreiro', quantidade: 4, unidade: null, fornecedor: null, valor_unitario: 35 },
      ],
    }])
  })

  it('markup sugerido vazio vira 1 (mesmo default do cadastro manual)', () => {
    const linhasComposicoes = [
      HEADER_COMPOSICOES,
      ['COMP-01', 'Nome', 'Disc', 'Descrição', 'UN', '', '', '', ''],
    ]
    const linhasItens = [
      HEADER_ITENS,
      ['COMP-01', 'Material', 'Item', 1, 'UN', '', 10],
    ]

    const resultado = parseComposicoesExcel(linhasComposicoes, linhasItens)
    expect(resultado.composicoes[0].markup_sugerido).toBe(1)
  })

  it('composição sem nenhum item é erro', () => {
    const linhasComposicoes = [
      HEADER_COMPOSICOES,
      ['COMP-01', 'Nome', 'Disc', 'Descrição', 'UN', '', 1, '', ''],
    ]
    const linhasItens = [HEADER_ITENS]

    const resultado = parseComposicoesExcel(linhasComposicoes, linhasItens)

    expect(resultado.composicoes).toEqual([])
    expect(resultado.erros).toEqual([
      { linha: 2, codigo: 'COMP-01', motivo: 'A composição precisa ter ao menos um material ou item de mão de obra' },
    ])
  })

  it('código repetido na mesma planilha é erro em ambas as ocorrências', () => {
    const linhasComposicoes = [
      HEADER_COMPOSICOES,
      ['COMP-01', 'Nome A', 'Disc', 'Descrição A', 'UN', '', 1, '', ''],
      ['COMP-01', 'Nome B', 'Disc', 'Descrição B', 'UN', '', 1, '', ''],
    ]
    const linhasItens = [
      HEADER_ITENS,
      ['COMP-01', 'Material', 'Item', 1, 'UN', '', 10],
    ]

    const resultado = parseComposicoesExcel(linhasComposicoes, linhasItens)

    expect(resultado.composicoes).toEqual([])
    expect(resultado.erros).toEqual([
      { linha: 2, codigo: 'COMP-01', motivo: 'Código duplicado nesta planilha' },
      { linha: 3, codigo: 'COMP-01', motivo: 'Código duplicado nesta planilha' },
    ])
  })

  it('linha de item com Tipo não reconhecido invalida a composição e reporta erro', () => {
    const linhasComposicoes = [
      HEADER_COMPOSICOES,
      ['COMP-01', 'Nome', 'Disc', 'Descrição', 'UN', '', 1, '', ''],
    ]
    const linhasItens = [
      HEADER_ITENS,
      ['COMP-01', 'Equipamento', 'Item', 1, 'UN', '', 10],
    ]

    const resultado = parseComposicoesExcel(linhasComposicoes, linhasItens)

    expect(resultado.composicoes).toEqual([])
    expect(resultado.erros).toEqual([
      { linha: 2, codigo: 'COMP-01', motivo: 'Tipo não reconhecido: "Equipamento"' },
    ])
  })

  it('código, nome ou descrição técnica ausentes são erro', () => {
    const linhasComposicoes = [
      HEADER_COMPOSICOES,
      ['', 'Nome', 'Disc', 'Descrição', 'UN', '', 1, '', ''],
      ['COMP-02', '', 'Disc', 'Descrição', 'UN', '', 1, '', ''],
    ]
    const linhasItens = [HEADER_ITENS]

    const resultado = parseComposicoesExcel(linhasComposicoes, linhasItens)

    expect(resultado.composicoes).toEqual([])
    expect(resultado.erros).toEqual([
      { linha: 2, codigo: null, motivo: 'Código é obrigatório' },
      { linha: 3, codigo: 'COMP-02', motivo: 'Nome e descrição técnica são obrigatórios' },
    ])
  })
})
