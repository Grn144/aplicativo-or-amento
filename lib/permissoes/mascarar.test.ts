// lib/permissoes/mascarar.test.ts
import { describe, it, expect } from 'vitest'
import { mascararCamposFinanceiros } from './mascarar'

function permissoes(...concedidas: string[]) {
  return new Set(concedidas) as Set<import('./matriz').Permissao>
}

describe('mascararCamposFinanceiros', () => {
  it('sem visualizar_custos, remove campos de custo mas mantém o resto', () => {
    const obra = { codigo: 'OB-1', custo_unit_mao_obra: 100, custo_unit_material: 50, quantidade: 2 }
    const resultado = mascararCamposFinanceiros(obra, permissoes())
    expect(resultado).toEqual({ codigo: 'OB-1', quantidade: 2 })
  })

  it('com visualizar_custos, mantém os campos de custo', () => {
    const obra = { custo_unit_mao_obra: 100, custo_unit_material: 50 }
    const resultado = mascararCamposFinanceiros(obra, permissoes('visualizar_custos'))
    expect(resultado).toEqual({ custo_unit_mao_obra: 100, custo_unit_material: 50 })
  })

  it('sem visualizar_margem, remove markup e percentuais de margem', () => {
    const item = { markup_mao_obra: 1.3, markup_material: 1.2, margem_efetiva_pct: 0.25, descricao: 'Item' }
    const resultado = mascararCamposFinanceiros(item, permissoes('visualizar_custos'))
    expect(resultado).toEqual({ descricao: 'Item' })
  })

  it('sem visualizar_lucro, remove o campo lucro', () => {
    const resumo = { lucro: 1000, total_custo: 500 }
    const resultado = mascararCamposFinanceiros(resumo, permissoes('visualizar_custos', 'visualizar_margem'))
    expect(resultado).toEqual({ total_custo: 500 })
  })

  it('com todas as permissões financeiras, não remove nada', () => {
    const dados = { custo_unit_mao_obra: 1, markup_mao_obra: 1.1, lucro: 10 }
    const resultado = mascararCamposFinanceiros(
      dados,
      permissoes('visualizar_custos', 'visualizar_margem', 'visualizar_lucro')
    )
    expect(resultado).toEqual(dados)
  })

  it('mascara recursivamente em estruturas aninhadas (obra → grupos → itens) e em arrays', () => {
    const obras = [
      {
        codigo: 'OB-1',
        grupos_orcamento: [
          {
            letra: 'A',
            itens_orcamento: [
              { descricao: 'Item 1', custo_unit_mao_obra: 10, lucro: 5 },
              { descricao: 'Item 2', custo_unit_material: 20, lucro: 3 },
            ],
          },
        ],
      },
    ]
    const resultado = mascararCamposFinanceiros(obras, permissoes())
    expect(resultado).toEqual([
      {
        codigo: 'OB-1',
        grupos_orcamento: [
          {
            letra: 'A',
            itens_orcamento: [{ descricao: 'Item 1' }, { descricao: 'Item 2' }],
          },
        ],
      },
    ])
  })
})
