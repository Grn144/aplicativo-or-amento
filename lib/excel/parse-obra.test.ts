import { describe, it, expect } from 'vitest'
import { parsePlanilhaObra, parseCabecalhoObra, resolverCelula, type Celula } from './parse-obra'

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

describe('parsePlanilhaObra (round-trip com o layout gerado pelo export técnico)', () => {
  it('linha de disciplina com letra na coluna 0 e nome na coluna 2 (DESCRIÇÃO) não vira "GERAL"', () => {
    // Layout que o export técnico gera para a linha de grupo/disciplina:
    // coluna 0 = letra do grupo, coluna 1 (Nº) = vazia, coluna 2 (DESCRIÇÃO) = nome em maiúsculas.
    const grupoExport = ['A', '', 'CIVIL']
    const itemExport = ['A', 1, 'PROTEÇÃO', 'CIVIL', 'GERAL', 'VB', 1, 200, 100, 200, 100, 300, 204, 510, 102, 204]
    const r = parsePlanilhaObra([...cab, header, grupoExport, itemExport])
    expect(r).toHaveLength(1)
    expect(r[0].disciplina).toBe('CIVIL')
    expect(r[0].disciplina).not.toBe('GERAL')
    expect(r[0].itens).toHaveLength(1)
    expect(r[0].itens[0].descricao).toBe('PROTEÇÃO')
  })
})

describe('parsePlanilhaObra — cabeçalho em DUAS linhas (planilha real da empresa)', () => {
  it('acha FEE/$ na linha acima do cabeçalho principal e deriva markup', () => {
    // Rótulos FEE/$ ficam nas colunas 12-15 de uma linha ACIMA do cabeçalho principal.
    const linhaFeeLabels: Celula[] = []
    linhaFeeLabels[12] = 'FEE M.OBRA'
    linhaFeeLabels[13] = '$ M.OBRA'
    linhaFeeLabels[14] = 'FEE MAT'
    linhaFeeLabels[15] = '$ MAT'
    // Cabeçalho principal SEM as colunas de fee/$ (elas estão na linha acima)
    const headerPrincipal: Celula[] = ['ITEM','Nº','DESCRIÇÃO','DISCIPLINA','LOCAL','UN.','QT.','M. OBRA','MAT','M. OBRA','MAT','TOTAL']
    const disc: Celula[] = ['A','','CIVIL']
    // custo 200/100 (cols 7/8); FEE/$ (cols 12-15) = 204/510/102/204
    const it: Celula[] = ['A',1,'PAREDE','CIVIL','GERAL','M2',35,200,100,200,100,300]
    it[12] = 204; it[13] = 510; it[14] = 102; it[15] = 204

    const r = parsePlanilhaObra([...cab, linhaFeeLabels, headerPrincipal, disc, it])
    expect(r).toHaveLength(1)
    expect(r[0].disciplina).toBe('CIVIL')
    const item0 = r[0].itens[0]
    expect(item0.custo_unit_mao_obra).toBe(200)
    expect(item0.markup_mao_obra).toBeCloseTo(2.5)  // 510/204
    expect(item0.markup_material).toBeCloseTo(2)     // 204/102
  })
})

describe('resolverCelula (célula de fórmula do exceljs)', () => {
  it('extrai o resultado de uma célula de fórmula', () => {
    expect(resolverCelula({ formula: 'H10*1.02', result: 204 })).toBe(204)
  })
  it('extrai o texto de richText', () => {
    expect(resolverCelula({ richText: [{ text: 'MAGA' }, { text: 'LU' }] })).toBe('MAGALU')
  })
  it('deixa valores primitivos intactos', () => {
    expect(resolverCelula(200)).toBe(200)
    expect(resolverCelula('CIVIL')).toBe('CIVIL')
    expect(resolverCelula(null)).toBe(null)
    expect(resolverCelula(undefined)).toBe(undefined)
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
