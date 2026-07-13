// components/composicoes/ComposicaoModal.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { calcularCustoDireto } from '@/lib/composicoes/calculos'
import type { ComposicaoCompleta, ComposicaoVersao } from '@/types/database'

type MaterialForm = { descricao: string; quantidade: string; unidade_id: string; fornecedor: string; preco_unitario: string }
type MaoObraForm = { cargo: string; horas: string; custo_hora: string }

type FormComposicao = {
  codigo: string
  nome: string
  disciplina_id: string
  descricao_tecnica: string
  unidade_id: string
  produtividade: string
  markup_sugerido: string
  observacoes: string
  tags: string
}

const FORM_VAZIO: FormComposicao = {
  codigo: '', nome: '', disciplina_id: '', descricao_tecnica: '',
  unidade_id: '', produtividade: '', markup_sugerido: '1', observacoes: '', tags: '',
}

interface Props {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  composicaoId: string | null
  disciplinas: { id: string; nome: string }[]
  unidades: { id: string; sigla: string }[]
  onSalvo: () => void
}

export default function ComposicaoModal({ aberto, onOpenChange, composicaoId, disciplinas, unidades, onSalvo }: Props) {
  const [form, setForm] = useState<FormComposicao>(FORM_VAZIO)
  const [materiais, setMateriais] = useState<MaterialForm[]>([])
  const [maoDeObra, setMaoDeObra] = useState<MaoObraForm[]>([])
  const [versoes, setVersoes] = useState<ComposicaoVersao[]>([])
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    if (!composicaoId) {
      setForm(FORM_VAZIO)
      setMateriais([])
      setMaoDeObra([])
      setVersoes([])
      return
    }
    setCarregando(true)
    const [resComposicao, resVersoes] = await Promise.all([
      fetch(`/api/composicoes/${composicaoId}`),
      fetch(`/api/composicoes/${composicaoId}/versoes`),
    ])
    const composicao: ComposicaoCompleta = await resComposicao.json()
    const listaVersoes: ComposicaoVersao[] = await resVersoes.json()
    setForm({
      codigo: composicao.codigo,
      nome: composicao.nome,
      disciplina_id: composicao.disciplina_id ?? '',
      descricao_tecnica: composicao.descricao_tecnica,
      unidade_id: composicao.unidade_id ?? '',
      produtividade: composicao.produtividade ?? '',
      markup_sugerido: String(composicao.markup_sugerido),
      observacoes: composicao.observacoes ?? '',
      tags: (composicao.tags ?? []).join(', '),
    })
    setMateriais(
      composicao.composicao_materiais.map(m => ({
        descricao: m.descricao,
        quantidade: String(m.quantidade),
        unidade_id: m.unidade_id ?? '',
        fornecedor: m.fornecedor ?? '',
        preco_unitario: String(m.preco_unitario),
      }))
    )
    setMaoDeObra(
      composicao.composicao_mao_obra.map(m => ({
        cargo: m.cargo, horas: String(m.horas), custo_hora: String(m.custo_hora),
      }))
    )
    setVersoes(Array.isArray(listaVersoes) ? listaVersoes : [])
    setCarregando(false)
  }, [composicaoId])

  useEffect(() => {
    if (aberto) {
      setErro('')
      carregar()
    }
  }, [aberto, carregar])

  const custoDiretoPreview = calcularCustoDireto(
    materiais.map(m => ({ quantidade: Number(m.quantidade) || 0, preco_unitario: Number(m.preco_unitario) || 0 })),
    maoDeObra.map(m => ({ horas: Number(m.horas) || 0, custo_hora: Number(m.custo_hora) || 0 }))
  )

  function adicionarMaterial() {
    setMateriais(prev => [...prev, { descricao: '', quantidade: '', unidade_id: '', fornecedor: '', preco_unitario: '' }])
  }
  function removerMaterial(index: number) {
    setMateriais(prev => prev.filter((_, i) => i !== index))
  }
  function atualizarMaterial(index: number, campo: keyof MaterialForm, valor: string) {
    setMateriais(prev => prev.map((m, i) => (i === index ? { ...m, [campo]: valor } : m)))
  }

  function adicionarMaoDeObra() {
    setMaoDeObra(prev => [...prev, { cargo: '', horas: '', custo_hora: '' }])
  }
  function removerMaoDeObra(index: number) {
    setMaoDeObra(prev => prev.filter((_, i) => i !== index))
  }
  function atualizarMaoDeObra(index: number, campo: keyof MaoObraForm, valor: string) {
    setMaoDeObra(prev => prev.map((m, i) => (i === index ? { ...m, [campo]: valor } : m)))
  }

  async function salvar() {
    if (!form.codigo.trim() || !form.nome.trim() || !form.descricao_tecnica.trim()) {
      setErro('Código, nome e descrição técnica são obrigatórios')
      return
    }
    if (materiais.length === 0 && maoDeObra.length === 0) {
      setErro('Adicione ao menos um material ou item de mão de obra')
      return
    }

    setSalvando(true)
    setErro('')
    const payload = {
      codigo: form.codigo.trim(),
      nome: form.nome.trim(),
      disciplina_id: form.disciplina_id || null,
      descricao_tecnica: form.descricao_tecnica.trim(),
      unidade_id: form.unidade_id || null,
      produtividade: form.produtividade.trim() || null,
      markup_sugerido: Number(form.markup_sugerido) || 1,
      observacoes: form.observacoes.trim() || null,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      materiais: materiais.map(m => ({
        descricao: m.descricao.trim(),
        quantidade: Number(m.quantidade) || 0,
        unidade_id: m.unidade_id || null,
        fornecedor: m.fornecedor.trim() || null,
        preco_unitario: Number(m.preco_unitario) || 0,
      })),
      mao_obra: maoDeObra.map(m => ({
        cargo: m.cargo.trim(),
        horas: Number(m.horas) || 0,
        custo_hora: Number(m.custo_hora) || 0,
      })),
    }

    const url = composicaoId ? `/api/composicoes/${composicaoId}` : '/api/composicoes'
    const metodo = composicaoId ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSalvando(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setErro(data.error ?? 'Erro ao salvar composição')
      return
    }
    onOpenChange(false)
    onSalvo()
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-full max-w-2xl overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{composicaoId ? 'Editar composição' : 'Nova composição'}</DialogTitle>
        </DialogHeader>

        {carregando ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <div className="space-y-6 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="codigo">Código *</Label>
                <Input id="codigo" value={form.codigo} onChange={e => setForm(p => ({ ...p, codigo: e.target.value }))} placeholder="Ex: 1024" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="nome">Nome *</Label>
                <Input id="nome" value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Instalação de câmera IP" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="disciplina">Disciplina</Label>
                <NativeSelect id="disciplina" value={form.disciplina_id} onChange={e => setForm(p => ({ ...p, disciplina_id: e.target.value }))}>
                  <option value="">—</option>
                  {disciplinas.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label htmlFor="unidade">Unidade</Label>
                <NativeSelect id="unidade" value={form.unidade_id} onChange={e => setForm(p => ({ ...p, unidade_id: e.target.value }))}>
                  <option value="">—</option>
                  {unidades.map(u => <option key={u.id} value={u.id}>{u.sigla}</option>)}
                </NativeSelect>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="descricao_tecnica">Descrição técnica *</Label>
              <Textarea
                id="descricao_tecnica"
                value={form.descricao_tecnica}
                onChange={e => setForm(p => ({ ...p, descricao_tecnica: e.target.value }))}
                placeholder="Ex: Instalação, configuração, alinhamento, testes e entrega operacional da câmera IP conforme normas técnicas e projeto executivo."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label htmlFor="produtividade">Produtividade</Label>
                <Input id="produtividade" value={form.produtividade} onChange={e => setForm(p => ({ ...p, produtividade: e.target.value }))} placeholder="Ex: 0,5 m²/h" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="markup">Markup sugerido</Label>
                <Input id="markup" type="number" step="0.01" value={form.markup_sugerido} onChange={e => setForm(p => ({ ...p, markup_sugerido: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tags">Tags (separadas por vírgula)</Label>
                <Input id="tags" value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))} placeholder="Ex: cftv, infra" />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea id="observacoes" value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} rows={2} />
            </div>

            {/* Materiais */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Materiais</h3>
                <Button type="button" variant="ghost" size="sm" onClick={adicionarMaterial}>
                  <Plus className="size-4" /> Adicionar material
                </Button>
              </div>
              {materiais.map((m, i) => (
                <div key={i} className="grid grid-cols-12 items-end gap-2 rounded-lg border border-border p-2">
                  <div className="col-span-4 space-y-1">
                    <Label className="text-xs">Descrição</Label>
                    <Input value={m.descricao} onChange={e => atualizarMaterial(i, 'descricao', e.target.value)} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Qtd.</Label>
                    <Input type="number" step="0.0001" value={m.quantidade} onChange={e => atualizarMaterial(i, 'quantidade', e.target.value)} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Unidade</Label>
                    <NativeSelect value={m.unidade_id} onChange={e => atualizarMaterial(i, 'unidade_id', e.target.value)}>
                      <option value="">—</option>
                      {unidades.map(u => <option key={u.id} value={u.id}>{u.sigla}</option>)}
                    </NativeSelect>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Fornecedor</Label>
                    <Input value={m.fornecedor} onChange={e => atualizarMaterial(i, 'fornecedor', e.target.value)} />
                  </div>
                  <div className="col-span-1 space-y-1">
                    <Label className="text-xs">Preço unit.</Label>
                    <Input type="number" step="0.0001" value={m.preco_unitario} onChange={e => atualizarMaterial(i, 'preco_unitario', e.target.value)} />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button type="button" aria-label="Remover material" onClick={() => removerMaterial(i)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Mão de obra */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Mão de obra</h3>
                <Button type="button" variant="ghost" size="sm" onClick={adicionarMaoDeObra}>
                  <Plus className="size-4" /> Adicionar cargo
                </Button>
              </div>
              {maoDeObra.map((m, i) => (
                <div key={i} className="grid grid-cols-12 items-end gap-2 rounded-lg border border-border p-2">
                  <div className="col-span-6 space-y-1">
                    <Label className="text-xs">Cargo</Label>
                    <Input value={m.cargo} onChange={e => atualizarMaoDeObra(i, 'cargo', e.target.value)} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Horas (por unid.)</Label>
                    <Input type="number" step="0.0001" value={m.horas} onChange={e => atualizarMaoDeObra(i, 'horas', e.target.value)} />
                  </div>
                  <div className="col-span-3 space-y-1">
                    <Label className="text-xs">Custo-hora</Label>
                    <Input type="number" step="0.0001" value={m.custo_hora} onChange={e => atualizarMaoDeObra(i, 'custo_hora', e.target.value)} />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button type="button" aria-label="Remover cargo" onClick={() => removerMaoDeObra(i)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-sm font-medium">
              Custo direto (por 1 unidade): {custoDiretoPreview.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>

            {versoes.length > 0 && (
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Histórico de versões</h3>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {versoes.map(v => (
                    <li key={v.id}>
                      v{v.versao} — {v.usuarios?.nome ?? 'usuário removido'} — {new Date(v.criado_em).toLocaleString('pt-BR')}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {erro && <p className="text-sm text-red-600">{erro}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || carregando}>
            {salvando ? 'Salvando...' : composicaoId ? 'Salvar' : 'Criar composição'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
