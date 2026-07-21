// components/usuarios/UsuarioModal.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTab, TabsPanel } from '@/components/ui/tabs'
import { PAPEL_LABELS } from '@/components/layout/Sidebar'
import { MATRIZ_PADRAO, type Permissao } from '@/lib/permissoes/matriz'
import type { Papel } from '@/types/database'

const PERMISSAO_LABELS: Record<Permissao, string> = {
  visualizar_dashboard: 'Visualizar dashboard',
  visualizar_indicadores: 'Visualizar indicadores',
  editar_clientes: 'Cadastrar/editar clientes',
  excluir_clientes: 'Excluir clientes',
  criar_obras: 'Criar obras',
  editar_obras: 'Editar obras',
  excluir_obras: 'Excluir obras',
  visualizar_custos: 'Visualizar custos',
  editar_custos: 'Editar custos',
  visualizar_margem: 'Visualizar margem',
  visualizar_lucro: 'Visualizar lucro',
  visualizar_banco_composicoes: 'Visualizar banco de composições',
  cadastrar_composicoes: 'Cadastrar composições',
  editar_composicoes: 'Editar composições',
  excluir_composicoes: 'Excluir composições',
  importar_planilhas: 'Importar planilhas',
  exportar_planilhas: 'Exportar planilhas',
  cadastrar_usuarios: 'Cadastrar usuários',
  editar_usuarios: 'Editar usuários',
  excluir_usuarios: 'Excluir usuários',
  alterar_permissoes: 'Alterar permissões',
  visualizar_auditoria: 'Visualizar auditoria',
  acessar_configuracoes: 'Acessar configurações',
  backup: 'Backup',
  restaurar_banco: 'Restaurar banco',
}

const GRUPOS_PERMISSOES: { titulo: string; permissoes: Permissao[] }[] = [
  { titulo: 'Geral', permissoes: ['visualizar_dashboard', 'visualizar_indicadores'] },
  { titulo: 'Clientes', permissoes: ['editar_clientes', 'excluir_clientes'] },
  { titulo: 'Obras', permissoes: ['criar_obras', 'editar_obras', 'excluir_obras'] },
  { titulo: 'Financeiro', permissoes: ['visualizar_custos', 'editar_custos', 'visualizar_margem', 'visualizar_lucro'] },
  { titulo: 'Composições', permissoes: ['visualizar_banco_composicoes', 'cadastrar_composicoes', 'editar_composicoes', 'excluir_composicoes'] },
  { titulo: 'Planilhas', permissoes: ['importar_planilhas', 'exportar_planilhas'] },
  { titulo: 'Usuários', permissoes: ['cadastrar_usuarios', 'editar_usuarios', 'excluir_usuarios', 'alterar_permissoes'] },
  { titulo: 'Sistema', permissoes: ['visualizar_auditoria', 'acessar_configuracoes', 'backup', 'restaurar_banco'] },
]

type FormDadosGerais = {
  nome: string
  email: string
  papel: Papel
  cargo: string
  departamento: string
  telefone: string
  ativo: boolean
}

const FORM_VAZIO: FormDadosGerais = {
  nome: '', email: '', papel: 'visitante', cargo: '', departamento: '', telefone: '', ativo: true,
}

interface Props {
  aberto: boolean
  onOpenChange: (v: boolean) => void
  usuarioId: string | null
  podeAlterarPermissoes: boolean
  onSalvo: () => void
}

export default function UsuarioModal({ aberto, onOpenChange, usuarioId, podeAlterarPermissoes, onSalvo }: Props) {
  const editando = usuarioId !== null
  const [form, setForm] = useState<FormDadosGerais>(FORM_VAZIO)
  const [permissoesAtivas, setPermissoesAtivas] = useState<Set<Permissao>>(new Set(['visualizar_dashboard']))
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    if (!usuarioId) return
    setCarregando(true)
    const res = await fetch(`/api/usuarios/${usuarioId}`)
    const data = await res.json()
    setCarregando(false)
    if (!res.ok) {
      setErro(data.error ?? 'Erro ao carregar usuário')
      return
    }
    setForm({
      nome: data.nome,
      email: data.email,
      papel: data.papel,
      cargo: data.cargo ?? '',
      departamento: data.departamento ?? '',
      telefone: data.telefone ?? '',
      ativo: data.ativo,
    })
    setPermissoesAtivas(new Set(data.permissoes as Permissao[]))
  }, [usuarioId])

  useEffect(() => {
    if (!aberto) return
    setErro('')
    if (editando) {
      carregar()
    } else {
      setForm(FORM_VAZIO)
      setPermissoesAtivas(new Set(['visualizar_dashboard']))
    }
  }, [aberto, editando, carregar])

  function alterarPapel(papel: Papel) {
    setForm(p => ({ ...p, papel }))
    // No modo criação, os switches partem sempre do padrão do papel escolhido
    // (não existe override ainda, pois o usuário nem foi criado).
    if (!editando) {
      setPermissoesAtivas(new Set(MATRIZ_PADRAO[papel]))
    }
  }

  async function salvar() {
    if (!form.nome.trim() || !form.email.trim()) {
      setErro('Nome e email são obrigatórios')
      return
    }
    setSalvando(true)
    setErro('')

    if (editando) {
      const res = await fetch(`/api/usuarios/${usuarioId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: form.nome.trim(),
          papel: form.papel,
          cargo: form.cargo.trim() || null,
          departamento: form.departamento.trim() || null,
          telefone: form.telefone.trim() || null,
          ativo: form.ativo,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSalvando(false)
        setErro(data.error ?? 'Erro ao salvar usuário')
        return
      }
      if (podeAlterarPermissoes) {
        const resPerm = await fetch(`/api/usuarios/${usuarioId}/permissoes`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissoes: Array.from(permissoesAtivas) }),
        })
        if (!resPerm.ok) {
          setSalvando(false)
          toast.error('Dados salvos, mas as permissões não puderam ser atualizadas.')
          onSalvo()
          onOpenChange(false)
          return
        }
      }
    } else {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: form.nome.trim(),
          email: form.email.trim(),
          papel: form.papel,
          cargo: form.cargo.trim() || null,
          departamento: form.departamento.trim() || null,
          telefone: form.telefone.trim() || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSalvando(false)
        setErro(data.error ?? 'Erro ao criar usuário')
        return
      }
      toast('Convite enviado por email')
    }

    setSalvando(false)
    onOpenChange(false)
    onSalvo()
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar usuário' : 'Novo usuário'}</DialogTitle>
        </DialogHeader>

        {carregando ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <Tabs defaultValue="dados-gerais">
            <TabsList>
              <TabsTab value="dados-gerais">Dados Gerais</TabsTab>
              <TabsTab value="permissoes" disabled={!podeAlterarPermissoes || !editando}>Permissões</TabsTab>
            </TabsList>

            <TabsPanel value="dados-gerais">
              <div className="space-y-4 py-2">
                <div className="space-y-1">
                  <Label htmlFor="nome">Nome completo *</Label>
                  <Input id="nome" value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email" type="email" value={form.email} disabled={editando}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="cargo">Cargo</Label>
                    <Input id="cargo" value={form.cargo} onChange={e => setForm(p => ({ ...p, cargo: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="departamento">Departamento</Label>
                    <Input id="departamento" value={form.departamento} onChange={e => setForm(p => ({ ...p, departamento: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="telefone">Telefone</Label>
                  <Input id="telefone" value={form.telefone} onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="papel">Perfil</Label>
                  <NativeSelect id="papel" value={form.papel} onChange={e => alterarPapel(e.target.value as Papel)}>
                    {(Object.keys(PAPEL_LABELS) as Papel[]).map(p => <option key={p} value={p}>{PAPEL_LABELS[p]}</option>)}
                  </NativeSelect>
                </div>
                {editando && (
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={form.ativo} onCheckedChange={ativo => setForm(p => ({ ...p, ativo }))} />
                    {form.ativo ? 'Ativo' : 'Inativo'}
                  </label>
                )}
              </div>
            </TabsPanel>

            <TabsPanel value="permissoes">
              <div className="max-h-80 space-y-4 overflow-y-auto py-2">
                {GRUPOS_PERMISSOES.map(grupo => (
                  <div key={grupo.titulo}>
                    <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{grupo.titulo}</p>
                    <div className="space-y-2">
                      {grupo.permissoes.map(permissao => (
                        <label key={permissao} className="flex items-center justify-between gap-3 text-sm">
                          {PERMISSAO_LABELS[permissao]}
                          <Switch
                            checked={permissoesAtivas.has(permissao)}
                            onCheckedChange={concedida => {
                              setPermissoesAtivas(prev => {
                                const novo = new Set(prev)
                                if (concedida) novo.add(permissao)
                                else novo.delete(permissao)
                                return novo
                              })
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </TabsPanel>
          </Tabs>
        )}

        {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || carregando}>
            {salvando ? 'Salvando...' : editando ? 'Salvar' : 'Convidar usuário'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
