import { calcularItem } from '@/lib/calculos'
import type { StatusObra } from '@/types/database'
import { dataReferenciaObra, type Intervalo } from './periodo'

export interface ObraDashboard {
  id: string
  codigo: string
  nome: string
  status: StatusObra
  data_orcamento: string | null
  criado_em: string
  clientes: { id: string; razao_social: string } | null
  usuarios: { nome: string } | null
  grupos_orcamento: {
    itens_orcamento: {
      quantidade: number
      custo_unit_mao_obra: number
      custo_unit_material: number
      markup_mao_obra: number
      markup_material: number
    }[]
  }[]
}

export interface Kpi { valor: number; variacaoPct: number | null }

export interface LinhaOrcamento {
  id: string
  codigo: string
  cliente: string      // '—' quando null
  obra: string
  responsavel: string  // '—' quando null
  valor: number        // total_venda
  data: string | null  // data de referência ISO (yyyy-mm-dd) ou null
  status: StatusObra
}

export interface DashboardData {
  kpis: {
    criados: Kpi
    emAnalise: Kpi
    aprovados: Kpi
    cancelados: Kpi
    valorOrcado: Kpi
    valorAprovado: Kpi
  }
  orcamentosPorMes: { mes: string; quantidade: number }[]          // 12 entradas, ano corrente
  statusDistribuicao: { status: StatusObra; label: string; quantidade: number }[]  // só status com qtd > 0, do período
  evolucaoFinanceira: { mes: string; orcado: number; aprovado: number; custo: number }[]  // 12, ano corrente
  conversao: { mes: string; criados: number; enviados: number; aprovados: number }[]      // 12, ano corrente
  indicadores: {
    ticketMedio: number | null
    maiorOrcamento: number | null
    taxaConversao: number | null   // % aprovados ÷ (enviados + aprovados) do período
    margemMedia: number | null     // % média ponderada: Σlucro ÷ Σvenda do período
  }
  ultimosOrcamentos: LinhaOrcamento[]  // do período, mais recentes primeiro, sem limite (tabela pagina)
  topClientes: { nome: string; obras: number; valor: number }[]    // top 5 por valor, do período
}

export const STATUS_LABELS: Record<StatusObra, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
  em_execucao: 'Em execução',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

export const STATUS_APROVADOS: StatusObra[] = ['aprovado', 'em_execucao', 'concluido']

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function itensDaObra(obra: ObraDashboard) {
  return obra.grupos_orcamento.flatMap(g => g.itens_orcamento)
}

function calcularObra(obra: ObraDashboard): { venda: number; custo: number } {
  return itensDaObra(obra).reduce(
    (acc, item) => {
      const c = calcularItem({
        id: '', grupo_id: '', numero: 0, descricao: '', local: null,
        unidade_id: null, observacao: null, observacao_2: null, ordem: 0,
        fee_mao_obra: null, fee_material: null,
        composicao_id: null, composicao_versao: null,
        ...item,
      }, 1.02) // fee padrão para KPIs; o valor por obra é aplicado no editor/export
      return { venda: acc.venda + c.total_venda, custo: acc.custo + c.total_custo }
    },
    { venda: 0, custo: 0 }
  )
}

export function totalVendaObra(obra: ObraDashboard): number {
  return calcularObra(obra).venda
}

export function totalCustoObra(obra: ObraDashboard): number {
  return calcularObra(obra).custo
}

export function variacaoPct(atual: number, anterior: number): number | null {
  if (anterior === 0) return null
  return ((atual - anterior) / anterior) * 100
}

function dentro(d: Date, inicio: Date, fim: Date): boolean {
  return d >= inicio && d <= fim
}

export function calcularDashboard(
  obras: ObraDashboard[],
  intervalo: Intervalo,
  agora: Date = new Date()
): DashboardData {
  const comData = obras.map(o => ({ obra: o, data: dataReferenciaObra(o), ...calcularObra(o) }))
  const atuais = comData.filter(x => dentro(x.data, intervalo.inicio, intervalo.fim))
  const anteriores = comData.filter(x => dentro(x.data, intervalo.inicioAnterior, intervalo.fimAnterior))

  const kpi = (
    filtro: (x: (typeof comData)[number]) => boolean,
    valorDe: (xs: (typeof comData)[number][]) => number
  ): Kpi => {
    const atual = valorDe(atuais.filter(filtro))
    const anterior = valorDe(anteriores.filter(filtro))
    return { valor: atual, variacaoPct: variacaoPct(atual, anterior) }
  }
  const contagem = (xs: (typeof comData)[number][]) => xs.length
  const somaVenda = (xs: (typeof comData)[number][]) => xs.reduce((s, x) => s + x.venda, 0)
  const ehAprovada = (x: (typeof comData)[number]) => STATUS_APROVADOS.includes(x.obra.status)

  // séries mensais — ano corrente
  const ano = agora.getFullYear()
  const doAno = comData.filter(x => x.data.getFullYear() === ano)
  const porMes = <T>(inicial: () => T, acumula: (t: T, x: (typeof comData)[number]) => T): T[] => {
    const arr = Array.from({ length: 12 }, inicial)
    for (const x of doAno) arr[x.data.getMonth()] = acumula(arr[x.data.getMonth()], x)
    return arr
  }

  const orcamentosPorMes = porMes(() => 0, (n) => n + 1).map((quantidade, i) => ({ mes: MESES[i], quantidade }))
  const evolucaoFinanceira = porMes(
    () => ({ orcado: 0, aprovado: 0, custo: 0 }),
    (t, x) => ({
      orcado: t.orcado + x.venda,
      aprovado: t.aprovado + (ehAprovada(x) ? x.venda : 0),
      custo: t.custo + x.custo,
    })
  ).map((t, i) => ({ mes: MESES[i], ...t }))
  const conversao = porMes(
    () => ({ criados: 0, enviados: 0, aprovados: 0 }),
    (t, x) => ({
      criados: t.criados + 1,
      enviados: t.enviados + (x.obra.status === 'enviado' ? 1 : 0),
      aprovados: t.aprovados + (ehAprovada(x) ? 1 : 0),
    })
  ).map((t, i) => ({ mes: MESES[i], ...t }))

  // indicadores do período
  const vendas = atuais.map(x => x.venda)
  const somaVendaAtual = somaVenda(atuais)
  const somaLucro = atuais.reduce((s, x) => s + (x.venda - x.custo), 0)
  const enviadosQtd = atuais.filter(x => x.obra.status === 'enviado').length
  const aprovadosQtd = atuais.filter(ehAprovada).length
  const denomConversao = enviadosQtd + aprovadosQtd

  const statusDistribuicao = (Object.keys(STATUS_LABELS) as StatusObra[])
    .map(status => ({
      status,
      label: STATUS_LABELS[status],
      quantidade: atuais.filter(x => x.obra.status === status).length,
    }))
    .filter(s => s.quantidade > 0)

  const ultimosOrcamentos: LinhaOrcamento[] = [...atuais]
    .sort((a, b) => b.data.getTime() - a.data.getTime())
    .map(x => ({
      id: x.obra.id,
      codigo: x.obra.codigo,
      cliente: x.obra.clientes?.razao_social ?? '—',
      obra: x.obra.nome,
      responsavel: x.obra.usuarios?.nome ?? '—',
      valor: x.venda,
      data: x.obra.data_orcamento ?? x.obra.criado_em.slice(0, 10),
      status: x.obra.status,
    }))

  const porCliente = new Map<string, { nome: string; obras: number; valor: number }>()
  for (const x of atuais) {
    if (!x.obra.clientes) continue
    const atual = porCliente.get(x.obra.clientes.id) ?? { nome: x.obra.clientes.razao_social, obras: 0, valor: 0 }
    porCliente.set(x.obra.clientes.id, { ...atual, obras: atual.obras + 1, valor: atual.valor + x.venda })
  }
  const topClientes = [...porCliente.values()].sort((a, b) => b.valor - a.valor).slice(0, 5)

  return {
    kpis: {
      criados: kpi(() => true, contagem),
      emAnalise: kpi(x => x.obra.status === 'enviado', contagem),
      aprovados: kpi(ehAprovada, contagem),
      cancelados: kpi(x => x.obra.status === 'cancelado', contagem),
      valorOrcado: kpi(() => true, somaVenda),
      valorAprovado: kpi(ehAprovada, somaVenda),
    },
    orcamentosPorMes,
    statusDistribuicao,
    evolucaoFinanceira,
    conversao,
    indicadores: {
      ticketMedio: vendas.length > 0 ? somaVendaAtual / vendas.length : null,
      maiorOrcamento: vendas.length > 0 ? Math.max(...vendas) : null,
      taxaConversao: denomConversao > 0 ? (aprovadosQtd / denomConversao) * 100 : null,
      margemMedia: somaVendaAtual > 0 ? (somaLucro / somaVendaAtual) * 100 : null,
    },
    ultimosOrcamentos,
    topClientes,
  }
}
