'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Pencil, KeyRound, Ban, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { PAPEL_LABELS } from '@/components/layout/Sidebar'
import UsuarioModal from './UsuarioModal'
import type { Usuario, Papel } from '@/types/database'

type Coluna = 'nome' | 'email' | 'cargo' | 'departamento' | 'papel' | 'status' | 'criado_em'
const COLUNAS: { chave: Coluna; rotulo: string }[] = [
  { chave: 'nome', rotulo: 'Nome' },
  { chave: 'email', rotulo: 'Email' },
  { chave: 'cargo', rotulo: 'Cargo' },
  { chave: 'departamento', rotulo: 'Departamento' },
  { chave: 'papel', rotulo: 'Perfil' },
  { chave: 'status', rotulo: 'Status' },
  { chave: 'criado_em', rotulo: 'Criado em' },
]

function iniciaisDe(nome: string) {
  return nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('')
}

// Switch exaustivo (sem indexação dinâmica de Usuario[coluna]) — 'status' não é
// uma chave real do tipo Usuario (o campo é `ativo`), então acessar por índice
// dinâmico não tipa corretamente; cada coluna sabe explicitamente de onde vem.
function valorOrdenacao(u: Usuario, coluna: Coluna): string | number {
  switch (coluna) {
    case 'nome': return u.nome
    case 'email': return u.email
    case 'cargo': return u.cargo ?? ''
    case 'departamento': return u.departamento ?? ''
    case 'papel': return PAPEL_LABELS[u.papel]
    case 'status': return u.ativo ? 1 : 0
    case 'criado_em': return u.criado_em
  }
}

export default function UsuariosPageClient({ podeAlterarPermissoes }: { podeAlterarPermissoes: boolean }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [carregando, setCarregando] = useState(true)

  const [busca, setBusca] = useState('')
  const [filtroPapel, setFiltroPapel] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [ordem, setOrdem] = useState<{ coluna: Coluna; asc: boolean }>({ coluna: 'nome', asc: true })
  const [porPagina, setPorPagina] = useState(10)
  const [pagina, setPagina] = useState(0)

  const [modalAberto, setModalAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)

  const [desativando, setDesativando] = useState<Usuario | null>(null)
  const [salvandoStatus, setSalvandoStatus] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const res = await fetch('/api/usuarios')
    const data = await res.json()
    setUsuarios(Array.isArray(data) ? data : [])
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const filtrados = useMemo(() => {
    let r = usuarios
    if (filtroPapel) r = r.filter(u => u.papel === filtroPapel)
    if (filtroStatus) r = r.filter(u => (filtroStatus === 'ativo' ? u.ativo : !u.ativo))
    const t = busca.trim().toLowerCase()
    if (t) {
      r = r.filter(u => [u.nome, u.email, u.cargo ?? '', u.departamento ?? ''].some(v => v.toLowerCase().includes(t)))
    }
    const { coluna, asc } = ordem
    return [...r].sort((a, b) => {
      const va = valorOrdenacao(a, coluna)
      const vb = valorOrdenacao(b, coluna)
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR')
      return asc ? cmp : -cmp
    })
  }, [usuarios, busca, filtroPapel, filtroStatus, ordem])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina))
  const paginaAtual = Math.min(pagina, totalPaginas - 1)
  const visiveis = filtrados.slice(paginaAtual * porPagina, (paginaAtual + 1) * porPagina)

  function ordenarPor(coluna: Coluna) {
    setOrdem(o => (o.coluna === coluna ? { coluna, asc: !o.asc } : { coluna, asc: true }))
    setPagina(0)
  }

  function abrirNovo() {
    setEditandoId(null)
    setModalAberto(true)
  }
  function abrirEdicao(u: Usuario) {
    setEditandoId(u.id)
    setModalAberto(true)
  }

  async function resetarSenha(u: Usuario) {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u.email }),
    })
    if (!res.ok) {
      toast.error('Não foi possível enviar o link de redefinição.')
      return
    }
    toast(`Link de redefinição enviado para ${u.email}`)
  }

  async function alternarStatus(u: Usuario) {
    if (u.ativo) {
      setDesativando(u)
      return
    }
    await salvarStatus(u, true)
  }

  async function salvarStatus(u: Usuario, ativo: boolean) {
    setSalvandoStatus(true)
    const res = await fetch(`/api/usuarios/${u.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo }),
    })
    setSalvandoStatus(false)
    if (!res.ok) {
      toast.error(ativo ? 'Não foi possível reativar o usuário.' : 'Não foi possível desativar o usuário.')
      return
    }
    setUsuarios(prev => prev.map(x => (x.id === u.id ? { ...x, ativo } : x)))
    setDesativando(null)
    toast(ativo ? 'Usuário reativado' : 'Usuário desativado')
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Usuários</h1>
        <Button onClick={abrirNovo}>+ Novo Usuário</Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar por nome, email, cargo ou departamento..."
          value={busca}
          onChange={e => { setBusca(e.target.value); setPagina(0) }}
          className="max-w-sm"
        />
        <NativeSelect value={filtroPapel} onChange={e => { setFiltroPapel(e.target.value); setPagina(0) }} className="max-w-[180px]">
          <option value="">Todos os perfis</option>
          {(Object.keys(PAPEL_LABELS) as Papel[]).map(p => <option key={p} value={p}>{PAPEL_LABELS[p]}</option>)}
        </NativeSelect>
        <NativeSelect value={filtroStatus} onChange={e => { setFiltroStatus(e.target.value); setPagina(0) }} className="max-w-[150px]">
          <option value="">Todos os status</option>
          <option value="ativo">Ativos</option>
          <option value="inativo">Inativos</option>
        </NativeSelect>
        <NativeSelect value={String(porPagina)} onChange={e => { setPorPagina(Number(e.target.value)); setPagina(0) }} className="max-w-[140px]">
          <option value="10">10 por página</option>
          <option value="25">25 por página</option>
          <option value="50">50 por página</option>
        </NativeSelect>
      </div>

      {carregando ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : filtrados.length === 0 ? (
        <p className="text-muted-foreground">Nenhum usuário encontrado.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="w-10 px-4 py-3"></th>
                  {COLUNAS.map(c => (
                    <th key={c.chave} className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => ordenarPor(c.chave)} className="hover:text-foreground">
                        {c.rotulo}
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-3 font-medium text-center w-32">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map(u => (
                  <tr key={u.id} className="border-t border-border/50 hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <div className="flex size-8 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                        {iniciaisDe(u.nome)}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">{u.nome}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.cargo ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.departamento ?? '—'}</td>
                    <td className="px-4 py-3">{PAPEL_LABELS[u.papel]}</td>
                    <td className="px-4 py-3">
                      <Badge variant={u.ativo ? 'default' : 'destructive'}>{u.ativo ? 'Ativo' : 'Inativo'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(u.criado_em).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-1">
                        <button type="button" aria-label={`Editar ${u.nome}`} title="Editar"
                          onClick={() => abrirEdicao(u)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                          <Pencil className="size-4" />
                        </button>
                        <button type="button" aria-label={`Resetar senha de ${u.nome}`} title="Resetar senha"
                          onClick={() => resetarSenha(u)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                          <KeyRound className="size-4" />
                        </button>
                        {u.ativo ? (
                          <button type="button" aria-label={`Desativar ${u.nome}`} title="Desativar"
                            onClick={() => alternarStatus(u)}
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600">
                            <Ban className="size-4" />
                          </button>
                        ) : (
                          <button type="button" aria-label={`Reativar ${u.nome}`} title="Reativar"
                            onClick={() => alternarStatus(u)}
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-green-500/10 hover:text-green-600">
                            <CheckCircle2 className="size-4" />
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
            <span>Página {paginaAtual + 1} de {totalPaginas} · {filtrados.length} usuário(s)</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={paginaAtual === 0} onClick={() => setPagina(p => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={paginaAtual >= totalPaginas - 1} onClick={() => setPagina(p => p + 1)}>Próxima</Button>
            </div>
          </div>
        </>
      )}

      <UsuarioModal
        aberto={modalAberto}
        onOpenChange={setModalAberto}
        usuarioId={editandoId}
        podeAlterarPermissoes={podeAlterarPermissoes}
        onSalvo={carregar}
      />

      <Dialog open={desativando !== null} onOpenChange={aberto => !aberto && setDesativando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desativar usuário</DialogTitle>
          </DialogHeader>
          <p className="py-2 text-sm text-muted-foreground">
            Desativar <strong className="text-foreground">{desativando?.nome}</strong>? O login dele será bloqueado imediatamente.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDesativando(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={salvandoStatus}
              onClick={() => desativando && salvarStatus(desativando, false)}
            >
              {salvandoStatus ? 'Desativando...' : 'Desativar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
