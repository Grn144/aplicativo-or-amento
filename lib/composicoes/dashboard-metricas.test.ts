import { describe, it, expect } from 'vitest'
import {
  calcularDashboardComposicoes,
  type ComposicaoParaDashboard,
  type UsoParaDashboard,
  type ItemComComposicaoParaDashboard,
} from './dashboard-metricas'

const AGORA = new Date(2026, 6, 15) // 15 de julho de 2026

describe('calcularDashboardComposicoes', () => {
  it('lista vazia: tudo zerado, usoMensal com 12 meses a 0', () => {
    const resultado = calcularDashboardComposicoes([], [], [], AGORA)

    expect(resultado.totalAtivas).toBe(0)
    expect(resultado.incompletas).toEqual({ count: 0, lista: [] })
    expect(resultado.nuncaUtilizadas).toEqual({ count: 0, lista: [] })
    expect(resultado.itensDesatualizados).toBe(0)
    expect(resultado.maisUtilizadas).toEqual([])
    expect(resultado.porDisciplina).toEqual([])
    expect(resultado.usoMensal).toEqual([
      { mes: 'Ago/25', quantidade: 0 },
      { mes: 'Set/25', quantidade: 0 },
      { mes: 'Out/25', quantidade: 0 },
      { mes: 'Nov/25', quantidade: 0 },
      { mes: 'Dez/25', quantidade: 0 },
      { mes: 'Jan/26', quantidade: 0 },
      { mes: 'Fev/26', quantidade: 0 },
      { mes: 'Mar/26', quantidade: 0 },
      { mes: 'Abr/26', quantidade: 0 },
      { mes: 'Mai/26', quantidade: 0 },
      { mes: 'Jun/26', quantidade: 0 },
      { mes: 'Jul/26', quantidade: 0 },
    ])
  })

  it('incompletas: XOR material/mão-de-obra, ordenadas por nome', () => {
    const composicoes: ComposicaoParaDashboard[] = [
      { id: 'a', codigo: 'A', nome: 'Composição A', disciplina_nome: null, criado_em: '2026-01-01T00:00:00Z', temMateriais: true, temMaoObra: false },
      { id: 'b', codigo: 'B', nome: 'Composição B', disciplina_nome: null, criado_em: '2026-01-01T00:00:00Z', temMateriais: false, temMaoObra: true },
      { id: 'c', codigo: 'C', nome: 'Composição C', disciplina_nome: null, criado_em: '2026-01-01T00:00:00Z', temMateriais: true, temMaoObra: true },
    ]

    const resultado = calcularDashboardComposicoes(composicoes, [], [], AGORA)

    expect(resultado.incompletas.count).toBe(2)
    expect(resultado.incompletas.lista).toEqual([
      { id: 'a', codigo: 'A', nome: 'Composição A', faltando: 'mao_obra' },
      { id: 'b', codigo: 'B', nome: 'Composição B', faltando: 'material' },
    ])
  })

  it('nunca utilizadas: total_usos === 0, ordenadas por criado_em crescente', () => {
    const composicoes: ComposicaoParaDashboard[] = [
      { id: 'x', codigo: 'X', nome: 'Composição X', disciplina_nome: null, criado_em: '2026-03-01T00:00:00Z', temMateriais: true, temMaoObra: true },
      { id: 'y', codigo: 'Y', nome: 'Composição Y', disciplina_nome: null, criado_em: '2026-01-01T00:00:00Z', temMateriais: true, temMaoObra: true },
      { id: 'z', codigo: 'Z', nome: 'Composição Z', disciplina_nome: null, criado_em: '2026-02-01T00:00:00Z', temMateriais: true, temMaoObra: true },
    ]
    const usos: UsoParaDashboard[] = [{ composicao_id: 'x', criado_em: '2026-04-01T00:00:00Z' }]

    const resultado = calcularDashboardComposicoes(composicoes, usos, [], AGORA)

    expect(resultado.nuncaUtilizadas.count).toBe(2)
    expect(resultado.nuncaUtilizadas.lista).toEqual([
      { id: 'y', codigo: 'Y', nome: 'Composição Y', criadoEm: '2026-01-01T00:00:00Z' },
      { id: 'z', codigo: 'Z', nome: 'Composição Z', criadoEm: '2026-02-01T00:00:00Z' },
    ])
  })

  it('distribuição por disciplina agrupa corretamente, incluindo sem disciplina', () => {
    const composicoes: ComposicaoParaDashboard[] = [
      { id: '1', codigo: '1', nome: 'C1', disciplina_nome: 'Alvenaria', criado_em: '2026-01-01T00:00:00Z', temMateriais: true, temMaoObra: true },
      { id: '2', codigo: '2', nome: 'C2', disciplina_nome: 'Alvenaria', criado_em: '2026-01-01T00:00:00Z', temMateriais: true, temMaoObra: true },
      { id: '3', codigo: '3', nome: 'C3', disciplina_nome: 'Elétrica', criado_em: '2026-01-01T00:00:00Z', temMateriais: true, temMaoObra: true },
      { id: '4', codigo: '4', nome: 'C4', disciplina_nome: null, criado_em: '2026-01-01T00:00:00Z', temMateriais: true, temMaoObra: true },
    ]

    const resultado = calcularDashboardComposicoes(composicoes, [], [], AGORA)

    expect(resultado.porDisciplina).toEqual([
      { nome: 'Alvenaria', quantidade: 2 },
      { nome: 'Elétrica', quantidade: 1 },
      { nome: 'Sem disciplina', quantidade: 1 },
    ])
  })

  it('série mensal preenche os últimos 12 meses, incluindo meses sem uso (=0), e ignora usos fora da janela', () => {
    const usos: UsoParaDashboard[] = [
      { composicao_id: 'a', criado_em: '2026-07-10T12:00:00Z' },
      { composicao_id: 'b', criado_em: '2025-08-05T12:00:00Z' },
      { composicao_id: 'c', criado_em: '2025-08-20T12:00:00Z' },
      { composicao_id: 'd', criado_em: '2025-07-01T12:00:00Z' },
    ]

    const resultado = calcularDashboardComposicoes([], usos, [], AGORA)

    expect(resultado.usoMensal).toEqual([
      { mes: 'Ago/25', quantidade: 2 },
      { mes: 'Set/25', quantidade: 0 },
      { mes: 'Out/25', quantidade: 0 },
      { mes: 'Nov/25', quantidade: 0 },
      { mes: 'Dez/25', quantidade: 0 },
      { mes: 'Jan/26', quantidade: 0 },
      { mes: 'Fev/26', quantidade: 0 },
      { mes: 'Mar/26', quantidade: 0 },
      { mes: 'Abr/26', quantidade: 0 },
      { mes: 'Mai/26', quantidade: 0 },
      { mes: 'Jun/26', quantidade: 0 },
      { mes: 'Jul/26', quantidade: 1 },
    ])
  })

  it('itens desatualizados: conta só quando composicao_versao < versao_atual (nunca igual ou maior)', () => {
    const itensComComposicao: ItemComComposicaoParaDashboard[] = [
      { composicao_versao: 1, versao_atual: 2 },
      { composicao_versao: 2, versao_atual: 2 },
      { composicao_versao: 3, versao_atual: 2 },
    ]

    const resultado = calcularDashboardComposicoes([], [], itensComComposicao, AGORA)

    expect(resultado.itensDesatualizados).toBe(1)
  })

  it('top-10 mais utilizadas ordena por totalUsos decrescente e corta em 10', () => {
    const composicoes: ComposicaoParaDashboard[] = Array.from({ length: 12 }, (_, i) => ({
      id: `c${i + 1}`, codigo: `COD-${i + 1}`, nome: `Composição ${i + 1}`,
      disciplina_nome: null, criado_em: '2026-01-01T00:00:00Z',
      temMateriais: true, temMaoObra: true,
    }))
    const usos: UsoParaDashboard[] = composicoes.flatMap((c, i) =>
      Array.from({ length: i + 1 }, () => ({ composicao_id: c.id, criado_em: '2026-01-15T00:00:00Z' }))
    )

    const resultado = calcularDashboardComposicoes(composicoes, usos, [], AGORA)

    expect(resultado.totalAtivas).toBe(12)
    expect(resultado.maisUtilizadas).toHaveLength(10)
    expect(resultado.maisUtilizadas.map(m => m.id)).toEqual(
      ['c12', 'c11', 'c10', 'c9', 'c8', 'c7', 'c6', 'c5', 'c4', 'c3']
    )
    expect(resultado.maisUtilizadas[0].totalUsos).toBe(12)
    expect(resultado.maisUtilizadas[9].totalUsos).toBe(3)
  })
})
