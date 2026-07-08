'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { fmt, fmtPct } from '@/lib/format'
import type { StatusObra } from '@/types/database'
import type { Rentabilidade } from '@/types/orcamento'

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
  fatores: { fee_fator: number; comissao_pct: number; imposto_pct: number }
  onFatorChange: (campo: 'fee_fator' | 'comissao_pct' | 'imposto_pct', valor: number) => void
  rentabilidade: Rentabilidade
}

export default function CabecalhoObra({ obra, clientes, fatores, onFatorChange, rentabilidade }: Props) {
  const [campos, setCampos] = useState({
    codigo: obra.codigo,
    nome: obra.nome,
    status: obra.status,
    cliente_id: obra.clientes?.id ?? '',
    data_orcamento: obra.data_orcamento ?? '',
  })
  const [fatoresTexto, setFatoresTexto] = useState({
    fee_fator: String(fatores.fee_fator),
    comissao_pct: String(fatores.comissao_pct),
    imposto_pct: String(fatores.imposto_pct),
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
          <NativeSelect
            value={campos.cliente_id}
            onChange={e => {
              const v = e.target.value
              setCampos(p => ({ ...p, cliente_id: v }))
              salvar('cliente_id', v || null)
            }}
          >
            <option value="">Nenhum</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id}>{c.razao_social}</option>
            ))}
          </NativeSelect>
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
          <NativeSelect
            value={campos.status}
            onChange={e => {
              const novo = e.target.value as StatusObra
              setCampos(p => ({ ...p, status: novo }))
              salvar('status', novo)
            }}
          >
            {(Object.keys(STATUS_LABELS) as StatusObra[]).map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-border">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">FEE</Label>
          <Input
            type="number"
            step="0.01"
            value={fatoresTexto.fee_fator}
            onChange={e => setFatoresTexto(p => ({ ...p, fee_fator: e.target.value }))}
            onBlur={() => onFatorChange('fee_fator', parseFloat(fatoresTexto.fee_fator) || 0)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Comissão %</Label>
          <Input
            type="number"
            step="0.01"
            value={fatoresTexto.comissao_pct}
            onChange={e => setFatoresTexto(p => ({ ...p, comissao_pct: e.target.value }))}
            onBlur={() => onFatorChange('comissao_pct', parseFloat(fatoresTexto.comissao_pct) || 0)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Imposto %</Label>
          <Input
            type="number"
            step="0.01"
            value={fatoresTexto.imposto_pct}
            onChange={e => setFatoresTexto(p => ({ ...p, imposto_pct: e.target.value }))}
            onBlur={() => onFatorChange('imposto_pct', parseFloat(fatoresTexto.imposto_pct) || 0)}
          />
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border p-4 mt-4">
        <h3 className="text-xs text-muted-foreground mb-3">Resumo de Rentabilidade</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Faturamento</Label>
            <p className="text-sm font-medium">R$ {fmt(rentabilidade.faturamento)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Comissão</Label>
            <p className="text-sm font-medium">R$ {fmt(rentabilidade.comissao)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Imposto</Label>
            <p className="text-sm font-medium">R$ {fmt(rentabilidade.imposto)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Custo</Label>
            <p className="text-sm font-medium">R$ {fmt(rentabilidade.custo_com_fee)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Líquido</Label>
            <p
              className={
                rentabilidade.liquido >= 0
                  ? 'text-sm font-semibold text-green-600 dark:text-green-400'
                  : 'text-sm font-semibold'
              }
            >
              R$ {fmt(rentabilidade.liquido)}
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Líquido %</Label>
            <p
              className={
                rentabilidade.liquido_pct !== null && rentabilidade.liquido_pct >= 0
                  ? 'text-sm font-semibold text-green-600 dark:text-green-400'
                  : 'text-sm font-semibold'
              }
            >
              {rentabilidade.liquido_pct === null ? '—' : fmtPct(rentabilidade.liquido_pct)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
