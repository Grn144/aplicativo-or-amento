'use client'

import { useState, useEffect, useCallback } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
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

type Cliente = {
  id: string
  razao_social: string
  cnpj: string | null
  endereco: string | null
}

type FormCliente = { razao_social: string; cnpj: string; endereco: string }

const FORM_VAZIO: FormCliente = { razao_social: '', cnpj: '', endereco: '' }

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)

  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [form, setForm] = useState<FormCliente>(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const [excluindo, setExcluindo] = useState<Cliente | null>(null)
  const [removendo, setRemovendo] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const res = await fetch('/api/clientes')
    const data = await res.json()
    setClientes(Array.isArray(data) ? data : [])
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const filtrados = clientes.filter(c => {
    const t = busca.trim().toLowerCase()
    if (!t) return true
    return [c.razao_social, c.cnpj ?? '', c.endereco ?? ''].some(v => v.toLowerCase().includes(t))
  })

  function abrirNovo() {
    setEditando(null)
    setForm(FORM_VAZIO)
    setErro('')
    setModalAberto(true)
  }

  function abrirEdicao(c: Cliente) {
    setEditando(c)
    setForm({ razao_social: c.razao_social, cnpj: c.cnpj ?? '', endereco: c.endereco ?? '' })
    setErro('')
    setModalAberto(true)
  }

  async function salvar() {
    if (!form.razao_social.trim()) {
      setErro('Razão social é obrigatória')
      return
    }
    setSalvando(true)
    setErro('')
    const url = editando ? `/api/clientes/${editando.id}` : '/api/clientes'
    const metodo = editando ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        razao_social: form.razao_social.trim(),
        cnpj: form.cnpj.trim() || null,
        endereco: form.endereco.trim() || null,
      }),
    })
    setSalvando(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setErro(data.error ?? 'Erro ao salvar cliente')
      return
    }
    setModalAberto(false)
    carregar()
  }

  async function confirmarExclusao() {
    if (!excluindo) return
    setRemovendo(true)
    const res = await fetch(`/api/clientes/${excluindo.id}`, { method: 'DELETE' })
    setRemovendo(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Não foi possível excluir o cliente.')
      return
    }
    setClientes(prev => prev.filter(c => c.id !== excluindo.id))
    setExcluindo(null)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <Button onClick={abrirNovo}>+ Novo cliente</Button>
      </div>

      <div className="mb-4">
        <Input
          placeholder="Buscar por razão social, CNPJ ou endereço..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {carregando ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : filtrados.length === 0 ? (
        <p className="text-muted-foreground">Nenhum cliente encontrado.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Razão social</th>
                <th className="px-4 py-3 font-medium">CNPJ</th>
                <th className="px-4 py-3 font-medium">Endereço</th>
                <th className="px-4 py-3 font-medium text-center w-24">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(c => (
                <tr key={c.id} className="border-t border-border/50 hover:bg-muted/50">
                  <td className="px-4 py-3 font-medium">{c.razao_social}</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{c.cnpj ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.endereco ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-1">
                      <button
                        type="button"
                        aria-label={`Editar ${c.razao_social}`}
                        title="Editar"
                        onClick={() => abrirEdicao(c)}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Excluir ${c.razao_social}`}
                        title="Excluir"
                        onClick={() => setExcluindo(c)}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600"
                      >
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

      {/* Modal criar/editar */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar cliente' : 'Novo cliente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="razao_social">Razão social *</Label>
              <Input
                id="razao_social"
                value={form.razao_social}
                onChange={e => setForm(p => ({ ...p, razao_social: e.target.value }))}
                placeholder="Ex: MAGALU - PAULISTA"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input
                id="cnpj"
                value={form.cnpj}
                onChange={e => setForm(p => ({ ...p, cnpj: e.target.value }))}
                placeholder="Ex: 12.345.678/0001-00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="endereco">Endereço</Label>
              <Input
                id="endereco"
                value={form.endereco}
                onChange={e => setForm(p => ({ ...p, endereco: e.target.value }))}
                placeholder="Ex: Alameda Santos, 2153"
              />
            </div>
            {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : editando ? 'Salvar' : 'Criar cliente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <Dialog open={excluindo !== null} onOpenChange={aberto => !aberto && setExcluindo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir cliente</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Excluir o cliente <strong className="text-foreground">{excluindo?.razao_social}</strong>?
            Esta ação não pode ser desfeita.
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
