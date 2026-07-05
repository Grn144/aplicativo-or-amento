'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { StatusObra } from '@/types/database'

const STATUS_LABELS: Record<StatusObra, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
  em_execucao: 'Em execução',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

interface ObraCabecalho {
  id: string
  codigo: string
  nome: string
  status: StatusObra
  data_orcamento: string | null
  clientes: { id: string; razao_social: string } | null
}

interface Props {
  obra: ObraCabecalho
  clientes: { id: string; razao_social: string }[]
}

export default function CabecalhoObra({ obra, clientes }: Props) {
  const [campos, setCampos] = useState({
    codigo: obra.codigo,
    nome: obra.nome,
    status: obra.status,
    cliente_id: obra.clientes?.id ?? '',
    data_orcamento: obra.data_orcamento ?? '',
  })

  async function salvar(campo: string, valor: string | null) {
    const camposObrigatorios = ['codigo', 'nome']
    const valorFinal = typeof valor === 'string' ? valor.trim() || null : valor
    if (camposObrigatorios.includes(campo) && !valorFinal) return
    await fetch(`/api/obras/${obra.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [campo]: valorFinal }),
    })
  }

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Código</Label>
          <Input
            value={campos.codigo}
            onChange={e => setCampos(p => ({ ...p, codigo: e.target.value }))}
            onBlur={() => salvar('codigo', campos.codigo)}
            className="font-mono text-sm"
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs text-muted-foreground">Nome da obra</Label>
          <Input
            value={campos.nome}
            onChange={e => setCampos(p => ({ ...p, nome: e.target.value }))}
            onBlur={() => salvar('nome', campos.nome)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Cliente</Label>
          <Select
            value={campos.cliente_id}
            onValueChange={v => {
              setCampos(p => ({ ...p, cliente_id: v ?? '' }))
              salvar('cliente_id', v || null)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecionar..." />
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
          <Label className="text-xs text-muted-foreground">Data do orçamento</Label>
          <Input
            type="date"
            value={campos.data_orcamento}
            onChange={e => setCampos(p => ({ ...p, data_orcamento: e.target.value }))}
            onBlur={() => salvar('data_orcamento', campos.data_orcamento)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select
            value={campos.status}
            onValueChange={v => {
              const novo = (v ?? campos.status) as StatusObra
              setCampos(p => ({ ...p, status: novo }))
              salvar('status', novo)
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_LABELS) as StatusObra[]).map(s => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
