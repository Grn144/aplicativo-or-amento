import { Banknote, CheckCircle2, Clock, FileText, Wallet, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { fmt, fmtPct } from '@/lib/format'
import { intervaloDoPeriodo, parsePeriodo } from '@/lib/dashboard/periodo'
import { calcularDashboard, type ObraDashboard } from '@/lib/dashboard/metricas'
import { HeaderDashboard } from '@/components/dashboard/HeaderDashboard'
import { CardKpi } from '@/components/dashboard/CardKpi'
import { GraficoBarrasMensal } from '@/components/dashboard/GraficoBarrasMensal'
import { GraficoPizzaStatus } from '@/components/dashboard/GraficoPizzaStatus'
import { GraficoLinhaFinanceiro } from '@/components/dashboard/GraficoLinhaFinanceiro'
import { GraficoAreaConversao } from '@/components/dashboard/GraficoAreaConversao'
import { TabelaUltimosOrcamentos } from '@/components/dashboard/TabelaUltimosOrcamentos'
import { TopClientes } from '@/components/dashboard/TopClientes'
import { AtividadesRecentes, type Atividade } from '@/components/dashboard/AtividadesRecentes'
// import { RealtimeRefresh } from '@/components/dashboard/RealtimeRefresh'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; busca?: string }>
}) {
  const params = await searchParams
  const periodo = parsePeriodo(params.periodo)
  const intervalo = intervaloDoPeriodo(periodo)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: usuario }, { data: obras, error: erroObras }, { data: historico }] = await Promise.all([
    supabase.from('usuarios').select('nome, papel').eq('id', user!.id).single(),
    supabase.from('obras').select(`
      id, codigo, nome, status, data_orcamento, criado_em,
      clientes ( id, razao_social ),
      usuarios ( nome ),
      grupos_orcamento (
        itens_orcamento (
          quantidade, custo_unit_mao_obra, custo_unit_material,
          margem_mao_obra_pct, margem_material_pct
        )
      )
    `),
    supabase
      .from('historico_alteracoes')
      .select('id, campo, valor_novo, alterado_em, usuarios ( nome ), obras ( codigo, nome )')
      .order('alterado_em', { ascending: false })
      .limit(8),
  ])

  if (erroObras) throw new Error(`Falha ao carregar o dashboard: ${erroObras.message}`)

  const dados = calcularDashboard((obras ?? []) as unknown as ObraDashboard[], intervalo)

  const atividades: Atividade[] = (historico ?? []).map((h) => {
    const registro = h as unknown as {
      id: string; campo: string; valor_novo: string | null; alterado_em: string
      usuarios: { nome: string } | null
      obras: { codigo: string; nome: string } | null
    }
    return {
      id: registro.id,
      usuario: registro.usuarios?.nome ?? 'Alguém',
      campo: registro.campo,
      valorNovo: registro.valor_novo,
      obraCodigo: registro.obras?.codigo ?? '—',
      obraNome: registro.obras?.nome ?? '—',
      quando: registro.alterado_em,
    }
  })

  const { kpis, indicadores } = dados
  const moeda = (n: number) => `R$ ${fmt(n)}`

  return (
    <div className="space-y-6 p-6" id="area-impressao">
      {/* <RealtimeRefresh /> */}
      <HeaderDashboard periodo={periodo} usuario={{ nome: usuario?.nome ?? 'Usuário' }} />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <CardKpi titulo="Orçamentos Criados" valor={String(kpis.criados.valor)} variacaoPct={kpis.criados.variacaoPct} icone={FileText} cor="azul" />
        <CardKpi titulo="Em Análise" valor={String(kpis.emAnalise.valor)} variacaoPct={kpis.emAnalise.variacaoPct} icone={Clock} cor="laranja" />
        <CardKpi titulo="Aprovados" valor={String(kpis.aprovados.valor)} variacaoPct={kpis.aprovados.variacaoPct} icone={CheckCircle2} cor="verde" />
        <CardKpi titulo="Cancelados" valor={String(kpis.cancelados.valor)} variacaoPct={kpis.cancelados.variacaoPct} icone={XCircle} cor="vermelho" />
        <CardKpi titulo="Valor Total Orçado" valor={moeda(kpis.valorOrcado.valor)} variacaoPct={kpis.valorOrcado.variacaoPct} icone={Banknote} cor="roxo" />
        <CardKpi titulo="Valor Aprovado" valor={moeda(kpis.valorAprovado.valor)} variacaoPct={kpis.valorAprovado.variacaoPct} icone={Wallet} cor="verde" />
      </div>

      {/* Gráficos */}
      <div className="grid gap-6 lg:grid-cols-2">
        <GraficoBarrasMensal dados={dados.orcamentosPorMes} />
        <GraficoPizzaStatus dados={dados.statusDistribuicao} />
        <GraficoLinhaFinanceiro dados={dados.evolucaoFinanceira} />
        <GraficoAreaConversao dados={dados.conversao} />
      </div>

      {/* Indicadores menores */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { titulo: 'Ticket Médio', valor: indicadores.ticketMedio !== null ? moeda(indicadores.ticketMedio) : '—' },
          { titulo: 'Maior Orçamento', valor: indicadores.maiorOrcamento !== null ? moeda(indicadores.maiorOrcamento) : '—' },
          { titulo: 'Taxa de Conversão', valor: indicadores.taxaConversao !== null ? fmtPct(indicadores.taxaConversao) : '—' },
          { titulo: 'Margem Efetiva Média', valor: indicadores.margemMedia !== null ? fmtPct(indicadores.margemMedia) : '—' },
        ].map(i => (
          <div key={i.titulo} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs text-muted-foreground">{i.titulo}</p>
            <p className="mt-1 truncate text-xl font-bold tracking-tight" title={i.valor}>{i.valor}</p>
          </div>
        ))}
      </div>

      {/* Tabela + laterais */}
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TabelaUltimosOrcamentos linhas={dados.ultimosOrcamentos} podeExcluir={usuario?.papel === 'admin'} />
        </div>
        <div className="space-y-6">
          <TopClientes clientes={dados.topClientes} />
          <AtividadesRecentes atividades={atividades} />
        </div>
      </div>
    </div>
  )
}
