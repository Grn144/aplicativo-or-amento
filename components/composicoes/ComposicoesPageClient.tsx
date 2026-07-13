'use client'

import { useState, useEffect, useCallback } from 'react'
import { Pencil, Trash2, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import ComposicaoModal from './ComposicaoModal'
import type { Composicao } from '@/types/database'

interface Props {
  disciplinas: { id: string; nome: string }[]
  unidades: { id: string; sigla: string }[]
}

export default function ComposicoesPageClient({ disciplinas, unidades }: Props) {
  const [composicoes, setComposicoes] = useState<Composicao[]>([])
  const [busca, setBusca] = useState('')
  const [disciplinaId, setDisciplinaId] = useState('')
  const [somenteFavoritos, setSomenteFavoritos] = useState(false)
  const [carregando, setCarregando] = useState(true)

  const [modalAberto, setModalAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState<Composicao | null>(null)
  const [removendo, setRemovendo] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const params = new URLSearchParams()
    if (busca.trim()) params.set('busca', busca.trim())
    if (disciplinaId) params.set('disciplina_id', disciplinaId)
    if (somenteFavoritos) params.set('favoritos', 'true')
    const res = await fetch(`/api/composicoes?${params.toString()}`)
    const data = await res.json()
    setComposicoes(Array.isArray(data) ? data : [])
    setCarregando(false)
  }, [busca, disciplinaId, somenteFavoritos])

  useEffect(() => {
    const timeout = setTimeout(carregar, 300)
    return () => clearTimeout(timeout)
  }, [carregar])

  function abrirNovo() {
    setEditandoId(null)
    setModalAberto(true)
  }
  function abrirEdicao(c: Composicao) {
    setEditandoId(c.id)
    setModalAberto(true)
  }

  async function alternarFavorito(c: Composicao) {
    setComposicoes(prev => prev.map(x => (x.id === c.id ? { ...x, favorito: !x.favorito } : x)))
    await fetch(`/api/composicoes/${c.id}/favorito`, { method: c.favorito ? 'DELETE' : 'POST' })
  }

  async function confirmarExclusao() {
    if (!excluindo) return
    setRemovendo(true)
    const res = await fetch(`/api/composicoes/${excluindo.id}`, { method: 'DELETE' })
    setRemovendo(false)
    if (!res.ok) {
      alert('Não foi possível excluir a composição.')
      return
    }
    setComposicoes(prev => prev.filter(c => c.id !== excluindo.id))
    setExcluindo(null)
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Composições</h1>
        <Button onClick={abrirNovo}>+ Nova composição</Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar por nome, código ou descrição..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="max-w-sm"
        />
        <NativeSelect value={disciplinaId} onChange={e => setDisciplinaId(e.target.value)} className="max-w-[200px]">
          <option value="">Todas as disciplinas</option>
          {disciplinas.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
        </NativeSelect>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={somenteFavoritos} onChange={e => setSomenteFavoritos(e.target.checked)} />
          Só favoritos
        </label>
      </div>

      {carregando ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : composicoes.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma composição encontrada.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="w-10 px-4 py-3"></th>
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Disciplina</th>
                <th className="px-4 py-3 font-medium">Unidade</th>
                <th className="px-4 py-3 font-medium text-right">Custo direto</th>
                <th className="px-4 py-3 font-medium text-right">Markup</th>
                <th className="px-4 py-3 font-medium text-center">Versão</th>
                <th className="w-24 px-4 py-3 font-medium text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {composicoes.map(c => (
                <tr key={c.id} className="border-t border-border/50 hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <button type="button" aria-label="Favoritar" onClick={() => alternarFavorito(c)}>
                      <Star className={`size-4 ${c.favorito ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{c.codigo}</td>
                  <td className="px-4 py-3 font-medium">{c.nome}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.disciplinas?.nome ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.unidades_medida?.sigla ?? '—'}</td>
                  <td className="px-4 py-3 text-right">{c.custo_direto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  <td className="px-4 py-3 text-right">{c.markup_sugerido}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">v{c.versao}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-1">
                      <button type="button" aria-label={`Editar ${c.nome}`} onClick={() => abrirEdicao(c)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                        <Pencil className="size-4" />
                      </button>
                      <button type="button" aria-label={`Excluir ${c.nome}`} onClick={() => setExcluindo(c)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ComposicaoModal
        aberto={modalAberto}
        onOpenChange={setModalAberto}
        composicaoId={editandoId}
        disciplinas={disciplinas}
        unidades={unidades}
        onSalvo={carregar}
      />

      <Dialog open={excluindo !== null} onOpenChange={aberto => !aberto && setExcluindo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir composição</DialogTitle>
          </DialogHeader>
          <p className="py-2 text-sm text-muted-foreground">
            Excluir a composição <strong className="text-foreground">{excluindo?.nome}</strong>?
            Itens já inseridos em orçamentos não são afetados.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExcluindo(null)}>Cancelar</Button>
            <Button onClick={confirmarExclusao} disabled={removendo} className="bg-red-600 text-white hover:bg-red-700">
              {removendo ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
