import { describe, it, expect } from 'vitest'
import { calcularItem, calcularTotaisGrupo, calcularTotaisGerais, calcularGrupo } from './calculos'
import type { ItemOrcamento, GrupoOrcamento } from '@/types/database'

const item: ItemOrcamento = {
  id: '1',
  grupo_id: 'g1',
  numero: 1,
  descricao: 'Limpeza',
  local: null,
  unidade_id: null,
  quantidade: 10,
  custo_unit_mao_obra: 100,
  custo_unit_material: 50,
  margem_mao_obra_pct: 20,
  margem_material_pct: 30,
  observacao: null,
  observacao_2: null,
  ordem: 1,
}

describe('calcularItem', () => {
  it('calcula subtotais de custo', () => {
    const r = calcularItem(item)
    expect(r.subtotal_mao_obra_custo).toBe(1000)
    expect(r.subtotal_material_custo).toBe(500)
    expect(r.total_custo).toBe(1500)
  })

  it('calcula preços e subtotais de venda com margem', () => {
    const r = calcularItem(item)
    expect(r.preco_unit_mao_obra_venda).toBe(120)   // 100 * 1.20
    expect(r.preco_unit_material_venda).toBe(65)    // 50 * 1.30
    expect(r.subtotal_mao_obra_venda).toBe(1200)    // 120 * 10
    expect(r.subtotal_material_venda).toBe(650)     // 65 * 10
    expect(r.total_venda).toBe(1850)
  })

  it('calcula lucro e margem efetiva', () => {
    const r = calcularItem(item)
    expect(r.lucro).toBe(350)
    expect(r.margem_efetiva_pct).toBeCloseTo(18.92, 1)  // 350/1850*100
  })

  it('margem_efetiva_pct é 0 quando total_venda é 0', () => {
    const r = calcularItem({ ...item, custo_unit_mao_obra: 0, custo_unit_material: 0 })
    expect(r.margem_efetiva_pct).toBe(0)
  })

  it('funciona com quantidade zero', () => {
    const r = calcularItem({ ...item, quantidade: 0 })
    expect(r.total_custo).toBe(0)
    expect(r.total_venda).toBe(0)
    expect(r.lucro).toBe(0)
  })
})

describe('calcularTotaisGrupo', () => {
  it('soma corretamente dois itens', () => {
    const item2: ItemOrcamento = { ...item, id: '2', custo_unit_mao_obra: 200, custo_unit_material: 100 }
    const itens = [calcularItem(item), calcularItem(item2)]
    const t = calcularTotaisGrupo(itens)
    expect(t.total_custo).toBe(1500 + 3000)
    expect(t.total_venda).toBe(1850 + 3700)
    expect(t.lucro).toBe((1850 - 1500) + (3700 - 3000))
  })

  it('retorna zeros para lista vazia', () => {
    const t = calcularTotaisGrupo([])
    expect(t.total_custo).toBe(0)
    expect(t.total_venda).toBe(0)
  })
})

describe('calcularTotaisGerais', () => {
  it('agrega totais de múltiplos grupos', () => {
    const grupo: GrupoOrcamento & { itens_orcamento: ItemOrcamento[] } = {
      id: 'g1', obra_id: 'o1', disciplina_id: 'd1', letra: 'A', ordem: 1,
      itens_orcamento: [item],
    }
    const gc = calcularGrupo(grupo)
    const t = calcularTotaisGerais([gc])
    expect(t.total_custo).toBe(1500)
    expect(t.total_venda).toBe(1850)
    expect(t.margem_efetiva_pct).toBeCloseTo(18.92, 1)
  })
})
