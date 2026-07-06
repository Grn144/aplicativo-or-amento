import { describe, it, expect } from 'vitest'
import { parsePlanilhaObra } from './parse-obra'

// Reproduz o layout do export técnico: título, cliente, vazio, cabeçalho,
// linhas de disciplina (Nº vazio) e linhas de item (Nº numérico), total.
const planilhaTecnica = [
  ['ORÇAMENTO TÉCNICO — 08114 — UNILEVER'],
  ['Cliente: ACME'],
  [],
  ['Item', 'Nº', 'Descrição', 'Local', 'UN', 'QT', 'Custo MO', 'Custo Mat.', 'Total Custo', 'Mg. MO%', 'Mg. Mat%', 'Total Venda', 'Lucro', 'Mg. Ef%'],
  ['A', '', 'CIVIL'],
  ['A', 1, 'Parede', '3º andar', 'M2', 10, 100, 50, 750, 20, 10, 900, 150, 16.67],
  ['A', 2, 'Piso', '', 'M2', 5, 80, 40, 600, 20, 10, 720, 120, 16.67],
  ['B', '', 'ELÉTRICA'],
  ['B', 1, 'Ponto de luz', '', 'PTOS', 8, 30, 20, 400, 15, 15, 460, 60, 13.04],
  [],
  ['', '', '', '', '', '', '', 'TOTAL GERAL', 1750, '', '', 2080, 330, 15.87],
]

describe('parsePlanilhaObra', () => {
  it('separa disciplinas e itens do formato de export', () => {
    const r = parsePlanilhaObra(planilhaTecnica)
    expect(r).toHaveLength(2)
    expect(r[0].disciplina).toBe('CIVIL')
    expect(r[0].itens).toHaveLength(2)
    expect(r[1].disciplina).toBe('ELÉTRICA')
    expect(r[1].itens).toHaveLength(1)
  })

  it('lê os campos do item corretamente', () => {
    const item = parsePlanilhaObra(planilhaTecnica)[0].itens[0]
    expect(item).toMatchObject({
      descricao: 'Parede',
      local: '3º andar',
      unidade: 'M2',
      quantidade: 10,
      custo_unit_mao_obra: 100,
      custo_unit_material: 50,
      margem_mao_obra_pct: 20,
      margem_material_pct: 10,
    })
  })

  it('ignora a linha de TOTAL GERAL', () => {
    const r = parsePlanilhaObra(planilhaTecnica)
    const descricoes = r.flatMap(d => d.itens.map(i => i.descricao))
    expect(descricoes).not.toContain('')
    expect(r.flatMap(d => d.itens)).toHaveLength(3)
  })

  it('coloca itens órfãos (sem disciplina antes) em GERAL', () => {
    const semGrupo = [
      ['Descrição', 'Nº', 'QT', 'Custo MO'],
      ['Item solto', 1, 3, 50],
    ]
    // header aqui: Descrição col0, Nº col1, QT col2 — item tem Nº → item órfão
    const r = parsePlanilhaObra(semGrupo)
    expect(r).toHaveLength(1)
    expect(r[0].disciplina).toBe('GERAL')
    expect(r[0].itens[0].descricao).toBe('Item solto')
  })

  it('retorna vazio quando não há coluna de descrição reconhecível', () => {
    expect(parsePlanilhaObra([['xxx', 'yyy'], ['a', 'b']])).toEqual([])
  })

  it('numero com vírgula decimal é lido corretamente', () => {
    const p = [
      ['Item', 'Nº', 'Descrição', 'QT', 'Custo MO'],
      ['A', '', 'CIVIL'],
      ['A', 1, 'Parede', '2,5', '100,50'],
    ]
    const item = parsePlanilhaObra(p)[0].itens[0]
    expect(item.quantidade).toBeCloseTo(2.5)
    expect(item.custo_unit_mao_obra).toBeCloseTo(100.5)
  })
})
