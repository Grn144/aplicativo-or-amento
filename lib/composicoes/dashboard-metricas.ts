// lib/composicoes/dashboard-metricas.ts
import { composicaoIncompleta } from './calculos'

export interface ComposicaoParaDashboard {
  id: string
  codigo: string
  nome: string
  disciplina_nome: string | null
  criado_em: string
  temMateriais: boolean
  temMaoObra: boolean
}

export interface UsoParaDashboard {
  composicao_id: string
  criado_em: string
}

export interface ItemComComposicaoParaDashboard {
  composicao_versao: number
  versao_atual: number
}

export interface ComposicaoResumo {
  id: string
  codigo: string
  nome: string
}

export interface ItemMaisUtilizada extends ComposicaoResumo {
  totalUsos: number
}

export interface ItemNuncaUtilizada extends ComposicaoResumo {
  criadoEm: string
}

export interface ItemIncompleta extends ComposicaoResumo {
  faltando: 'material' | 'mao_obra'
}

export interface DashboardComposicoesData {
  totalAtivas: number
  incompletas: { count: number; lista: ItemIncompleta[] }
  nuncaUtilizadas: { count: number; lista: ItemNuncaUtilizada[] }
  itensDesatualizados: number
  maisUtilizadas: ItemMaisUtilizada[]
  porDisciplina: { nome: string; quantidade: number }[]
  usoMensal: { mes: string; quantidade: number }[]
}

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

/** Últimos 12 meses terminando no mês de `agora` (incluso), mais antigo primeiro. */
function ultimos12Meses(agora: Date): { ano: number; mes: number }[] {
  const resultado: { ano: number; mes: number }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1)
    resultado.push({ ano: d.getFullYear(), mes: d.getMonth() })
  }
  return resultado
}

export function calcularDashboardComposicoes(
  composicoes: ComposicaoParaDashboard[],
  usos: UsoParaDashboard[],
  itensComComposicao: ItemComComposicaoParaDashboard[],
  agora: Date = new Date()
): DashboardComposicoesData {
  const usosPorComposicao = new Map<string, number>()
  for (const u of usos) {
    usosPorComposicao.set(u.composicao_id, (usosPorComposicao.get(u.composicao_id) ?? 0) + 1)
  }

  const resumo = (c: ComposicaoParaDashboard): ComposicaoResumo => ({ id: c.id, codigo: c.codigo, nome: c.nome })

  const maisUtilizadas: ItemMaisUtilizada[] = composicoes
    .map(c => ({ ...resumo(c), totalUsos: usosPorComposicao.get(c.id) ?? 0 }))
    .sort((a, b) => b.totalUsos - a.totalUsos)
    .slice(0, 10)

  const nuncaUtilizadasTodas = composicoes
    .filter(c => (usosPorComposicao.get(c.id) ?? 0) === 0)
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em))
  const nuncaUtilizadas = {
    count: nuncaUtilizadasTodas.length,
    lista: nuncaUtilizadasTodas.slice(0, 10).map(c => ({ ...resumo(c), criadoEm: c.criado_em })),
  }

  const incompletasTodas = composicoes
    .filter(c => composicaoIncompleta(c.temMateriais, c.temMaoObra))
    .sort((a, b) => a.nome.localeCompare(b.nome))
  const incompletas = {
    count: incompletasTodas.length,
    lista: incompletasTodas.slice(0, 10).map(c => ({
      ...resumo(c),
      faltando: c.temMateriais ? ('mao_obra' as const) : ('material' as const),
    })),
  }

  const porDisciplinaMap = new Map<string, number>()
  for (const c of composicoes) {
    const nome = c.disciplina_nome ?? 'Sem disciplina'
    porDisciplinaMap.set(nome, (porDisciplinaMap.get(nome) ?? 0) + 1)
  }
  const porDisciplina = [...porDisciplinaMap.entries()]
    .map(([nome, quantidade]) => ({ nome, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome))

  const janela = ultimos12Meses(agora)
  const usoMensalMap = new Map<string, number>(janela.map(j => [`${j.ano}-${j.mes}`, 0]))
  for (const u of usos) {
    const d = new Date(u.criado_em)
    const chave = `${d.getFullYear()}-${d.getMonth()}`
    if (usoMensalMap.has(chave)) usoMensalMap.set(chave, usoMensalMap.get(chave)! + 1)
  }
  const usoMensal = janela.map(j => ({
    mes: `${MESES_ABREV[j.mes]}/${String(j.ano).slice(-2)}`,
    quantidade: usoMensalMap.get(`${j.ano}-${j.mes}`) ?? 0,
  }))

  const itensDesatualizados = itensComComposicao.filter(i => i.composicao_versao < i.versao_atual).length

  return {
    totalAtivas: composicoes.length,
    incompletas,
    nuncaUtilizadas,
    itensDesatualizados,
    maisUtilizadas,
    porDisciplina,
    usoMensal,
  }
}
