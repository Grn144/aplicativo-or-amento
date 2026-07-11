import { describe, it, expect } from 'vitest'
import { montarPlanilhaComercial, type GrupoComItensComercial, type ObraCabecalho } from './export-comercial'

const obra: ObraCabecalho = {
  codigo: '08114',
  nome: 'UNILEVER - WT',
  cliente: { razao_social: 'UNILEVER DO BRASIL', endereco: 'AV. X, 1', cnpj: '61.068.276/0001-04' },
}
const grupos: GrupoComItensComercial[] = [{
  letra: 'A', ordem: 1, disciplina_nome: 'Pré-obra',
  itens: [
    { numero: 1, descricao: 'Demolição de forro', disciplina_nome: 'Pré-obra', local: '4B - SALA HC', unidade_sigla: 'M2',
      quantidade: 23, preco_unit_mao_obra_venda: 90.678, preco_unit_material_venda: 0,
      observacao: 'EXECUTADO', observacao_2: 'ABSORVER' },
    { numero: 2, descricao: 'Demolição de forro', disciplina_nome: 'Pré-obra', local: '4B - SALA CONFORT', unidade_sigla: 'M2',
      quantidade: 16, preco_unit_mao_obra_venda: 90.678, preco_unit_material_venda: 0,
      observacao: 'EXECUTADO', observacao_2: null },
  ],
}]

function build() {
  return montarPlanilhaComercial(obra, grupos).worksheets[0]
}

describe('montarPlanilhaComercial — estrutura (14 colunas)', () => {
  it('cabeçalho da empresa nas linhas 1-5', () => {
    const ws = build()
    expect(ws.getCell('C1').value).toBe('DESCRITIVO TÉCNICO E COMERCIAL')
    expect(ws.getCell('C2').value).toBe('UNILEVER DO BRASIL')
    expect(ws.getCell('C3').value).toBe('ENDEREÇO: AV. X, 1')
    expect(ws.getCell('C4').value).toBe('CNPJ: 61.068.276/0001-04')
    expect(ws.getCell('C5').value).toBe('08114 UNILEVER - WT')
  })

  it('títulos de bloco na linha 7', () => {
    const ws = build()
    expect(ws.getCell('H7').value).toBe('PREÇOS UNITÁRIOS')
    expect(ws.getCell('J7').value).toBe('SUB TOTAL')
    expect(ws.getCell('L7').value).toBe('TOTAL')
  })

  it('cabeçalhos de coluna na linha 8', () => {
    const ws = build()
    const esperado: Record<string, string> = {
      A8: 'ITEM', B8: 'Nº', C8: 'DESCRIÇÃO', D8: 'DISCIPLINA', E8: 'LOCAL', F8: 'UN.', G8: 'QT.',
      H8: 'M. OBRA', I8: 'MATERIAL', J8: 'M. OBRA', K8: 'MATERIAL', L8: 'TOTAL', M8: 'OBS.', N8: 'OBS.',
    }
    for (const [cel, val] of Object.entries(esperado)) expect(ws.getCell(cel).value).toBe(val)
  })

  it('totais na linha 6 (=SUM/2)', () => {
    const ws = build()
    for (const col of ['J', 'K', 'L']) {
      const f = (ws.getCell(`${col}6`).value as { formula: string }).formula
      expect(f).toMatch(new RegExp(`^SUM\\(${col}9:${col}\\d+\\)/2$`))
    }
  })
})

describe('montarPlanilhaComercial — linha de item (venda + fórmulas)', () => {
  it('primeiro item (linha 10): H/I = venda, J/K/L = fórmulas', () => {
    const ws = build()
    expect(ws.getCell('A10').value).toBe('A')
    expect(ws.getCell('B10').value).toBe(1)
    expect(ws.getCell('D10').value).toBe('Pré-obra')
    expect(ws.getCell('E10').value).toBe('4B - SALA HC')
    expect(ws.getCell('F10').value).toBe('M2')
    expect(ws.getCell('G10').value).toBe(23)
    expect(ws.getCell('H10').value).toBe(90.678) // venda M.OBRA, não custo
    expect(ws.getCell('I10').value).toBe(0)      // venda material
    expect((ws.getCell('J10').value as { formula: string }).formula).toBe('H10*G10')
    expect((ws.getCell('K10').value as { formula: string }).formula).toBe('I10*G10')
    expect((ws.getCell('L10').value as { formula: string }).formula).toBe('J10+K10')
    expect(ws.getCell('M10').value).toBe('EXECUTADO')
    expect(ws.getCell('N10').value).toBe('ABSORVER')
  })

  it('linha de disciplina (9): SUM nos subtotais e "-" nas colunas de item', () => {
    const ws = build()
    expect(ws.getCell('A9').value).toBe('A')
    expect(ws.getCell('C9').value).toBe('PRÉ-OBRA')
    expect(ws.getCell('E9').value).toBe('-')
    expect(ws.getCell('H9').value).toBe('-')
    expect((ws.getCell('J9').value as { formula: string }).formula).toBe('SUM(J10:J11)')
    expect((ws.getCell('K9').value as { formula: string }).formula).toBe('SUM(K10:K11)')
    expect((ws.getCell('L9').value as { formula: string }).formula).toBe('J9+K9')
  })
})
