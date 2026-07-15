import { describe, it, expect } from 'vitest'
import { validarOrcamentoParaExportacao } from './validacao-exportacao'

function itemBase(overrides: Partial<Parameters<typeof validarOrcamentoParaExportacao>[0][0]> = {}) {
  return {
    id: 'item-1',
    numero: 1,
    descricao: 'Pintura interna em parede',
    unidade_id: 'un-m2',
    custo_unit_material: 50,
    custo_unit_mao_obra: 30,
    quantidade: 10,
    lucro: 200,
    ...overrides,
  }
}

describe('validarOrcamentoParaExportacao', () => {
  it('retorna lista vazia para item sem nenhum problema', () => {
    expect(validarOrcamentoParaExportacao([itemBase()])).toEqual([])
  })

  it('sinaliza descrição vazia', () => {
    const resultado = validarOrcamentoParaExportacao([itemBase({ descricao: '  ' })])
    expect(resultado.some(p => p.tipo === 'descricao_ausente')).toBe(true)
  })

  it('sinaliza descrição igual ao placeholder padrão "Novo item"', () => {
    const resultado = validarOrcamentoParaExportacao([itemBase({ descricao: 'Novo item' })])
    expect(resultado.some(p => p.tipo === 'descricao_ausente')).toBe(true)
  })

  it('não sinaliza descrição preenchida normalmente', () => {
    const resultado = validarOrcamentoParaExportacao([itemBase({ descricao: 'Instalação elétrica' })])
    expect(resultado.some(p => p.tipo === 'descricao_ausente')).toBe(false)
  })

  it('sinaliza unidade ausente', () => {
    const resultado = validarOrcamentoParaExportacao([itemBase({ unidade_id: null })])
    expect(resultado.some(p => p.tipo === 'unidade_ausente')).toBe(true)
  })

  it('sinaliza valor zerado quando material e mão de obra são ambos zero', () => {
    const resultado = validarOrcamentoParaExportacao([itemBase({ custo_unit_material: 0, custo_unit_mao_obra: 0 })])
    expect(resultado.some(p => p.tipo === 'valor_zerado')).toBe(true)
  })

  it('não sinaliza valor zerado quando só um dos dois custos é zero', () => {
    const resultado = validarOrcamentoParaExportacao([itemBase({ custo_unit_material: 0, custo_unit_mao_obra: 30 })])
    expect(resultado.some(p => p.tipo === 'valor_zerado')).toBe(false)
  })

  it('sinaliza quantidade zero', () => {
    const resultado = validarOrcamentoParaExportacao([itemBase({ quantidade: 0 })])
    expect(resultado.some(p => p.tipo === 'quantidade_invalida')).toBe(true)
  })

  it('sinaliza quantidade negativa', () => {
    const resultado = validarOrcamentoParaExportacao([itemBase({ quantidade: -5 })])
    expect(resultado.some(p => p.tipo === 'quantidade_invalida')).toBe(true)
  })

  it('sinaliza custo inconsistente quando o lucro é negativo', () => {
    const resultado = validarOrcamentoParaExportacao([itemBase({ lucro: -10 })])
    expect(resultado.some(p => p.tipo === 'custo_inconsistente')).toBe(true)
  })

  it('não sinaliza custo inconsistente quando o lucro é zero ou positivo', () => {
    const resultado = validarOrcamentoParaExportacao([itemBase({ lucro: 0 })])
    expect(resultado.some(p => p.tipo === 'custo_inconsistente')).toBe(false)
  })

  it('sinaliza múltiplos problemas do mesmo item, um por tipo', () => {
    const resultado = validarOrcamentoParaExportacao([
      itemBase({ descricao: '', unidade_id: null, quantidade: 0 }),
    ])
    expect(resultado).toHaveLength(3)
    expect(resultado.map(p => p.tipo).sort()).toEqual(
      ['descricao_ausente', 'quantidade_invalida', 'unidade_ausente'].sort()
    )
  })

  it('inclui número e descrição do item em cada problema', () => {
    const resultado = validarOrcamentoParaExportacao([itemBase({ id: 'item-42', numero: 7, unidade_id: null })])
    expect(resultado[0].itemId).toBe('item-42')
    expect(resultado[0].itemNumero).toBe(7)
    expect(resultado[0].itemDescricao).toBe('Pintura interna em parede')
  })
})
