import { describe, it, expect } from 'vitest'
import { round2 } from './format'

describe('round2', () => {
  it('arredonda para cima em .xx5', () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(2.675)).toBe(2.68)
  })

  it('mantém valores já com 2 casas', () => {
    expect(round2(10.5)).toBe(10.5)
    expect(round2(0)).toBe(0)
  })

  it('arredonda negativos para longe do zero', () => {
    expect(round2(-1.005)).toBe(-1.01)
  })

  it('corrige erro de ponto flutuante típico do JS', () => {
    // 1.005 em IEEE-754 é armazenado como ~1.00499999999999989...
    // Math.round ingênuo arredondaria para 1.00; round2 deve compensar.
    expect(round2(1.115)).toBe(1.12)
  })
})
