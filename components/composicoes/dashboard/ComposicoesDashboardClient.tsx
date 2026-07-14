'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Package, AlertTriangle, PackageX, RefreshCcw } from 'lucide-react'
import { CardKpiComposicoes } from './CardKpiComposicoes'
import { GraficoPizzaDisciplinas } from './GraficoPizzaDisciplinas'
import { GraficoBarrasUsoMensal } from './GraficoBarrasUsoMensal'
import { ListaComposicoes } from './ListaComposicoes'
import ComposicaoModal from '@/components/composicoes/ComposicaoModal'
import type { DashboardComposicoesData } from '@/lib/composicoes/dashboard-metricas'

interface Props {
  dados: DashboardComposicoesData
  disciplinas: { id: string; nome: string }[]
  unidades: { id: string; sigla: string }[]
}

export function ComposicoesDashboardClient({ dados, disciplinas, unidades }: Props) {
  const router = useRouter()
  const [composicaoSelecionada, setComposicaoSelecionada] = useState<string | null>(null)

  if (dados.totalAtivas === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-6 py-24 text-center">
        <p className="text-lg font-medium text-foreground">Nenhuma composição cadastrada ainda</p>
        <p className="text-sm text-muted-foreground">Cadastre composições para ver os indicadores aqui.</p>
        <a
          href="/composicoes"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Ir para Composições
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Indicadores do Banco de Composições</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <CardKpiComposicoes titulo="Composições Ativas" valor={dados.totalAtivas} icone={Package} cor="azul" />
        <CardKpiComposicoes titulo="Incompletas" valor={dados.incompletas.count} icone={AlertTriangle} cor="laranja" />
        <CardKpiComposicoes titulo="Nunca Utilizadas" valor={dados.nuncaUtilizadas.count} icone={PackageX} cor="cinza" />
        <CardKpiComposicoes titulo="Itens com Composição Desatualizada" valor={dados.itensDesatualizados} icone={RefreshCcw} cor="vermelho" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <GraficoPizzaDisciplinas dados={dados.porDisciplina} />
        <GraficoBarrasUsoMensal dados={dados.usoMensal} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ListaComposicoes
          titulo="Mais Utilizadas"
          totalCount={dados.maisUtilizadas.length}
          linhas={dados.maisUtilizadas.map(c => ({
            id: c.id,
            codigo: c.codigo,
            nome: c.nome,
            detalhe: `${c.totalUsos} uso${c.totalUsos === 1 ? '' : 's'}`,
          }))}
          aoClicarComposicao={setComposicaoSelecionada}
        />
        <ListaComposicoes
          titulo="Nunca Utilizadas"
          totalCount={dados.nuncaUtilizadas.count}
          linhas={dados.nuncaUtilizadas.lista.map(c => ({
            id: c.id,
            codigo: c.codigo,
            nome: c.nome,
            detalhe: `criada em ${new Date(c.criadoEm).toLocaleDateString('pt-BR')}`,
          }))}
          aoClicarComposicao={setComposicaoSelecionada}
        />
        <ListaComposicoes
          titulo="Incompletas"
          totalCount={dados.incompletas.count}
          linhas={dados.incompletas.lista.map(c => ({
            id: c.id,
            codigo: c.codigo,
            nome: c.nome,
            detalhe: c.faltando === 'material' ? 'falta material' : 'falta mão de obra',
          }))}
          aoClicarComposicao={setComposicaoSelecionada}
        />
      </div>

      <ComposicaoModal
        aberto={composicaoSelecionada !== null}
        onOpenChange={aberto => { if (!aberto) setComposicaoSelecionada(null) }}
        composicaoId={composicaoSelecionada}
        disciplinas={disciplinas}
        unidades={unidades}
        onSalvo={() => router.refresh()}
      />
    </div>
  )
}
