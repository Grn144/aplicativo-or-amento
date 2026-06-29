'use client'

import { useRef, useState } from 'react'
import { calcularGrupo, calcularTotaisGerais } from '@/lib/calculos'
import type { Cliente, Disciplina, GrupoOrcamento, ItemOrcamento, UnidadeMedida } from '@/types/database'
import type { GrupoCalculado, TotaisGerais } from '@/types/orcamento'
import CabecalhoObra from './CabecalhoObra'
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
  const [exportando, setExportando] = useState<'tecnico' | 'comercial' | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importandoGrupoId, setImportandoGrupoId] = useState<string | null>(null)

  const gruposCalculados: GrupoCalculado[] = grupos.map(g => calcularGrupo(g))
  const totais: TotaisGerais = calcularTotaisGerais(gruposCalculados)

  async function exportar(tipo: 'tecnico' | 'comercial') {
    setExportando(tipo)
    try {
      const res = await fetch(`/api/obras/${obra.id}/export?tipo=${tipo}`)
      if (!res.ok) { alert('Erro ao gerar exportação'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1]
        ?? `orcamento-${tipo}-${obra.codigo}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExportando(null)
    }
  }

  function iniciarImport(grupoId: string) {
    setImportandoGrupoId(grupoId)
    fileInputRef.current?.click()
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !importandoGrupoId) return
    e.target.value = ''

    const grupoId = importandoGrupoId
    setImportandoGrupoId(null)

    const form = new FormData()
    form.append('file', file)

    const res = await fetch(`/api/obras/${obra.id}/grupos/${grupoId}/import`, {
      method: 'POST',
      body: form,
    })
    const data = await res.json()

    if (!res.ok) {
      alert(`Erro ao importar: ${data.error}`)
      return
    }

    const itensImportados = data.itens as (ItemOrcamento & { unidades_medida?: UnidadeMedida | null })[]
    setGrupos(prev => prev.map(g =>
      g.id !== grupoId ? g : {
        ...g,
        itens_orcamento: [...g.itens_orcamento, ...itensImportados],
      }
    ))
    alert(`${data.importados} item(s) importado(s) com sucesso!`)
  }

  async function atualizarItem(grupoId: string, itemId: string, campo: string, valor: unknown) {
    const snapshot = grupos
    setGrupos(prev => prev.map(g =>
      g.id !== grupoId ? g : {
        ...g,
        itens_orcamento: g.itens_orcamento.map(item =>
          item.id !== itemId ? item : { ...item, [campo]: valor }
        ),
      }
    ))
    const res = await fetch(`/api/obras/${obra.id}/grupos/${grupoId}/itens/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [campo]: valor }),
    })
    if (!res.ok) setGrupos(snapshot)
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
      {/* Input oculto para importação de arquivo */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleImportFile}
      />

      <CabecalhoObra obra={obra} clientes={clientes} />

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Orçamento</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportar('tecnico')}
            disabled={exportando !== null}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {exportando === 'tecnico' ? 'Gerando...' : '↓ Exportar Técnico'}
          </button>
          <button
            onClick={() => exportar('comercial')}
            disabled={exportando !== null}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {exportando === 'comercial' ? 'Gerando...' : '↓ Exportar Comercial'}
          </button>
        </div>
      </div>

      <TabelaOrcamento
        gruposCalculados={gruposCalculados}
        totais={totais}
        visao="tecnica"
        obraId={obra.id}
        disciplinas={disciplinas}
        unidades={unidades}
        onUpdateItem={atualizarItem}
        onAddGrupo={adicionarGrupo}
        onRemoveGrupo={removerGrupo}
        onAddItem={adicionarItem}
        onRemoveItem={removerItem}
        onImportItens={iniciarImport}
      />
    </div>
  )
}
