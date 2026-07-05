import { describe, it, expect } from 'vitest'
import { parsePeriodo, intervaloDoPeriodo, dataReferenciaObra } from './periodo'

const AGORA = new Date('2026-07-04T15:30:00')

describe('parsePeriodo', () => {
  it('retorna o valor quando válido', () => {
    expect(parsePeriodo('hoje')).toBe('hoje')
    expect(parsePeriodo('ano')).toBe('ano')
  })
  it('cai no default 30d para inválido ou ausente', () => {
    expect(parsePeriodo(undefined)).toBe('30d')
    expect(parsePeriodo('xyz')).toBe('30d')
  })
})

describe('intervaloDoPeriodo', () => {
  it('hoje: dia atual completo, anterior = ontem', () => {
    const i = intervaloDoPeriodo('hoje', AGORA)
    expect(i.inicio).toEqual(new Date('2026-07-04T00:00:00'))
    expect(i.fim.getDate()).toBe(4)
    expect(i.fim.getHours()).toBe(23)
    expect(i.inicioAnterior).toEqual(new Date('2026-07-03T00:00:00'))
    expect(i.fimAnterior.getDate()).toBe(3)
  })
  it('30d: janela de 30 dias terminando hoje', () => {
    const i = intervaloDoPeriodo('30d', AGORA)
    expect(i.inicio).toEqual(new Date('2026-06-05T00:00:00'))
    expect(i.fim.getDate()).toBe(4)
    // janela anterior encosta na atual sem sobrepor
    expect(i.fimAnterior < i.inicio).toBe(true)
    expect(i.inicioAnterior).toEqual(new Date('2026-05-06T00:00:00'))
  })
  it('ano: ano corrente inteiro, anterior = ano passado', () => {
    const i = intervaloDoPeriodo('ano', AGORA)
    expect(i.inicio).toEqual(new Date('2026-01-01T00:00:00'))
    expect(i.fim.getFullYear()).toBe(2026)
    expect(i.fim.getMonth()).toBe(11)
    expect(i.inicioAnterior.getFullYear()).toBe(2025)
    expect(i.fimAnterior.getFullYear()).toBe(2025)
  })
})

describe('dataReferenciaObra', () => {
  it('usa data_orcamento quando presente', () => {
    const d = dataReferenciaObra({ data_orcamento: '2026-03-10', criado_em: '2026-01-01T10:00:00Z' })
    expect(d.getMonth()).toBe(2)
    expect(d.getDate()).toBe(10)
  })
  it('cai em criado_em quando data_orcamento é nula', () => {
    const d = dataReferenciaObra({ data_orcamento: null, criado_em: '2026-02-20T10:00:00Z' })
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(1)
  })
})
