import { describe, it, expect } from 'vitest'
import { calcularDashboard, totalVendaObra, variacaoPct, type ObraDashboard } from './metricas'
import { intervaloDoPeriodo } from './periodo'
import type { StatusObra } from '@/types/database'

const AGORA = new Date('2026-07-04T12:00:00')
const INTERVALO_30D = intervaloDoPeriodo('30d', AGORA)

let seq = 0
function obra(over: Partial<ObraDashboard> & { status?: StatusObra } = {}): ObraDashboard {
  seq++
  return {
    id: `id-${seq}`,
    codigo: `0${seq}`,
    nome: `Obra ${seq}`,
    status: 'rascunho',
    data_orcamento: '2026-06-20',
    criado_em: '2026-06-20T10:00:00Z',
    clientes: { id: 'c1', razao_social: 'ACME' },
    usuarios: { nome: 'João' },
    grupos_orcamento: [
      {
        itens_orcamento: [
          // custo 100×10=1000; fee 1.02 → fee_unit 102; markup 1.5 MO → venda 1530
          { quantidade: 10, custo_unit_mao_obra: 100, custo_unit_material: 0, markup_mao_obra: 1.5, markup_material: 1 },
        ],
      },
    ],
    ...over,
  }
}

describe('totalVendaObra', () => {
  it('soma venda de todos os itens via calcularItem', () => {
    expect(totalVendaObra(obra())).toBe(1530)
  })
})

describe('variacaoPct', () => {
  it('calcula percentual sobre o anterior', () => {
    expect(variacaoPct(120, 100)).toBeCloseTo(20)
    expect(variacaoPct(80, 100)).toBeCloseTo(-20)
  })
  it('retorna null quando anterior é zero', () => {
    expect(variacaoPct(5, 0)).toBeNull()
  })
})

describe('calcularDashboard', () => {
  it('retorna zeros/nulls com lista vazia', () => {
    const d = calcularDashboard([], INTERVALO_30D, AGORA)
    expect(d.kpis.criados.valor).toBe(0)
    expect(d.kpis.criados.variacaoPct).toBeNull()
    expect(d.indicadores.ticketMedio).toBeNull()
    expect(d.indicadores.taxaConversao).toBeNull()
    expect(d.ultimosOrcamentos).toEqual([])
    expect(d.orcamentosPorMes).toHaveLength(12)
    expect(d.orcamentosPorMes.every(m => m.quantidade === 0)).toBe(true)
  })

  it('conta KPIs por status e exclui obras fora do período', () => {
    const d = calcularDashboard(
      [
        obra({ status: 'enviado' }),
        obra({ status: 'aprovado' }),
        obra({ status: 'em_execucao' }),
        obra({ status: 'cancelado' }),
        obra({ status: 'aprovado', data_orcamento: '2026-01-05' }), // fora dos 30d
      ],
      INTERVALO_30D,
      AGORA
    )
    expect(d.kpis.criados.valor).toBe(4)
    expect(d.kpis.emAnalise.valor).toBe(1)
    expect(d.kpis.aprovados.valor).toBe(2)   // aprovado + em_execucao
    expect(d.kpis.cancelados.valor).toBe(1)
    expect(d.kpis.valorOrcado.valor).toBe(6120)   // 4 × 1530
    expect(d.kpis.valorAprovado.valor).toBe(3060) // 2 × 1530
  })

  it('calcula variação vs período anterior e null quando base zero', () => {
    const d = calcularDashboard(
      [obra(), obra(), obra({ data_orcamento: '2026-05-20' })], // 2 no período, 1 no anterior
      INTERVALO_30D,
      AGORA
    )
    expect(d.kpis.criados.valor).toBe(2)
    expect(d.kpis.criados.variacaoPct).toBeCloseTo(100)
    // nada cancelado em nenhum período → variação null
    expect(d.kpis.cancelados.variacaoPct).toBeNull()
  })

  it('séries mensais usam o ano corrente ignorando o filtro', () => {
    const d = calcularDashboard(
      [obra({ data_orcamento: '2026-01-10' }), obra({ data_orcamento: '2026-01-15' }), obra({ data_orcamento: '2025-06-10' })],
      INTERVALO_30D,
      AGORA
    )
    expect(d.orcamentosPorMes[0]).toEqual({ mes: 'Jan', quantidade: 2 })
    expect(d.orcamentosPorMes[5].quantidade).toBe(0) // obra de 2025 fora
    expect(d.evolucaoFinanceira[0].orcado).toBe(3060)
    expect(d.evolucaoFinanceira[0].custo).toBe(2000)
  })

  it('indicadores: ticket médio, maior, conversão e margem', () => {
    const grande: ObraDashboard['grupos_orcamento'] = [
      { itens_orcamento: [{ quantidade: 10, custo_unit_mao_obra: 200, custo_unit_material: 0, markup_mao_obra: 1.5, markup_material: 1 }] },
    ]
    const d = calcularDashboard(
      [obra({ status: 'enviado' }), obra({ status: 'aprovado', grupos_orcamento: grande })],
      INTERVALO_30D,
      AGORA
    )
    expect(d.indicadores.ticketMedio).toBe(2295)      // (1530+3060)/2
    expect(d.indicadores.maiorOrcamento).toBe(3060)
    expect(d.indicadores.taxaConversao).toBeCloseTo(50) // 1 aprovado / (1 enviado + 1 aprovado)
    expect(d.indicadores.margemMedia).toBeCloseTo(100 * 1590 / 4590) // Σlucro/Σvenda
  })

  it('tabela ordenada por data desc e top clientes por valor', () => {
    const d = calcularDashboard(
      [
        obra({ data_orcamento: '2026-06-10', clientes: { id: 'c1', razao_social: 'ACME' } }),
        obra({ data_orcamento: '2026-06-25', clientes: { id: 'c2', razao_social: 'Beta' } }),
        obra({ data_orcamento: '2026-06-20', clientes: { id: 'c2', razao_social: 'Beta' } }),
        obra({ data_orcamento: '2026-06-15', clientes: null }),
      ],
      INTERVALO_30D,
      AGORA
    )
    expect(d.ultimosOrcamentos[0].data).toBe('2026-06-25')
    expect(d.ultimosOrcamentos.map(l => l.data)).toEqual(['2026-06-25', '2026-06-20', '2026-06-15', '2026-06-10'])
    expect(d.ultimosOrcamentos[2].cliente).toBe('—')
    expect(d.topClientes[0]).toEqual({ nome: 'Beta', obras: 2, valor: 3060 })
    expect(d.topClientes[1]).toEqual({ nome: 'ACME', obras: 1, valor: 1530 })
  })

  it('statusDistribuicao só inclui status presentes no período', () => {
    const d = calcularDashboard([obra({ status: 'enviado' }), obra({ status: 'enviado' })], INTERVALO_30D, AGORA)
    expect(d.statusDistribuicao).toEqual([{ status: 'enviado', label: 'Enviado', quantidade: 2 }])
  })
})
