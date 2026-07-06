import { describe, it, expect } from 'vitest'
import { calcularItem, calcularRentabilidade, calcularGrupo } from './calculos'
import type { ItemOrcamento } from '@/types/database'

function item(over: Partial<ItemOrcamento> = {}): ItemOrcamento {
  return {
    id: '', grupo_id: '', numero: 1, descricao: '', local: null,
    unidade_id: null, observacao: null, observacao_2: null, ordem: 1,
    quantidade: 1, custo_unit_mao_obra: 0, custo_unit_material: 0,
    markup_mao_obra: 1, markup_material: 1, ...over,
  }
}

describe('calcularItem (modelo FEE + markup)', () => {
  it('reproduz o item da planilha: custo 200/100, markup 2.5/2.0, fee 1.02', () => {
    const c = calcularItem(item({
      quantidade: 1, custo_unit_mao_obra: 200, custo_unit_material: 100,
      markup_mao_obra: 2.5, markup_material: 2,
    }), 1.02)
    expect(c.fee_unit_mao_obra).toBeCloseTo(204)
    expect(c.fee_unit_material).toBeCloseTo(102)
    expect(c.preco_unit_mao_obra_venda).toBeCloseTo(510)
    expect(c.preco_unit_material_venda).toBeCloseTo(204)
    expect(c.total_custo).toBeCloseTo(300)
    expect(c.total_venda).toBeCloseTo(714)
    expect(c.lucro).toBeCloseTo(414)
  })

  it('reproduz item com markup fracionário: custo 25/18 qt 87, markup 1.65/1.45', () => {
    const c = calcularItem(item({
      quantidade: 87, custo_unit_mao_obra: 25, custo_unit_material: 18,
      markup_mao_obra: 1.65, markup_material: 1.45,
    }), 1.02)
    expect(c.preco_unit_mao_obra_venda).toBeCloseTo(42.075)
    expect(c.preco_unit_material_venda).toBeCloseTo(26.622)
    expect(c.subtotal_mao_obra_venda).toBeCloseTo(42.075 * 87)
  })

  it('markup 1.0 → venda = custo × fee', () => {
    const c = calcularItem(item({ custo_unit_mao_obra: 100, quantidade: 1 }), 1.02)
    expect(c.preco_unit_mao_obra_venda).toBeCloseTo(102)
  })
})

describe('calcularRentabilidade', () => {
  it('comissão, imposto sobre (fat−comissão), custo com fee e líquido', () => {
    const grupo = calcularGrupo({
      id: 'g', obra_id: '', disciplina_id: '', letra: 'A', ordem: 1,
      itens_orcamento: [item({
        quantidade: 1, custo_unit_mao_obra: 200, custo_unit_material: 100,
        markup_mao_obra: 2.5, markup_material: 2,
      })],
    }, 1.02)
    const r = calcularRentabilidade([grupo], { fee_fator: 1.02, comissao_pct: 12, imposto_pct: 30 })
    expect(r.faturamento).toBeCloseTo(714)
    expect(r.custo_total).toBeCloseTo(300)
    expect(r.comissao).toBeCloseTo(714 * 0.12)             // 85.68
    expect(r.imposto).toBeCloseTo((714 - 85.68) * 0.30)    // 188.496
    expect(r.custo_com_fee).toBeCloseTo(300 * 1.02)        // 306
    expect(r.liquido).toBeCloseTo(714 - 85.68 - 188.496 - 306)
    expect(r.liquido_pct).toBeCloseTo(r.liquido / 714 * 100)
  })

  it('faturamento zero → liquido_pct null', () => {
    const r = calcularRentabilidade([], { fee_fator: 1.02, comissao_pct: 12, imposto_pct: 30 })
    expect(r.faturamento).toBe(0)
    expect(r.liquido_pct).toBeNull()
  })
})
