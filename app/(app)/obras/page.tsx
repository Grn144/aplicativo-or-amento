'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { NativeSelect } from '@/components/ui/native-select'
import { Trash2 } from 'lucide-react'
import { calcularItem } from '@/lib/calculos'
import { fmt } from '@/lib/format'
import type { StatusObra } from '@/types/database'

const STATUS_LABELS: Record<StatusObra, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
  em_execucao: 'Em execução',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

const STATUS_COLORS: Record<StatusObra, string> = {
  rascunho: 'bg-gray-500/10 text-gray-600 dark:text-gray-300',
  enviado: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  aprovado: 'bg-green-500/10 text-green-600 dark:text-green-400',
  em_execucao: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  concluido: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  cancelado: 'bg-red-500/10 text-red-600 dark:text-red-400',
}

type ObraItem = {
  id: string
  codigo: string
  nome: string
  status: StatusObra
  data_orcamento: string | null
  clientes: { id: string; razao_social: string } | null
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

type Cliente = { id: string; razao_social: string }

function calcularTotalVendaObra(obra: ObraItem): number {
  return obra.grupos_orcamento.flatMap(g => g.itens_orcamento).reduce((sum, item) => {
    const calc = calcularItem({
      id: '', grupo_id: '', numero: 0, descricao: '', local: null,
      unidade_id: null, observacao: null, observacao_2: null, ordem: 0,
      fee_mao_obra: null, fee_material: null,
      composicao_id: null, composicao_versao: null,
      quantidade: item.quantidade,
      custo_unit_mao_obra: item.custo_unit_mao_obra,
      custo_unit_material: item.custo_unit_material,
      markup_mao_obra: item.markup_mao_obra,
      markup_material: item.markup_material,
    }, 1.02)
    return sum + calc.total_venda
  }, 0)
}

export default function ObrasPage() {
  const router = useRouter()
  const [obras, setObras] = useState<ObraItem[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [novaObra, setNovaObra] = useState({ codigo: '', nome: '', cliente_id: '', data_orcamento: '' })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [importando, setImportando] = useState(false)
  const [ehAdmin, setEhAdmin] = useState(false)
  const [excluindo, setExcluindo] = useState<ObraItem | null>(null)
  const [removendo, setRemovendo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get('novo') === '1') abrirModal()
    // Descobre o papel do usuário para exibir ações de administrador
    fetch('/api/usuarios/me')
      .then(r => (r.ok ? r.json() : null))
      .then(u => setEhAdmin(u?.papel === 'admin'))
      .catch(() => {})
    // roda uma única vez na montagem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function confirmarExclusao() {
    if (!excluindo) return
    setRemovendo(true)
    const res = await fetch(`/api/obras/${excluindo.id}`, { method: 'DELETE' })
    setRemovendo(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Não foi possível excluir o orçamento.')
      return
    }
    setObras(prev => prev.filter(o => o.id !== excluindo.id))
    setExcluindo(null)
  }

  const carregarObras = useCallback(async () => {
    setCarregando(true)
    const params = new URLSearchParams()
    if (busca) params.set('busca', busca)
    if (filtroStatus) params.set('status', filtroStatus)
    const res = await fetch(`/api/obras?${params}`)
    const data = await res.json()
    setObras(Array.isArray(data) ? data : [])
    setCarregando(false)
  }, [busca, filtroStatus])

  useEffect(() => {
    const t = setTimeout(carregarObras, 300)
    return () => clearTimeout(t)
  }, [carregarObras])

  async function abrirModal() {
    setModalAberto(true)
    setErro('')
    setNovaObra({ codigo: '', nome: '', cliente_id: '', data_orcamento: '' })
    if (clientes.length === 0) {
      const res = await fetch('/api/clientes')
      const data = await res.json()
      setClientes(Array.isArray(data) ? data : [])
    }
  }

  async function criarObra() {
    if (!novaObra.codigo.trim() || !novaObra.nome.trim()) {
      setErro('Código e nome são obrigatórios')
      return
    }
    if (!novaObra.cliente_id) {
      setErro('Selecione um cliente')
      return
    }
    setSalvando(true)
    setErro('')
    const res = await fetch('/api/obras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo: novaObra.codigo.trim(),
        nome: novaObra.nome.trim(),
        cliente_id: novaObra.cliente_id || null,
        data_orcamento: novaObra.data_orcamento || null,
      }),
    })
    const data = await res.json()
    setSalvando(false)
    if (!res.ok) { setErro(data.error ?? 'Erro ao criar obra'); return }
    setModalAberto(false)
    router.push(`/obras/${data.id}`)
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setImportando(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/obras/import', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        alert(`Erro ao importar: ${data.error}`)
        return
      }
      router.push(`/obras/${data.id}`)
    } finally {
      setImportando(false)
    }
  }

  return (
    <div className="p-6">
      {/* Input oculto para importação de planilha */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleImportFile}
      />

      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Obras</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importando}
          >
            {importando ? 'Importando...' : '↑ Importar planilha'}
          </Button>
          <Button onClick={abrirModal}>+ Nova obra</Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-4">
        <Input
          placeholder="Buscar por código ou nome..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="max-w-sm"
        />
        <NativeSelect value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="w-44">
          <option value="">Todos os status</option>
          {(Object.keys(STATUS_LABELS) as StatusObra[]).map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </NativeSelect>
      </div>

      {/* Tabela */}
      {carregando ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : obras.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma obra encontrada.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium text-right">Total Venda</th>
                {ehAdmin && <th className="px-4 py-3 font-medium text-center w-16">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {obras.map(obra => (
                <tr
                  key={obra.id}
                  onClick={() => router.push(`/obras/${obra.id}`)}
                  className="border-t border-border/50 hover:bg-muted/50 cursor-pointer"
                >
                  <td className="px-4 py-3 font-mono text-xs">{obra.codigo}</td>
                  <td className="px-4 py-3 font-medium">{obra.nome}</td>
                  <td className="px-4 py-3 text-muted-foreground">{obra.clientes?.razao_social ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[obra.status]}`}>
                      {STATUS_LABELS[obra.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {obra.data_orcamento
                      ? new Date(obra.data_orcamento + 'T00:00:00').toLocaleDateString('pt-BR')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    R$ {fmt(calcularTotalVendaObra(obra))}
                  </td>
                  {ehAdmin && (
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        aria-label={`Excluir orçamento ${obra.codigo}`}
                        title="Excluir orçamento"
                        onClick={e => { e.stopPropagation(); setExcluindo(obra) }}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Nova Obra */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova obra</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="codigo">Código *</Label>
              <Input
                id="codigo"
                value={novaObra.codigo}
                onChange={e => setNovaObra(prev => ({ ...prev, codigo: e.target.value }))}
                placeholder="Ex: 08114"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={novaObra.nome}
                onChange={e => setNovaObra(prev => ({ ...prev, nome: e.target.value }))}
                placeholder="Ex: UNILEVER - WT"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cliente">Cliente *</Label>
              <NativeSelect
                id="cliente"
                required
                value={novaObra.cliente_id}
                onChange={e => setNovaObra(prev => ({ ...prev, cliente_id: e.target.value }))}
              >
                <option value="" disabled>Selecione...</option>
                {clientes.map(c => (
                  <option key={c.id} value={c.id}>{c.razao_social}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="data">Data do orçamento</Label>
              <Input
                id="data"
                type="date"
                value={novaObra.data_orcamento}
                onChange={e => setNovaObra(prev => ({ ...prev, data_orcamento: e.target.value }))}
              />
            </div>
            {erro && <p className="text-sm text-red-600">{erro}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button onClick={criarObra} disabled={salvando || !novaObra.cliente_id}>
              {salvando ? 'Criando...' : 'Criar obra'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão (apenas administradores) */}
      <Dialog open={excluindo !== null} onOpenChange={aberto => !aberto && setExcluindo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir orçamento</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Excluir o orçamento <strong className="text-foreground">{excluindo?.codigo}</strong>
            {excluindo?.nome ? ` — ${excluindo.nome}` : ''}? Esta ação não pode ser desfeita e
            remove todos os grupos e itens do orçamento.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExcluindo(null)}>Cancelar</Button>
            <Button
              onClick={confirmarExclusao}
              disabled={removendo}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {removendo ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
