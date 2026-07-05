'use client'

import { useState, useEffect, useCallback } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  rascunho: 'bg-gray-100 text-gray-700',
  enviado: 'bg-blue-100 text-blue-700',
  aprovado: 'bg-green-100 text-green-700',
  em_execucao: 'bg-yellow-100 text-yellow-700',
  concluido: 'bg-emerald-100 text-emerald-700',
  cancelado: 'bg-red-100 text-red-700',
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
      margem_mao_obra_pct: number
      margem_material_pct: number
    }[]
  }[]
}

type Cliente = { id: string; razao_social: string }

function calcularTotalVendaObra(obra: ObraItem): number {
  return obra.grupos_orcamento.flatMap(g => g.itens_orcamento).reduce((sum, item) => {
    const calc = calcularItem({
      id: '', grupo_id: '', numero: 0, descricao: '', local: null,
      unidade_id: null, observacao: null, observacao_2: null, ordem: 0,
      quantidade: item.quantidade,
      custo_unit_mao_obra: item.custo_unit_mao_obra,
      custo_unit_material: item.custo_unit_material,
      margem_mao_obra_pct: item.margem_mao_obra_pct,
      margem_material_pct: item.margem_material_pct,
    })
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

  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get('novo') === '1') abrirModal()
    // roda uma única vez na montagem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  return (
    <div className="p-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Obras</h1>
        <Button onClick={abrirModal}>+ Nova obra</Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-4">
        <Input
          placeholder="Buscar por código ou nome..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="max-w-sm"
        />
        <Select value={filtroStatus} onValueChange={v => setFiltroStatus(v ?? '')}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todos</SelectItem>
            {(Object.keys(STATUS_LABELS) as StatusObra[]).map(s => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      {carregando ? (
        <p className="text-gray-500">Carregando...</p>
      ) : obras.length === 0 ? (
        <p className="text-gray-500">Nenhuma obra encontrada.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium text-right">Total Venda</th>
              </tr>
            </thead>
            <tbody>
              {obras.map(obra => (
                <tr
                  key={obra.id}
                  onClick={() => router.push(`/obras/${obra.id}`)}
                  className="border-t border-gray-100 hover:bg-blue-50 cursor-pointer"
                >
                  <td className="px-4 py-3 font-mono text-xs">{obra.codigo}</td>
                  <td className="px-4 py-3 font-medium">{obra.nome}</td>
                  <td className="px-4 py-3 text-gray-600">{obra.clientes?.razao_social ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[obra.status]}`}>
                      {STATUS_LABELS[obra.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {obra.data_orcamento
                      ? new Date(obra.data_orcamento + 'T00:00:00').toLocaleDateString('pt-BR')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    R$ {fmt(calcularTotalVendaObra(obra))}
                  </td>
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
              <Label htmlFor="cliente">Cliente</Label>
              <Select
                value={novaObra.cliente_id}
                onValueChange={v => setNovaObra(prev => ({ ...prev, cliente_id: v ?? '' }))}
              >
                <SelectTrigger id="cliente">
                  <SelectValue placeholder="Selecionar cliente (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nenhum</SelectItem>
                  {clientes.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <Button onClick={criarObra} disabled={salvando}>
              {salvando ? 'Criando...' : 'Criar obra'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
