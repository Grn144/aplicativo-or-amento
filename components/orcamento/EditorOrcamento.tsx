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

export default function EditorOrcamento({ obra, clientes, disciplinas, unidades }: Props) {
  const [grupos, setGrupos] = useState<GrupoComItens[]>(
    obra.grupos_orcamento.map(g => ({ ...g, itens_orcamento: g.itens_orcamento ?? [] }))
  )
  const [visao, setVisao] = useState<TipoVisao>('comercial')

  const gruposCalculados: GrupoCalculado[] = grupos.map(g => calcularGrupo(g))
  const totais: TotaisGerais = calcularTotaisGerais(gruposCalculados)

  async function atualizarItem(grupoId: string, itemId: string, campo: string, valor: unknown) {
    // Atualização otimista
    setGrupos(prev => prev.map(g =>
      g.id !== grupoId ? g : {
        ...g,
        itens_orcamento: g.itens_orcamento.map(item =>
          item.id !== itemId ? item : { ...item, [campo]: valor }
        ),
      }
    ))
    await fetch(`/api/obras/${obra.id}/grupos/${grupoId}/itens/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [campo]: valor }),
    })
  }

  async function adicionarGrupo(disciplina_id: string) {
    const res = await fetch(`/api/obras/${obra.id}/grupos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disciplina_id }),
    })
    if (!res.ok) return
    const novoGrupo = await res.json()
    setGrupos(prev => [...prev, { ...novoGrupo, itens_orcamento: novoGrupo.itens_orcamento ?? [] }])
  }

  async function removerGrupo(grupoId: string) {
    const res = await fetch(`/api/obras/${obra.id}/grupos/${grupoId}`, { method: 'DELETE' })
    if (!res.ok) return
    setGrupos(prev => prev.filter(g => g.id !== grupoId))
  }

  async function adicionarItem(grupoId: string) {
    const res = await fetch(`/api/obras/${obra.id}/grupos/${grupoId}/itens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (!res.ok) return
    const novoItem = await res.json()
    setGrupos(prev => prev.map(g =>
      g.id !== grupoId ? g : {
        ...g,
        itens_orcamento: [...g.itens_orcamento, novoItem],
      }
    ))
  }

  async function removerItem(grupoId: string, itemId: string) {
    const res = await fetch(`/api/obras/${obra.id}/grupos/${grupoId}/itens/${itemId}`, {
      method: 'DELETE',
    })
    if (!res.ok) return
    setGrupos(prev => prev.map(g =>
      g.id !== grupoId ? g : {
        ...g,
        itens_orcamento: g.itens_orcamento.filter(item => item.id !== itemId),
      }
    ))
  }

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
        obraId={obra.id}
        disciplinas={disciplinas}
        unidades={unidades}
        onUpdateItem={atualizarItem}
        onAddGrupo={adicionarGrupo}
        onRemoveGrupo={removerGrupo}
        onAddItem={adicionarItem}
        onRemoveItem={removerItem}
      />
    </div>
  )
}
