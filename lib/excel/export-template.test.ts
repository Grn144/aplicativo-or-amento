import { describe, it, expect } from 'vitest'
import { montarPlanilhaDescritivo, type GrupoComItens, type ObraCabecalho, type FatoresObra } from './export-template'

const obra: ObraCabecalho = {
  codigo: '07982',
  nome: 'TESTE',
  cliente: { razao_social: 'CLIENTE LTDA', endereco: 'RUA X, 1', cnpj: '00.000.000/0001-00' },
}
const fatores: FatoresObra = { fee_fator: 1.02, comissao_valor: 500, imposto_valor: 1200 }
const grupos: GrupoComItens[] = [{
  letra: 'A', ordem: 1, disciplina_nome: 'Pré-obra',
  itens: [
    { numero: 1, descricao: 'Item 1', local: 'ELEVADORES', unidade_sigla: 'VB', quantidade: 1,
      custo_unit_mao_obra: 350, custo_unit_material: 700, markup_mao_obra: 1.7, markup_material: 1.7,
      fee_mao_obra: null, fee_material: null },
    { numero: 2, descricao: 'Item 2', local: 'GERAL', unidade_sigla: 'UNID', quantidade: 1,
      custo_unit_mao_obra: 0, custo_unit_material: 9800, markup_mao_obra: 1.7, markup_material: 1.7,
      fee_mao_obra: 1, fee_material: null },
  ],
}]

function build() {
  const wb = montarPlanilhaDescritivo(obra, grupos, fatores)
  return wb.worksheets[0]
}

describe('montarPlanilhaDescritivo — cabeçalho e estrutura (28 colunas)', () => {
  it('cabeçalho da empresa nas linhas 1-5', () => {
    const ws = build()
    expect(ws.getCell('C1').value).toBe('DESCRITIVO TÉCNICO E COMERCIAL')
    expect(ws.getCell('C2').value).toBe('CLIENTE LTDA')
    expect(ws.getCell('C3').value).toBe('ENDEREÇO: RUA X, 1')
    expect(ws.getCell('C4').value).toBe('CNPJ: 00.000.000/0001-00')
    expect(ws.getCell('C5').value).toBe('07982 TESTE')
  })

  it('títulos de bloco na linha 7 (com mesclagens)', () => {
    const ws = build()
    expect(ws.getCell('J7').value).toBe('PREÇOS UNITÁRIOS')
    expect(ws.getCell('L7').value).toBe('SUB TOTAL')
    expect(ws.getCell('N7').value).toBe('TOTAL')
    expect(ws.getCell('O7').value).toBe('FEE M.OBRA')
    expect(ws.getCell('P7').value).toBe('$ M.OBRA')
    expect(ws.getCell('Q7').value).toBe('FEE MAT')
    expect(ws.getCell('R7').value).toBe('$ MAT')
    expect(ws.getCell('U7').value).toBe('PREÇOS UNITÁRIOS')
    expect(ws.getCell('W7').value).toBe('SUB TOTAL')
    expect(ws.getCell('Y7').value).toBe('TOTAL')
  })

  it('cabeçalhos de coluna na linha 8 (todas as 28 colunas relevantes)', () => {
    const ws = build()
    const esperado: Record<string, string> = {
      A8: 'ITEM', B8: 'Nº', C8: 'DESCRIÇÃO', D8: 'DISCIPLINA', E8: 'CATEGORIA', F8: 'FRENTE',
      G8: 'LOCAL', H8: 'UN.', I8: 'QT.', J8: 'M. OBRA', K8: 'MAT', L8: 'M. OBRA', M8: 'MAT',
      N8: 'TOTAL', S8: 'UN.', T8: 'QT.', U8: 'M. OBRA', V8: 'MATERIAL', W8: 'M. OBRA',
      X8: 'MATERIAL', Y8: 'TOTAL',
    }
    for (const [cel, val] of Object.entries(esperado)) expect(ws.getCell(cel).value).toBe(val)
  })

  it('bloco de rentabilidade AA/AB', () => {
    const ws = build()
    expect(ws.getCell('AA6').value).toBe('líq')
    expect(ws.getCell('AB6').value).toBe('líq%')
    expect((ws.getCell('AA7').value as { formula: string }).formula).toBe('Y6-AA8-AA9-AA10')
    expect((ws.getCell('AB7').value as { formula: string }).formula).toBe('AA7/Y6')
    expect(ws.getCell('AA8').value).toBe(500)
    expect(ws.getCell('AB8').value).toBe('comissao')
    expect(ws.getCell('AA9').value).toBe(1200)
    expect(ws.getCell('AB9').value).toBe('imposto')
    expect((ws.getCell('AA10').value as { formula: string }).formula).toBe('N6*1.02')
    expect(ws.getCell('AB10').value).toBe('custo')
  })

  it('totais na linha 6 (=SUM/2)', () => {
    const ws = build()
    for (const col of ['L', 'M', 'N', 'W', 'X', 'Y']) {
      const f = (ws.getCell(`${col}6`).value as { formula: string }).formula
      expect(f).toMatch(new RegExp(`^SUM\\(${col}9:${col}\\d+\\)/2$`))
    }
  })
})

describe('montarPlanilhaDescritivo — linha de item (fórmulas)', () => {
  it('primeiro item (linha 10): fórmulas de custo, FEE, venda', () => {
    const ws = build()
    // grupo A ocupa linha 9; itens em 10 e 11
    expect(ws.getCell('A10').value).toBe('A')
    expect(ws.getCell('B10').value).toBe(1)
    expect(ws.getCell('E10').value).toBe('-')
    expect(ws.getCell('F10').value).toBe('-')
    expect(ws.getCell('J10').value).toBe(350)
    expect(ws.getCell('K10').value).toBe(700)
    expect((ws.getCell('L10').value as { formula: string }).formula).toBe('J10*I10')
    expect((ws.getCell('M10').value as { formula: string }).formula).toBe('K10*I10')
    expect((ws.getCell('N10').value as { formula: string }).formula).toBe('L10+M10')
    expect((ws.getCell('O10').value as { formula: string }).formula).toBe('J10*1.02')
    expect((ws.getCell('P10').value as { formula: string }).formula).toBe('O10*1.7')
    expect((ws.getCell('Q10').value as { formula: string }).formula).toBe('K10*1.02')
    expect((ws.getCell('R10').value as { formula: string }).formula).toBe('Q10*1.7')
    expect((ws.getCell('S10').value as { formula: string }).formula).toBe('H10')
    expect((ws.getCell('T10').value as { formula: string }).formula).toBe('I10')
    expect((ws.getCell('U10').value as { formula: string }).formula).toBe('P10')
    expect((ws.getCell('V10').value as { formula: string }).formula).toBe('R10')
    expect((ws.getCell('W10').value as { formula: string }).formula).toBe('U10*T10')
    expect((ws.getCell('X10').value as { formula: string }).formula).toBe('V10*T10')
    expect((ws.getCell('Y10').value as { formula: string }).formula).toBe('W10+X10')
  })

  it('FEE por item: item 2 tem fee_mao_obra=1 → O11=K? não, O11=J11*1', () => {
    const ws = build()
    expect((ws.getCell('O11').value as { formula: string }).formula).toBe('J11*1')
    // material do item 2 sem override → usa fee_fator 1.02
    expect((ws.getCell('Q11').value as { formula: string }).formula).toBe('K11*1.02')
  })

  it('linha de disciplina (9): subtotais por SUM e "-" nas colunas de item', () => {
    const ws = build()
    expect(ws.getCell('A9').value).toBe('A')
    expect(ws.getCell('C9').value).toBe('PRÉ-OBRA')
    expect(ws.getCell('E9').value).toBe('-')
    expect((ws.getCell('L9').value as { formula: string }).formula).toBe('SUM(L10:L11)')
    expect((ws.getCell('M9').value as { formula: string }).formula).toBe('SUM(M10:M11)')
    expect((ws.getCell('N9').value as { formula: string }).formula).toBe('L9+M9')
    expect((ws.getCell('W9').value as { formula: string }).formula).toBe('SUM(W10:W11)')
    expect((ws.getCell('X9').value as { formula: string }).formula).toBe('SUM(X10:X11)')
    expect((ws.getCell('Y9').value as { formula: string }).formula).toBe('W9+X9')
  })
})
