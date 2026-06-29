'use client'

import { useState } from 'react'
import { calcularGrupo, calcularTotaisGerais } from '@/lib/calculos'
import type { Cliente, Disciplina, GrupoOrcamento, ItemOrcamento, UnidadeMedida } from '@/types/database'
import type { GrupoCalculado, TotaisGerais, TipoVisao } from '@/types/orcamento'
import CabecalhoObra from './CabecalhoObra'
import ToggleVisao from './ToggleVisao'
import TabelaOrcamento from './TabelaOrcamento'

type GrupoComItens = GrupoOrcamento & {
  disciplinas?: Disciplina | null
  itens_orcamento: (ItemOrcamento & { unidades_medida?: UnidadeMedida | null })[]
}

type ObraParaEditor = {
  id: string
  codigo: string
  nome: string
  status: import('@/types/database').StatusObra
  data_orcamento: string | null
  clientes: { id: string; razao_social: string } | null
  grupos_orcamento: GrupoComItens[]
}

interface Props {
  obra: ObraParaEditor
  clientes: Pick<Cliente, 'id' | 'razao_social'>[]
  disciplinas: Pick<Disciplina, 'id' | 'nome'>[]
  unidades: Pick<UnidadeMedida, 'id' | 'sigla'>[]
}

export default function EditorOrcamento({ obra, clientes, disciplinas: _disciplinas, unidades: _unidades }: Props) {
  const [grupos, setGrupos] = useState<GrupoComItens[]>(
    obra.grupos_orcamento.map(g => ({ ...g, itens_orcamento: g.itens_orcamento ?? [] }))
  )
  const [visao, setVisao] = useState<TipoVisao>('comercial')

  // setGrupos is preserved for Task 5 to add editing capabilities
  void setGrupos

  const gruposCalculados: GrupoCalculado[] = grupos.map(g => calcularGrupo(g))
  const totais: TotaisGerais = calcularTotaisGerais(gruposCalculados)

  return (
    <div className="p-6 space-y-4">
      <CabecalhoObra obra={obra} clientes={clientes} />
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Orçamento</h2>
        <ToggleVisao visao={visao} onChange={setVisao} />
      </div>
      <TabelaOrcamento
        gruposCalculados={gruposCalculados}
        totais={totais}
        visao={visao}
      />
    </div>
  )
}
