import { describe, it, expect } from 'vitest'
import { parsePlanilhaObra, parseCabecalhoObra } from './parse-obra'

// Layout real (colunas do bloco custo/fee): ITEM Nº DESCRIÇÃO DISCIPLINA LOCAL UN. QT.
// M.OBRA MAT SUBTOT-MO SUBTOT-MAT TOTAL FEE-M.OBRA $-M.OBRA FEE-MAT $-MAT ...
const cab = [
  ['', '', 'DESCRITIVO TÉCNICO E COMERCIAL'],
  ['', '', 'MAGALU - PAULISTA'],
  ['', '', 'ENDEREÇO: ALAMEDA SANTOS, 2153'],
  ['', '', 'CNPJ: 12.345.678/0001-00'],
  ['', '', '08092.01 MAGALU - DEPOSITO'],
]
const header = ['ITEM','Nº','DESCRIÇÃO','DISCIPLINA','LOCAL','UN.','QT.','M. OBRA','MAT','SUB TOTAL','SUB TOTAL','TOTAL','FEE M.OBRA','$ M.OBRA','FEE MAT','$ MAT']
const grupo = ['A','','SERVIÇOS PRELIMINÁRES']
// custo MO=200 MAT=100 fee=1.02 → fee-mo=204 $mo=510 (markup 2.5); fee-mat=102 $mat=204 (markup 2)
const item = ['A',1,'PROTEÇÃO','SERVIÇOS PRELIMINÁRES','GERAL','VB',1, 200,100, 200,100,300, 204,510, 102,204]

describe('parsePlanilhaObra (formato real, deriva markup)', () => {
  it('lê custo e deriva markup de $ ÷ FEE', () => {
    const r = parsePlanilhaObra([...cab, header, grupo, item])
    expect(r).toHaveLength(1)
    expect(r[0].disciplina).toBe('SERVIÇOS PRELIMINÁRES')
    const it = r[0].itens[0]
    expect(it.custo_unit_mao_obra).toBe(200)
    expect(it.custo_unit_material).toBe(100)
    expect(it.markup_mao_obra).toBeCloseTo(2.5)   // 510/204
    expect(it.markup_material).toBeCloseTo(2)      // 204/102
  })

  it('markup = 1 quando FEE é zero/ausente', () => {
    const item0 = ['A',1,'X','D','L','UN',1, 0,0, 0,0,0, 0,0, 0,0]
    const r = parsePlanilhaObra([...cab, header, grupo, item0])
    expect(r[0].itens[0].markup_mao_obra).toBe(1)
    expect(r[0].itens[0].markup_material).toBe(1)
  })
})

describe('parseCabecalhoObra (formato real)', () => {
  it('extrai codigo, nome, cliente, endereco e cnpj', () => {
    expect(parseCabecalhoObra([...cab, header])).toEqual({
      codigo: '08092.01',
      nome: 'MAGALU - DEPOSITO',
      cliente: 'MAGALU - PAULISTA',
      endereco: 'ALAMEDA SANTOS, 2153',
      cnpj: '12.345.678/0001-00',
    })
  })
})
