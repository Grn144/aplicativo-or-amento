'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowUpDown, Eye, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { STATUS_LABELS, type LinhaOrcamento } from '@/lib/dashboard/metricas'
import { fmt } from '@/lib/format'
import type { StatusObra } from '@/types/database'

const BADGE: Record<StatusObra, string> = {
  rascunho: 'bg-gray-500/10 text-gray-600 dark:text-gray-300',
  enviado: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  aprovado: 'bg-green-500/10 text-green-600 dark:text-green-400',
  em_execucao: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  concluido: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  cancelado: 'bg-red-500/10 text-red-600 dark:text-red-400',
}

type Coluna = 'codigo' | 'cliente' | 'obra' | 'responsavel' | 'valor' | 'data' | 'status'
const COLUNAS: { chave: Coluna; rotulo: string; classe?: string }[] = [
  { chave: 'codigo', rotulo: 'Número' },
  { chave: 'cliente', rotulo: 'Cliente' },
  { chave: 'obra', rotulo: 'Obra' },
  { chave: 'responsavel', rotulo: 'Responsável' },
  { chave: 'valor', rotulo: 'Valor', classe: 'text-right' },
  { chave: 'data', rotulo: 'Data' },
  { chave: 'status', rotulo: 'Status' },
]

const POR_PAGINA = 10

export function TabelaUltimosOrcamentos({
  linhas, podeExcluir,
}: { linhas: LinhaOrcamento[]; podeExcluir: boolean }) {
  const router = useRouter()
  const busca = (useSearchParams().get('busca') ?? '').toLowerCase()
  const [ordem, setOrdem] = useState<{ coluna: Coluna; asc: boolean }>({ coluna: 'data', asc: false })
  const [filtroStatus, setFiltroStatus] = useState('')
  const [pagina, setPagina] = useState(0)
  const [excluindo, setExcluindo] = useState<LinhaOrcamento | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    setPagina(0)
  }, [busca])

  const filtradas = useMemo(() => {
    let r = linhas
    if (filtroStatus) r = r.filter(l => l.status === filtroStatus)
    if (busca) {
      r = r.filter(l =>
        [l.codigo, l.cliente, l.obra, l.responsavel].some(c => c.toLowerCase().includes(busca))
      )
    }
    const { coluna, asc } = ordem
    return [...r].sort((a, b) => {
      const va = a[coluna] ?? ''
      const vb = b[coluna] ?? ''
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'pt-BR')
      return asc ? cmp : -cmp
    })
  }, [linhas, filtroStatus, busca, ordem])

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas - 1)
  const visiveis = filtradas.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA)

  function ordenarPor(coluna: Coluna) {
    setOrdem(o => (o.coluna === coluna ? { coluna, asc: !o.asc } : { coluna, asc: false }))
    setPagina(0)
  }

  async function confirmarExclusao() {
    if (!excluindo) return
    setSalvando(true)
    const res = await fetch(`/api/obras/${excluindo.id}`, { method: 'DELETE' })
    setSalvando(false)
    if (!res.ok) {
      toast.error('Não foi possível excluir o orçamento')
      return
    }
    setExcluindo(null)
    toast('Orçamento excluído')
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Últimos Orçamentos</h2>
        <select
          aria-label="Filtrar por status"
          value={filtroStatus}
          onChange={e => { setFiltroStatus(e.target.value); setPagina(0) }}
          className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
        >
          <option value="">Todos os status</option>
          {(Object.keys(STATUS_LABELS) as StatusObra[]).map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {filtradas.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhum orçamento encontrado neste período.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  {COLUNAS.map(c => (
                    <th key={c.chave} className={`px-3 py-2 font-medium ${c.classe ?? ''}`}>
                      <button
                        type="button"
                        onClick={() => ordenarPor(c.chave)}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {c.rotulo}
                        <ArrowUpDown className="size-3" aria-hidden="true" />
                      </button>
                    </th>
                  ))}
                  <th className="px-3 py-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map(l => (
                  <tr key={l.id} className="border-b border-border/50 transition-colors hover:bg-muted/50">
                    <td className="px-3 py-2.5 font-mono text-xs">{l.codigo}</td>
                    <td className="px-3 py-2.5">{l.cliente}</td>
                    <td className="max-w-48 truncate px-3 py-2.5 font-medium" title={l.obra}>{l.obra}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{l.responsavel}</td>
                    <td className="px-3 py-2.5 text-right font-mono">R$ {fmt(l.valor)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {l.data ? new Date(l.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[l.status]}`}>
                        {STATUS_LABELS[l.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
                        <button type="button" aria-label={`Visualizar ${l.codigo}`} title="Visualizar"
                          onClick={() => router.push(`/obras/${l.id}`)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                          <Eye className="size-4" />
                        </button>
                        <button type="button" aria-label={`Editar ${l.codigo}`} title="Editar"
                          onClick={() => router.push(`/obras/${l.id}`)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                          <Pencil className="size-4" />
                        </button>
                        {podeExcluir && (
                          <button type="button" aria-label={`Excluir ${l.codigo}`} title="Excluir"
                            onClick={() => setExcluindo(l)}
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600">
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>Página {paginaAtual + 1} de {totalPaginas} · {filtradas.length} orçamentos</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={paginaAtual === 0}
                onClick={() => setPagina(p => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={paginaAtual >= totalPaginas - 1}
                onClick={() => setPagina(p => p + 1)}>Próxima</Button>
            </div>
          </div>
        </>
      )}

      <Dialog open={excluindo !== null} onOpenChange={aberto => !aberto && setExcluindo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir orçamento</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Excluir o orçamento <strong>{excluindo?.codigo}</strong> ({excluindo?.obra})?
            Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExcluindo(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmarExclusao} disabled={salvando}>
              {salvando ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
