'use client'

import { useRef, useState } from 'react'
import { calcularGrupo, calcularRentabilidade, calcularTotaisGerais } from '@/lib/calculos'
import { calcularAlertasOrcamento, type EstatisticaComposicao } from '@/lib/orcamento/alertas'
import type { Cliente, Disciplina, GrupoOrcamento, ItemOrcamento, UnidadeMedida } from '@/types/database'
import type { GrupoCalculado, TotaisGerais } from '@/types/orcamento'
import InserirComposicaoModal from '@/components/composicoes/InserirComposicaoModal'
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
  fee_fator?: number
  comissao_valor?: number
  imposto_valor?: number
  clientes: { id: string; razao_social: string } | null
  grupos_orcamento: GrupoComItens[]
}

interface Props {
  obra: ObraParaEditor
  clientes: Pick<Cliente, 'id' | 'razao_social'>[]
  disciplinas: Pick<Disciplina, 'id' | 'nome'>[]
  unidades: Pick<UnidadeMedida, 'id' | 'sigla'>[]
  estatisticasHistoricas: Record<string, EstatisticaComposicao>
}

export default function EditorOrcamento({ obra, clientes, disciplinas, unidades, estatisticasHistoricas }: Props) {
  const [grupos, setGrupos] = useState<GrupoComItens[]>(
    obra.grupos_orcamento.map(g => ({ ...g, itens_orcamento: g.itens_orcamento ?? [] }))
  )
  const [exportando, setExportando] = useState<'tecnico' | 'comercial' | null>(null)
  const [importando, setImportando] = useState(false)
  const [modalComposicaoAberto, setModalComposicaoAberto] = useState(false)
  const [disciplinasList, setDisciplinasList] = useState(disciplinas)
  const [unidadesList, setUnidadesList] = useState(unidades)
  const [fatores, setFatores] = useState({
    fee_fator: obra.fee_fator ?? 1.02,
    comissao_valor: obra.comissao_valor ?? 0,
    imposto_valor: obra.imposto_valor ?? 0,
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const feeFator = fatores.fee_fator
  const gruposCalculados: GrupoCalculado[] = grupos.map(g => calcularGrupo(g, feeFator))
  const totais: TotaisGerais = calcularTotaisGerais(gruposCalculados)
  const rentabilidade = calcularRentabilidade(gruposCalculados, fatores)
  const alertasPorItem = calcularAlertasOrcamento(
    grupos.flatMap(g => g.itens_orcamento),
    estatisticasHistoricas
  )

  async function salvarFator(campo: 'fee_fator' | 'comissao_valor' | 'imposto_valor', valor: number) {
    const snapshot = fatores
    setFatores(prev => ({ ...prev, [campo]: valor }))
    const res = await fetch(`/api/obras/${obra.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [campo]: valor }),
    })
    if (!res.ok) {
      setFatores(snapshot)
      alert('Não foi possível salvar o fator. Tente novamente.')
    }
  }

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

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setImportando(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/obras/${obra.id}/import`, { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        alert(`Erro ao importar: ${data.error}`)
        return
      }
      const gruposAtualizados = (data.grupos as GrupoComItens[]).map(g => ({
        ...g,
        itens_orcamento: g.itens_orcamento ?? [],
      }))
      setGrupos(gruposAtualizados)
      // Mescla eventuais disciplinas novas na lista do datalist
      const nomes = new Set(disciplinasList.map(d => d.id))
      const novas = gruposAtualizados
        .map(g => g.disciplinas)
        .filter((d): d is NonNullable<typeof d> => !!d && !nomes.has(d.id))
        .map(d => ({ id: d.id, nome: d.nome }))
      if (novas.length > 0) {
        setDisciplinasList(prev =>
          [...prev, ...novas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
        )
      }
      alert(`${data.itens} item(s) em ${data.disciplinas} disciplina(s) importados!`)
    } finally {
      setImportando(false)
    }
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

  async function adicionarDisciplina(nome: string) {
    const res = await fetch(`/api/obras/${obra.id}/grupos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disciplina_nome: nome }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(`Erro ao adicionar disciplina: ${data.error ?? 'tente novamente'}`)
      return
    }
    const novoGrupo = await res.json()
    setGrupos(prev => [...prev, { ...novoGrupo, itens_orcamento: novoGrupo.itens_orcamento ?? [] }])
    // Registra a disciplina no datalist se for nova
    const d = novoGrupo.disciplinas as { id: string; nome: string } | null
    if (d && !disciplinasList.some(x => x.id === d.id)) {
      setDisciplinasList(prev =>
        [...prev, { id: d.id, nome: d.nome }].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      )
    }
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

  function itemInseridoPorComposicao(grupoId: string, novoItem: ItemOrcamento & { unidades_medida?: UnidadeMedida | null }) {
    setGrupos(prev => prev.map(g =>
      g.id !== grupoId ? g : {
        ...g,
        itens_orcamento: [...g.itens_orcamento, novoItem],
      }
    ))
  }

  async function converterItemParaComposicao(grupoId: string, itemId: string, composicaoId: string, quantidade: number) {
    // Insere a nova composição primeiro, remove a manual depois: se a
    // remoção falhar, sobra um item manual duplicado (recuperável — o
    // usuário só precisa apagar manualmente), o que é bem melhor do que
    // perder o item se a ordem fosse invertida e o insert falhasse depois
    // do delete. Mesmo princípio de tolerância a escrita não-transacional
    // já aceito em outros fluxos do projeto (ex.: criarComposicao).
    const resInsercao = await fetch(`/api/obras/${obra.id}/grupos/${grupoId}/itens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ composicao_id: composicaoId, quantidade }),
    })
    if (!resInsercao.ok) {
      alert('Não foi possível inserir a composição selecionada.')
      return
    }
    const novoItem = await resInsercao.json()
    await fetch(`/api/obras/${obra.id}/grupos/${grupoId}/itens/${itemId}`, { method: 'DELETE' })
    setGrupos(prev => prev.map(g =>
      g.id !== grupoId ? g : {
        ...g,
        itens_orcamento: [...g.itens_orcamento.filter(it => it.id !== itemId), novoItem],
      }
    ))
  }

  async function atualizarUnidade(grupoId: string, itemId: string, sigla: string) {
    const res = await fetch(`/api/obras/${obra.id}/grupos/${grupoId}/itens/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unidade_sigla: sigla }),
    })
    if (!res.ok) return
    const atualizado = await res.json() as ItemOrcamento & { unidades_medida?: UnidadeMedida | null }
    setGrupos(prev => prev.map(g =>
      g.id !== grupoId ? g : {
        ...g,
        itens_orcamento: g.itens_orcamento.map(it => (it.id !== itemId ? it : atualizado)),
      }
    ))
    const u = atualizado.unidades_medida
    if (u && !unidadesList.some(x => x.id === u.id)) {
      setUnidadesList(prev =>
        [...prev, { id: u.id, sigla: u.sigla }].sort((a, b) => a.sigla.localeCompare(b.sigla, 'pt-BR'))
      )
    }
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

      <CabecalhoObra
        obra={obra}
        clientes={clientes}
        fatores={fatores}
        onFatorChange={salvarFator}
        rentabilidade={rentabilidade}
      />

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Orçamento</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModalComposicaoAberto(true)}
            disabled={grupos.length === 0}
            className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 transition-colors"
            title={grupos.length === 0 ? 'Adicione uma disciplina primeiro' : undefined}
          >
            + Inserir Composição
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importando}
            className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {importando ? 'Importando...' : '↑ Importar Planilha'}
          </button>
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
        disciplinas={disciplinasList}
        unidades={unidadesList}
        alertasPorItem={alertasPorItem}
        onUpdateItem={atualizarItem}
        onUpdateUnidade={atualizarUnidade}
        onAddDisciplina={adicionarDisciplina}
        onRemoveGrupo={removerGrupo}
        onAddItem={adicionarItem}
        onRemoveItem={removerItem}
        onConverterParaComposicao={converterItemParaComposicao}
      />

      <InserirComposicaoModal
        aberto={modalComposicaoAberto}
        onOpenChange={setModalComposicaoAberto}
        obraId={obra.id}
        grupos={grupos.map(g => ({ id: g.id, letra: g.letra, disciplinas: g.disciplinas }))}
        onInserido={itemInseridoPorComposicao}
      />
    </div>
  )
}
