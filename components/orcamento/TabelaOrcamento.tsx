'use client'

import { Fragment, useRef, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fmt, fmtPct } from '@/lib/format'
import type { GrupoCalculado, TotaisGerais, TipoVisao } from '@/types/orcamento'
import type { Disciplina, UnidadeMedida } from '@/types/database'

interface Props {
  gruposCalculados: GrupoCalculado[]
  totais: TotaisGerais
  visao: TipoVisao
  obraId: string
  disciplinas: Pick<Disciplina, 'id' | 'nome'>[]
  unidades: Pick<UnidadeMedida, 'id' | 'sigla'>[]
  onUpdateItem: (grupoId: string, itemId: string, campo: string, valor: unknown) => Promise<void>
  onAddGrupo: (disciplina_id: string) => Promise<void>
  onRemoveGrupo: (grupoId: string) => Promise<void>
  onAddItem: (grupoId: string) => Promise<void>
  onRemoveItem: (grupoId: string, itemId: string) => Promise<void>
}

function CelulaEditavel({
  valor,
  tipo,
  className,
  onSave,
}: {
  valor: string | number
  tipo: 'text' | 'number'
  className?: string
  onSave: (v: string) => void
}) {
  const [editando, setEditando] = useState(false)
  const [draft, setDraft] = useState('')
  const canceladoRef = useRef(false)

  function abrir() {
    setDraft(String(valor))
    canceladoRef.current = false
    setEditando(true)
  }

  function confirmar() {
    if (canceladoRef.current) return
    onSave(draft)
    setEditando(false)
  }

  function cancelar() {
    canceladoRef.current = true
    setEditando(false)
  }

  if (editando) {
    return (
      <input
        type={tipo}
        value={draft}
        autoFocus
        className={`w-full border border-blue-400 rounded px-1 py-0 text-xs bg-white ${tipo === 'number' ? 'text-right' : ''} ${className ?? ''}`}
        onChange={e => setDraft(e.target.value)}
        onBlur={confirmar}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') cancelar()
        }}
      />
    )
  }

  return (
    <div
      onDoubleClick={abrir}
      className={`cursor-default hover:bg-blue-50 rounded px-1 select-none ${className ?? ''}`}
      title="Duplo clique para editar"
    >
      {tipo === 'number' ? fmt(Number(valor)) : String(valor || '—')}
    </div>
  )
}

export default function TabelaOrcamento({
  gruposCalculados,
  totais,
  visao,
  disciplinas,
  unidades,
  onUpdateItem,
  onAddGrupo,
  onRemoveGrupo,
  onAddItem,
  onRemoveItem,
}: Props) {
  const [adicionandoGrupo, setAdicionandoGrupo] = useState(false)
  const [disciplinaSelecionada, setDisciplinaSelecionada] = useState('')

  async function confirmarAdicionarGrupo() {
    if (!disciplinaSelecionada) return
    await onAddGrupo(disciplinaSelecionada)
    setAdicionandoGrupo(false)
    setDisciplinaSelecionada('')
  }

  const colsComercial = 11
  const colsTecnica = 14

  if (visao === 'comercial') {
    return (
      <div className="space-y-2">
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-gray-100 text-gray-600">
              <tr>
                <th className="px-2 py-2 text-left font-medium border-b border-gray-200 w-10">Item</th>
                <th className="px-2 py-2 text-left font-medium border-b border-gray-200 w-8">Nº</th>
                <th className="px-2 py-2 text-left font-medium border-b border-gray-200">Descrição</th>
                <th className="px-2 py-2 text-left font-medium border-b border-gray-200 w-32">Local</th>
                <th className="px-2 py-2 text-center font-medium border-b border-gray-200 w-16">UN</th>
                <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-16">QT</th>
                <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">P. Unit. MO</th>
                <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">P. Unit. Mat.</th>
                <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">Sub. MO</th>
                <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">Sub. Mat.</th>
                <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">Total</th>
                <th className="px-2 py-2 border-b border-gray-200 w-8" />
              </tr>
            </thead>
            <tbody>
              {gruposCalculados.map(grupo => (
                <Fragment key={grupo.id}>
                  <tr className="bg-gray-50 font-semibold text-gray-700">
                    <td className="px-2 py-1.5 border-b border-gray-200">{grupo.letra}</td>
                    <td className="px-2 py-1.5 border-b border-gray-200" />
                    <td className="px-2 py-1.5 border-b border-gray-200 uppercase">
                      {grupo.disciplinas?.nome ?? '—'}
                    </td>
                    <td colSpan={5} className="border-b border-gray-200" />
                    <td className="px-2 py-1.5 text-right border-b border-gray-200 font-mono">
                      {fmt(grupo.totais.subtotal_mao_obra_venda)}
                    </td>
                    <td className="px-2 py-1.5 text-right border-b border-gray-200 font-mono">
                      {fmt(grupo.totais.subtotal_material_venda)}
                    </td>
                    <td className="px-2 py-1.5 text-right border-b border-gray-200 font-mono">
                      {fmt(grupo.totais.total_venda)}
                    </td>
                    <td className="px-2 py-1.5 border-b border-gray-200 text-center">
                      <button
                        onClick={() => onRemoveGrupo(grupo.id)}
                        className="text-red-400 hover:text-red-600 font-bold"
                        title="Remover grupo"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                  {grupo.itens_calculados.map(item => (
                    <tr key={item.id} className="hover:bg-blue-50 border-b border-gray-100">
                      <td className="px-2 py-1 text-gray-400">{grupo.letra}</td>
                      <td className="px-2 py-1 text-gray-500">{item.numero}</td>
                      <td className="px-2 py-1">
                        <CelulaEditavel
                          valor={item.descricao}
                          tipo="text"
                          onSave={v => onUpdateItem(grupo.id, item.id, 'descricao', v)}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <CelulaEditavel
                          valor={item.local ?? ''}
                          tipo="text"
                          onSave={v => onUpdateItem(grupo.id, item.id, 'local', v || null)}
                        />
                      </td>
                      <td className="px-2 py-1 text-center">
                        <Select
                          value={item.unidade_id ?? ''}
                          onValueChange={v => onUpdateItem(grupo.id, item.id, 'unidade_id', (v ?? '') || null)}
                        >
                          <SelectTrigger className="h-6 text-xs">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">—</SelectItem>
                            {unidades.map(u => (
                              <SelectItem key={u.id} value={u.id}>{u.sigla}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1">
                        <CelulaEditavel
                          valor={item.quantidade}
                          tipo="number"
                          className="text-right"
                          onSave={v => onUpdateItem(grupo.id, item.id, 'quantidade', parseFloat(v) || 0)}
                        />
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-gray-500">
                        {fmt(item.preco_unit_mao_obra_venda)}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-gray-500">
                        {fmt(item.preco_unit_material_venda)}
                      </td>
                      <td className="px-2 py-1 text-right font-mono">{fmt(item.subtotal_mao_obra_venda)}</td>
                      <td className="px-2 py-1 text-right font-mono">{fmt(item.subtotal_material_venda)}</td>
                      <td className="px-2 py-1 text-right font-mono font-semibold">{fmt(item.total_venda)}</td>
                      <td className="px-2 py-1 text-center">
                        <button
                          onClick={() => onRemoveItem(grupo.id, item.id)}
                          className="text-red-300 hover:text-red-500"
                          title="Remover item"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={colsComercial + 1} className="px-2 py-1 border-b border-gray-100">
                      <button
                        onClick={() => onAddItem(grupo.id)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        + Adicionar item
                      </button>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
            <tfoot className="bg-gray-800 text-white font-semibold">
              <tr>
                <td colSpan={8} className="px-2 py-2 text-right uppercase text-xs tracking-wide">Total Geral</td>
                <td className="px-2 py-2 text-right font-mono">{fmt(totais.total_mao_obra_venda)}</td>
                <td className="px-2 py-2 text-right font-mono">{fmt(totais.total_material_venda)}</td>
                <td className="px-2 py-2 text-right font-mono">{fmt(totais.total_venda)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Adicionar grupo */}
        <div className="flex items-center gap-2">
          {adicionandoGrupo ? (
            <>
              <Select value={disciplinaSelecionada} onValueChange={v => setDisciplinaSelecionada(v ?? '')}>
                <SelectTrigger className="w-56 h-8 text-sm">
                  <SelectValue placeholder="Selecionar disciplina..." />
                </SelectTrigger>
                <SelectContent>
                  {disciplinas.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                onClick={confirmarAdicionarGrupo}
                className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Confirmar
              </button>
              <button
                onClick={() => { setAdicionandoGrupo(false); setDisciplinaSelecionada('') }}
                className="text-sm px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              onClick={() => setAdicionandoGrupo(true)}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              + Adicionar grupo
            </button>
          )}
        </div>
      </div>
    )
  }

  // Visão Técnica
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-gray-100 text-gray-600">
            <tr>
              <th className="px-2 py-2 text-left font-medium border-b border-gray-200 w-10">Item</th>
              <th className="px-2 py-2 text-left font-medium border-b border-gray-200 w-8">Nº</th>
              <th className="px-2 py-2 text-left font-medium border-b border-gray-200">Descrição</th>
              <th className="px-2 py-2 text-left font-medium border-b border-gray-200 w-28">Local</th>
              <th className="px-2 py-2 text-center font-medium border-b border-gray-200 w-16">UN</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-16">QT</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-22">Custo MO</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-22">Custo Mat.</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-22">Total Custo</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-16">Mg. MO%</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-16">Mg. Mat%</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-22">Total Venda</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-22">Lucro</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-16">Mg. Ef%</th>
              <th className="px-2 py-2 border-b border-gray-200 w-8" />
            </tr>
          </thead>
          <tbody>
            {gruposCalculados.map(grupo => (
              <Fragment key={grupo.id}>
                <tr className="bg-gray-50 font-semibold text-gray-700">
                  <td className="px-2 py-1.5 border-b border-gray-200">{grupo.letra}</td>
                  <td className="px-2 py-1.5 border-b border-gray-200" />
                  <td className="px-2 py-1.5 border-b border-gray-200 uppercase">
                    {grupo.disciplinas?.nome ?? '—'}
                  </td>
                  <td colSpan={5} className="border-b border-gray-200" />
                  <td className="px-2 py-1.5 text-right border-b border-gray-200 font-mono">
                    {fmt(grupo.totais.total_custo)}
                  </td>
                  <td colSpan={2} className="border-b border-gray-200" />
                  <td className="px-2 py-1.5 text-right border-b border-gray-200 font-mono">
                    {fmt(grupo.totais.total_venda)}
                  </td>
                  <td className="px-2 py-1.5 text-right border-b border-gray-200 font-mono">
                    {fmt(grupo.totais.lucro)}
                  </td>
                  <td className="border-b border-gray-200" />
                  <td className="px-2 py-1.5 border-b border-gray-200 text-center">
                    <button
                      onClick={() => onRemoveGrupo(grupo.id)}
                      className="text-red-400 hover:text-red-600 font-bold"
                    >
                      ×
                    </button>
                  </td>
                </tr>
                {grupo.itens_calculados.map(item => (
                  <tr key={item.id} className="hover:bg-blue-50 border-b border-gray-100">
                    <td className="px-2 py-1 text-gray-400">{grupo.letra}</td>
                    <td className="px-2 py-1 text-gray-500">{item.numero}</td>
                    <td className="px-2 py-1">
                      <CelulaEditavel
                        valor={item.descricao}
                        tipo="text"
                        onSave={v => onUpdateItem(grupo.id, item.id, 'descricao', v)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <CelulaEditavel
                        valor={item.local ?? ''}
                        tipo="text"
                        onSave={v => onUpdateItem(grupo.id, item.id, 'local', v || null)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Select
                        value={item.unidade_id ?? ''}
                        onValueChange={v => onUpdateItem(grupo.id, item.id, 'unidade_id', (v ?? '') || null)}
                      >
                        <SelectTrigger className="h-6 text-xs">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">—</SelectItem>
                          {unidades.map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.sigla}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1">
                      <CelulaEditavel
                        valor={item.quantidade}
                        tipo="number"
                        className="text-right"
                        onSave={v => onUpdateItem(grupo.id, item.id, 'quantidade', parseFloat(v) || 0)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <CelulaEditavel
                        valor={item.custo_unit_mao_obra}
                        tipo="number"
                        className="text-right"
                        onSave={v => onUpdateItem(grupo.id, item.id, 'custo_unit_mao_obra', parseFloat(v) || 0)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <CelulaEditavel
                        valor={item.custo_unit_material}
                        tipo="number"
                        className="text-right"
                        onSave={v => onUpdateItem(grupo.id, item.id, 'custo_unit_material', parseFloat(v) || 0)}
                      />
                    </td>
                    <td className="px-2 py-1 text-right font-mono">{fmt(item.total_custo)}</td>
                    <td className="px-2 py-1">
                      <CelulaEditavel
                        valor={item.margem_mao_obra_pct}
                        tipo="number"
                        className="text-right"
                        onSave={v => onUpdateItem(grupo.id, item.id, 'margem_mao_obra_pct', parseFloat(v) || 0)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <CelulaEditavel
                        valor={item.margem_material_pct}
                        tipo="number"
                        className="text-right"
                        onSave={v => onUpdateItem(grupo.id, item.id, 'margem_material_pct', parseFloat(v) || 0)}
                      />
                    </td>
                    <td className="px-2 py-1 text-right font-mono font-semibold">{fmt(item.total_venda)}</td>
                    <td className="px-2 py-1 text-right font-mono">{fmt(item.lucro)}</td>
                    <td className="px-2 py-1 text-right font-mono">{fmtPct(item.margem_efetiva_pct)}</td>
                    <td className="px-2 py-1 text-center">
                      <button
                        onClick={() => onRemoveItem(grupo.id, item.id)}
                        className="text-red-300 hover:text-red-500"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={colsTecnica + 1} className="px-2 py-1 border-b border-gray-100">
                    <button
                      onClick={() => onAddItem(grupo.id)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      + Adicionar item
                    </button>
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
          <tfoot className="bg-gray-800 text-white font-semibold">
            <tr>
              <td colSpan={8} className="px-2 py-2 text-right uppercase text-xs tracking-wide">Total Geral</td>
              <td className="px-2 py-2 text-right font-mono">{fmt(totais.total_custo)}</td>
              <td colSpan={2} />
              <td className="px-2 py-2 text-right font-mono">{fmt(totais.total_venda)}</td>
              <td className="px-2 py-2 text-right font-mono">{fmt(totais.lucro)}</td>
              <td className="px-2 py-2 text-right font-mono">{fmtPct(totais.margem_efetiva_pct)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Adicionar grupo */}
      <div className="flex items-center gap-2">
        {adicionandoGrupo ? (
          <>
            <Select value={disciplinaSelecionada} onValueChange={v => setDisciplinaSelecionada(v ?? '')}>
              <SelectTrigger className="w-56 h-8 text-sm">
                <SelectValue placeholder="Selecionar disciplina..." />
              </SelectTrigger>
              <SelectContent>
                {disciplinas.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              onClick={confirmarAdicionarGrupo}
              className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Confirmar
            </button>
            <button
              onClick={() => { setAdicionandoGrupo(false); setDisciplinaSelecionada('') }}
              className="text-sm px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            onClick={() => setAdicionandoGrupo(true)}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            + Adicionar grupo
          </button>
        )}
      </div>
    </div>
  )
}
