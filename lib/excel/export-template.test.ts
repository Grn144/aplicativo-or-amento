import { describe, it, expect } from 'vitest'
import { montarPlanilhaDescritivo } from './export-template'

const obra = {
  codigo: '08114',
  nome: 'UNILEVER - WT',
  cliente: { razao_social: 'UNILEVER DO BRASIL', endereco: 'AV. TESTE, 123', cnpj: '61.068.276/0001-04' },
}

const grupos = [
  {
    letra: 'A',
    ordem: 1,
    disciplina_nome: 'pré-obra',
    itens: [
      {
        numero: 1, descricao: 'DEMOLIÇÃO DE FORRO MINERAL', local: '4B - SALA HC OFFICE',
        unidade_sigla: 'M2', quantidade: 23, custo_unit_mao_obra: 90.678, custo_unit_material: 0,
        observacao: 'EXECUTADO', observacao_2: 'ABSORVER',
      },
      {
        numero: 2, descricao: 'DEMOLIÇÃO DE FORRO MINERAL', local: '4B - SALA CONFORT',
        unidade_sigla: 'M2', quantidade: 16, custo_unit_mao_obra: 90.678, custo_unit_material: 0,
        observacao: 'EXECUTADO', observacao_2: 'ABSORVER',
      },
    ],
  },
]

describe('montarPlanilhaDescritivo', () => {
  it('escreve o cabeçalho solto (linhas 1-5) com os dados da obra', () => {
    const wb = montarPlanilhaDescritivo(obra, grupos)
    const ws = wb.worksheets[0]
    expect(ws.getCell('C1').value).toBe('DESCRITIVO TÉCNICO E COMERCIAL')
    expect(ws.getCell('C2').value).toBe('UNILEVER DO BRASIL')
    expect(ws.getCell('C3').value).toBe('ENDEREÇO:  AV. TESTE, 123')
    expect(ws.getCell('C4').value).toBe('CNPJ: 61.068.276/0001-04')
    expect(ws.getCell('C5').value).toBe('08114 UNILEVER - WT')
  })

  it('mescla os cabeçalhos agrupados da linha 7', () => {
    const wb = montarPlanilhaDescritivo(obra, grupos)
    const ws = wb.worksheets[0]
    const merges = ws.model.merges as string[]
    expect(merges).toContain('H7:I7')
    expect(merges).toContain('J7:K7')
    expect(ws.getCell('H7').value).toBe('PREÇOS UNITÁRIOS')
    expect(ws.getCell('L7').value).toBe('TOTAL')
  })

  it('escreve o cabeçalho de colunas na linha 8', () => {
    const wb = montarPlanilhaDescritivo(obra, grupos)
    const ws = wb.worksheets[0]
    expect(ws.getCell('A8').value).toBe('ITEM')
    expect(ws.getCell('M8').value).toBe('OBS.')
    expect(ws.getCell('N8').value).toBe('OBS.')
  })

  it('escreve a linha de grupo em negrito com fundo cinza e fórmulas SUM sobre os itens', () => {
    const wb = montarPlanilhaDescritivo(obra, grupos)
    const ws = wb.worksheets[0]
    const grupoRow = ws.getRow(9)
    expect(grupoRow.getCell(1).value).toBe('A')
    expect(grupoRow.getCell(3).value).toBe('PRÉ-OBRA')
    expect(grupoRow.getCell(1).font?.bold).toBe(true)
    expect(grupoRow.getCell(1).fill).toMatchObject({ pattern: 'solid' })
    expect(grupoRow.getCell(10).value).toMatchObject({ formula: 'SUM(J10:J11)' })
  })

  it('escreve as linhas de item com fórmulas H*G, I*G, J+K e sem preenchimento', () => {
    const wb = montarPlanilhaDescritivo(obra, grupos)
    const ws = wb.worksheets[0]
    const item1 = ws.getRow(10)
    expect(item1.getCell(2).value).toBe(1)
    expect(item1.getCell(3).value).toBe('DEMOLIÇÃO DE FORRO MINERAL')
    expect(item1.getCell(8).value).toBe(90.678)
    expect(item1.getCell(10).value).toMatchObject({ formula: 'H10*G10' })
    expect(item1.getCell(11).value).toMatchObject({ formula: 'I10*G10' })
    expect(item1.getCell(12).value).toMatchObject({ formula: 'J10+K10' })
    expect(item1.getCell(1).fill).toMatchObject({ pattern: 'none' })
  })

  it('escreve os totais gerais na linha 6 como fórmula SUM(...)/2 cobrindo toda a faixa', () => {
    const wb = montarPlanilhaDescritivo(obra, grupos)
    const ws = wb.worksheets[0]
    expect(ws.getCell('J6').value).toMatchObject({ formula: 'SUM(J9:J11)/2' })
    expect(ws.getCell('L6').value).toMatchObject({ formula: 'SUM(L9:L11)/2' })
  })

  it('congela o painel em A9 e define o autofiltro até a última linha', () => {
    const wb = montarPlanilhaDescritivo(obra, grupos)
    const ws = wb.worksheets[0]
    expect(ws.views?.[0]).toMatchObject({ state: 'frozen', ySplit: 8, topLeftCell: 'A9' })
    expect(ws.autoFilter).toMatchObject({ from: 'A8', to: 'N11' })
  })

  it('aplica a largura de coluna exata do template', () => {
    const wb = montarPlanilhaDescritivo(obra, grupos)
    const ws = wb.worksheets[0]
    expect(ws.getColumn(3).width).toBeCloseTo(72.3984375)
    expect(ws.getColumn(15).width).toBeCloseTo(0.5)
  })
})
