// components/composicoes/InserirComposicaoModal.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type { Composicao, ItemOrcamento, UnidadeMedida } from '@/types/database'

interface Props {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  obraId: string
  grupos: { id: string; letra: string; disciplinas?: { nome: string } | null }[]
  onInserido: (grupoId: string, item: ItemOrcamento & { unidades_medida?: UnidadeMedida | null }) => void
}

export default function InserirComposicaoModal({ aberto, onOpenChange, obraId, grupos, onInserido }: Props) {
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<Composicao[]>([])
  const [buscando, setBuscando] = useState(false)
  const [selecionada, setSelecionada] = useState<Composicao | null>(null)
  const [grupoDestinoId, setGrupoDestinoId] = useState(grupos[0]?.id ?? '')
  const [quantidade, setQuantidade] = useState('1')
  const [inserindo, setInserindo] = useState(false)
  const [erro, setErro] = useState('')

  const buscar = useCallback(async () => {
    setBuscando(true)
    try {
      const params = new URLSearchParams()
      if (busca.trim()) params.set('busca', busca.trim())
      const res = await fetch(`/api/composicoes?${params.toString()}`)
      if (!res.ok) {
        setResultados([])
        setErro('Não foi possível buscar composições. Tente novamente.')
        return
      }
      const data = await res.json()
      setResultados(Array.isArray(data) ? data : [])
    } finally {
      setBuscando(false)
    }
  }, [busca])

  useEffect(() => {
    if (!aberto) return
    setErro('')
    setSelecionada(null)
    setGrupoDestinoId(grupos[0]?.id ?? '')
    const timeout = setTimeout(buscar, 300)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, busca])

  async function inserir() {
    if (!selecionada) {
      setErro('Selecione uma composição')
      return
    }
    if (!grupoDestinoId) {
      setErro('Selecione o grupo de destino')
      return
    }
    const quantidadeNumero = Number(quantidade)
    if (!quantidadeNumero || quantidadeNumero <= 0) {
      setErro('Informe uma quantidade maior que zero')
      return
    }

    setInserindo(true)
    setErro('')
    const res = await fetch(`/api/obras/${obraId}/grupos/${grupoDestinoId}/itens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ composicao_id: selecionada.id, quantidade: quantidadeNumero }),
    })
    setInserindo(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setErro(data.error ?? 'Erro ao inserir composição')
      return
    }
    const novoItem = await res.json()
    onInserido(grupoDestinoId, novoItem)
    onOpenChange(false)
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-full max-w-xl overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Inserir composição no orçamento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="busca-composicao">Buscar composição</Label>
            <Input
              id="busca-composicao"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Nome, código ou descrição..."
            />
          </div>

          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border">
            {buscando ? (
              <p className="p-3 text-sm text-muted-foreground">Buscando...</p>
            ) : resultados.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Nenhuma composição encontrada.</p>
            ) : (
              resultados.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelecionada(c)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                    selecionada?.id === c.id ? 'bg-blue-600/10' : 'hover:bg-muted/50'
                  }`}
                >
                  <span>
                    <span className="font-mono text-xs text-muted-foreground">{c.codigo}</span> — {c.nome}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {c.custo_direto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </button>
              ))
            )}
          </div>

          {selecionada && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="grupo-destino">Grupo de destino</Label>
                <NativeSelect id="grupo-destino" value={grupoDestinoId} onChange={e => setGrupoDestinoId(e.target.value)}>
                  {grupos.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.letra} — {g.disciplinas?.nome ?? 'Sem disciplina'}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label htmlFor="quantidade">Quantidade</Label>
                <Input id="quantidade" type="number" step="0.0001" value={quantidade} onChange={e => setQuantidade(e.target.value)} />
              </div>
            </div>
          )}

          {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={inserir} disabled={inserindo || !selecionada}>
            {inserindo ? 'Inserindo...' : 'Inserir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
