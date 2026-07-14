'use client'

import { Fragment, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { fmt, fmtPct } from '@/lib/format'
import type { GrupoCalculado, TotaisGerais, TipoVisao } from '@/types/orcamento'
import type { Disciplina, UnidadeMedida } from '@/types/database'
import { ListaSugestoesSemelhantes } from '@/components/composicoes/ListaSugestoesSemelhantes'

interface Props {
  gruposCalculados: GrupoCalculado[]
  totais: TotaisGerais
  visao: TipoVisao
  obraId: string
  disciplinas: Pick<Disciplina, 'id' | 'nome'>[]
  unidades: Pick<UnidadeMedida, 'id' | 'sigla'>[]
  onUpdateItem: (grupoId: string, itemId: string, campo: string, valor: unknown) => Promise<void>
  onUpdateUnidade: (grupoId: string, itemId: string, sigla: string) => Promise<void>
  onAddDisciplina: (nome: string) => Promise<void>
  onRemoveGrupo: (grupoId: string) => Promise<void>
  onAddItem: (grupoId: string) => Promise<void>
  onRemoveItem: (grupoId: string, itemId: string) => Promise<void>
  onConverterParaComposicao: (grupoId: string, itemId: string, composicaoId: string, quantidade: number) => Promise<void>
}

function CelulaEditavel({
  valor,
  tipo,
  className,
  onSave,
}: {
  valor: string | number | null
  tipo: 'text' | 'number'
  className?: string
  onSave: (v: string) => void
}) {
  const [editando, setEditando] = useState(false)
  const [draft, setDraft] = useState('')
  const canceladoRef = useRef(false)

  function abrir() {
    setDraft(valor === null ? '' : String(valor))
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
        className={`w-full border border-ring rounded px-1 py-0 text-xs bg-background ${tipo === 'number' ? 'text-right' : ''} ${className ?? ''}`}
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
      className={`cursor-text hover:bg-muted/50 rounded px-1 min-h-[1.25rem] select-none ${className ?? ''}`}
      title="Duplo clique para editar"
    >
      {tipo === 'number'
        ? (valor === null || valor === '' ? '—' : fmt(Number(valor)))
        : String(valor || '—')}
    </div>
  )
}

function itemDesatualizado(item: {
  composicao_id: string | null
  composicao_versao: number | null
  composicoes?: { versao: number } | null
}): boolean {
  return (
    !!item.composicao_id &&
    item.composicao_versao != null &&
    item.composicoes != null &&
    item.composicao_versao < item.composicoes.versao
  )
}

function IndicadorDesatualizado({ item }: { item: Parameters<typeof itemDesatualizado>[0] }) {
  if (!itemDesatualizado(item)) return null
  return (
    <span
      title={`Composição atualizada disponível (v${item.composicoes?.versao}) — este item usa a v${item.composicao_versao}`}
      className="shrink-0 text-amber-500"
    >
      <AlertTriangle className="size-3.5" />
    </span>
  )
}

export default function TabelaOrcamento({
  gruposCalculados,
  totais,
  visao,
  disciplinas,
  unidades,
  onUpdateItem,
  onUpdateUnidade,
  onAddDisciplina,
  onRemoveGrupo,
  onAddItem,
  onRemoveItem,
  onConverterParaComposicao,
}: Props) {
  const [adicionandoDisciplina, setAdicionandoDisciplina] = useState(false)
  const [nomeDisciplina, setNomeDisciplina] = useState('')
  const [sugestaoItemId, setSugestaoItemId] = useState<string | null>(null)
  const [sugestoesComposicoes, setSugestoesComposicoes] = useState<{ id: string; nome: string }[]>([])
  const [itensComSugestaoDispensada, setItensComSugestaoDispensada] = useState<Set<string>>(new Set())

  async function buscarSugestoesParaItem(itemId: string, descricao: string, composicaoId: string | null) {
    if (composicaoId) return // item já vinculado a uma composição, não sugere de novo
    if (itensComSugestaoDispensada.has(itemId)) return
    const texto = descricao.trim()
    if (!texto) return
    const params = new URLSearchParams({ texto, limite: '3' })
    const res = await fetch(`/api/composicoes/semelhantes?${params}`)
    if (!res.ok) return
    const resultados = await res.json()
    if (Array.isArray(resultados) && resultados.length > 0) {
      setSugestoesComposicoes(resultados)
      setSugestaoItemId(itemId)
    } else {
      setSugestaoItemId(prev => (prev === itemId ? null : prev))
    }
  }

  async function confirmarAdicionarDisciplina() {
    const nome = nomeDisciplina.trim()
    if (!nome) return
    await onAddDisciplina(nome)
    setAdicionandoDisciplina(false)
    setNomeDisciplina('')
  }

  const colsComercial = 11
  const colsTecnica = 22

  if (visao === 'comercial') {
    return (
      <div className="space-y-2">
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-2 py-2 text-left font-medium border-b border-border w-10">Item</th>
                <th className="px-2 py-2 text-left font-medium border-b border-border w-8">Nº</th>
                <th className="px-2 py-2 text-left font-medium border-b border-border">Descrição</th>
                <th className="px-2 py-2 text-left font-medium border-b border-border w-32">Local</th>
                <th className="px-2 py-2 text-center font-medium border-b border-border w-16">UN</th>
                <th className="px-2 py-2 text-right font-medium border-b border-border w-16">QT</th>
                <th className="px-2 py-2 text-right font-medium border-b border-border w-24">P. Unit. MO</th>
                <th className="px-2 py-2 text-right font-medium border-b border-border w-24">P. Unit. Mat.</th>
                <th className="px-2 py-2 text-right font-medium border-b border-border w-24">Sub. MO</th>
                <th className="px-2 py-2 text-right font-medium border-b border-border w-24">Sub. Mat.</th>
                <th className="px-2 py-2 text-right font-medium border-b border-border w-24">Total</th>
                <th className="px-2 py-2 border-b border-border w-8" />
              </tr>
            </thead>
            <tbody>
              {gruposCalculados.map(grupo => (
                <Fragment key={grupo.id}>
                  <tr className="bg-muted/50 font-semibold text-muted-foreground">
                    <td className="px-2 py-1.5 border-b border-border">{grupo.letra}</td>
                    <td className="px-2 py-1.5 border-b border-border" />
                    <td className="px-2 py-1.5 border-b border-border uppercase">
                      {grupo.disciplinas?.nome ?? '—'}
                    </td>
                    <td colSpan={5} className="border-b border-border" />
                    <td className="px-2 py-1.5 text-right border-b border-border font-mono">
                      {fmt(grupo.totais.subtotal_mao_obra_venda)}
                    </td>
                    <td className="px-2 py-1.5 text-right border-b border-border font-mono">
                      {fmt(grupo.totais.subtotal_material_venda)}
                    </td>
                    <td className="px-2 py-1.5 text-right border-b border-border font-mono">
                      {fmt(grupo.totais.total_venda)}
                    </td>
                    <td className="px-2 py-1.5 border-b border-border text-center">
                      <button
                        onClick={() => onRemoveGrupo(grupo.id)}
                        className="text-red-400 hover:text-red-600 font-bold"
                        title="Remover disciplina"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                  {grupo.itens_calculados.map(item => (
                    <Fragment key={item.id}>
                      <tr className="hover:bg-muted/50 border-b border-border/50">
                        <td className="px-2 py-1 text-muted-foreground">{grupo.letra}</td>
                        <td className="px-2 py-1 text-muted-foreground">{item.numero}</td>
                        <td className="px-2 py-1">
                          <div className="flex items-center gap-1">
                            <CelulaEditavel
                              valor={item.descricao}
                              tipo="text"
                              onSave={v => {
                                onUpdateItem(grupo.id, item.id, 'descricao', v)
                                buscarSugestoesParaItem(item.id, v, item.composicao_id)
                              }}
                            />
                            <IndicadorDesatualizado item={item} />
                          </div>
                        </td>
                        <td className="px-2 py-1">
                          <CelulaEditavel
                            valor={item.local ?? ''}
                            tipo="text"
                            onSave={v => onUpdateItem(grupo.id, item.id, 'local', v || null)}
                          />
                        </td>
                        <td className="px-2 py-1 text-center">
                          <input
                            key={item.unidade_id ?? 'sem-unidade'}
                            list="lista-unidades"
                            defaultValue={item.unidades_medida?.sigla ?? ''}
                            onBlur={e => {
                              const nova = e.target.value.trim().toUpperCase()
                              if (nova !== (item.unidades_medida?.sigla ?? '')) {
                                onUpdateUnidade(grupo.id, item.id, nova)
                              }
                            }}
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                            placeholder="—"
                            className="w-14 h-6 rounded border border-input bg-background px-1 text-xs text-center uppercase"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <CelulaEditavel
                            valor={item.quantidade}
                            tipo="number"
                            className="text-right"
                            onSave={v => onUpdateItem(grupo.id, item.id, 'quantidade', parseFloat(v) || 0)}
                          />
                        </td>
                        <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                          {fmt(item.preco_unit_mao_obra_venda)}
                        </td>
                        <td className="px-2 py-1 text-right font-mono text-muted-foreground">
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
                      {sugestaoItemId === item.id && (
                        <tr>
                          <td colSpan={colsComercial + 1} className="px-2 py-1">
                            <ListaSugestoesSemelhantes
                              titulo="Composições parecidas"
                              itens={sugestoesComposicoes}
                              renderItem={c => <span>{c.nome}</span>}
                              onSelecionar={c => {
                                onConverterParaComposicao(grupo.id, item.id, c.id, item.quantidade)
                                setSugestaoItemId(null)
                              }}
                              onDispensar={() => {
                                setItensComSugestaoDispensada(prev => new Set(prev).add(item.id))
                                setSugestaoItemId(null)
                              }}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                  <tr>
                    <td colSpan={colsComercial + 1} className="px-2 py-1 border-b border-border/50">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => onAddItem(grupo.id)}
                          className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                        >
                          + Adicionar item
                        </button>
                      </div>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
            <tfoot className="bg-muted text-white font-semibold">
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
          {adicionandoDisciplina ? (
            <>
              <input
                list="lista-disciplinas"
                value={nomeDisciplina}
                onChange={e => setNomeDisciplina(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmarAdicionarDisciplina() }}
                placeholder="Digite ou escolha a disciplina..."
                autoFocus
                className="w-56 h-8 rounded border border-input bg-background px-2 text-sm"
              />
              <datalist id="lista-disciplinas">
                {disciplinas.map(d => (
                  <option key={d.id} value={d.nome} />
                ))}
              </datalist>
              <button
                onClick={confirmarAdicionarDisciplina}
                className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Confirmar
              </button>
              <button
                onClick={() => { setAdicionandoDisciplina(false); setNomeDisciplina('') }}
                className="text-sm px-3 py-1 bg-muted text-muted-foreground rounded hover:bg-muted"
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              onClick={() => setAdicionandoDisciplina(true)}
              className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
            >
              + Adicionar disciplina
            </button>
          )}
        </div>
      </div>
    )
  }

  // Visão Técnica
  return (
    <div className="space-y-2">
      <datalist id="lista-unidades">
        {unidades.map(u => (
          <option key={u.id} value={u.sigla} />
        ))}
      </datalist>
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-2 py-2 text-left font-medium border-b border-border w-10">Item</th>
              <th className="px-2 py-2 text-left font-medium border-b border-border w-8">Nº</th>
              <th className="px-2 py-2 text-left font-medium border-b border-border">Descrição</th>
              <th className="px-2 py-2 text-left font-medium border-b border-border w-28">Local</th>
              <th className="px-2 py-2 text-center font-medium border-b border-border w-16">UN</th>
              <th className="px-2 py-2 text-right font-medium border-b border-border w-16">QT</th>
              <th className="px-2 py-2 text-right font-medium border-b border-border w-22">M. OBRA</th>
              <th className="px-2 py-2 text-right font-medium border-b border-border w-22">MAT</th>
              <th className="px-2 py-2 text-right font-medium border-b border-border w-22">Total Custo</th>
              <th className="px-2 py-2 text-right font-medium border-b border-border w-16">Markup M.Obra</th>
              <th className="px-2 py-2 text-right font-medium border-b border-border w-16">Markup Mat.</th>
              <th className="px-2 py-2 text-right font-medium border-b border-border w-20">Fator FEE M.O.</th>
              <th className="px-2 py-2 text-right font-medium border-b border-border w-20">Fator FEE Mat.</th>
              <th className="px-2 py-2 text-right font-medium border-b border-border w-20">FEE M.OBRA</th>
              <th className="px-2 py-2 text-right font-medium border-b border-border w-20">$ M.OBRA</th>
              <th className="px-2 py-2 text-right font-medium border-b border-border w-20">FEE MAT</th>
              <th className="px-2 py-2 text-right font-medium border-b border-border w-20">$ MAT</th>
              <th className="px-2 py-2 text-right font-medium border-b border-border w-24">SUB TOTAL M.OBRA</th>
              <th className="px-2 py-2 text-right font-medium border-b border-border w-24">SUB TOTAL MAT</th>
              <th className="px-2 py-2 text-right font-medium border-b border-border w-22">TOTAL</th>
              <th className="px-2 py-2 text-right font-medium border-b border-border w-22">Lucro</th>
              <th className="px-2 py-2 text-right font-medium border-b border-border w-16">Mg. Ef%</th>
              <th className="px-2 py-2 border-b border-border w-8" />
            </tr>
          </thead>
          <tbody>
            {gruposCalculados.map(grupo => (
              <Fragment key={grupo.id}>
                <tr className="bg-muted/50 font-semibold text-muted-foreground">
                  <td className="px-2 py-1.5 border-b border-border">{grupo.letra}</td>
                  <td className="px-2 py-1.5 border-b border-border" />
                  <td className="px-2 py-1.5 border-b border-border uppercase">
                    {grupo.disciplinas?.nome ?? '—'}
                  </td>
                  <td colSpan={5} className="border-b border-border" />
                  <td className="px-2 py-1.5 text-right border-b border-border font-mono">
                    {fmt(grupo.totais.total_custo)}
                  </td>
                  <td colSpan={8} className="border-b border-border" />
                  <td className="px-2 py-1.5 text-right border-b border-border font-mono">
                    {fmt(grupo.totais.subtotal_mao_obra_venda)}
                  </td>
                  <td className="px-2 py-1.5 text-right border-b border-border font-mono">
                    {fmt(grupo.totais.subtotal_material_venda)}
                  </td>
                  <td className="px-2 py-1.5 text-right border-b border-border font-mono">
                    {fmt(grupo.totais.total_venda)}
                  </td>
                  <td className="px-2 py-1.5 text-right border-b border-border font-mono">
                    {fmt(grupo.totais.lucro)}
                  </td>
                  <td className="border-b border-border" />
                  <td className="px-2 py-1.5 border-b border-border text-center">
                    <button
                      onClick={() => onRemoveGrupo(grupo.id)}
                      className="text-red-400 hover:text-red-600 font-bold"
                    >
                      ×
                    </button>
                  </td>
                </tr>
                {grupo.itens_calculados.map(item => (
                  <Fragment key={item.id}>
                    <tr className="hover:bg-muted/50 border-b border-border/50">
                      <td className="px-2 py-1 text-muted-foreground">{grupo.letra}</td>
                      <td className="px-2 py-1 text-muted-foreground">{item.numero}</td>
                      <td className="px-2 py-1">
                        <div className="flex items-center gap-1">
                          <CelulaEditavel
                            valor={item.descricao}
                            tipo="text"
                            onSave={v => {
                              onUpdateItem(grupo.id, item.id, 'descricao', v)
                              buscarSugestoesParaItem(item.id, v, item.composicao_id)
                            }}
                          />
                          <IndicadorDesatualizado item={item} />
                        </div>
                      </td>
                      <td className="px-2 py-1">
                        <CelulaEditavel
                          valor={item.local ?? ''}
                          tipo="text"
                          onSave={v => onUpdateItem(grupo.id, item.id, 'local', v || null)}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          key={item.unidade_id ?? 'sem-unidade'}
                          list="lista-unidades"
                          defaultValue={item.unidades_medida?.sigla ?? ''}
                          onBlur={e => {
                            const nova = e.target.value.trim().toUpperCase()
                            if (nova !== (item.unidades_medida?.sigla ?? '')) {
                              onUpdateUnidade(grupo.id, item.id, nova)
                            }
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                          placeholder="—"
                          className="w-14 h-6 rounded border border-input bg-background px-1 text-xs text-center uppercase"
                        />
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
                          valor={item.markup_mao_obra}
                          tipo="number"
                          className="text-right"
                          onSave={v => onUpdateItem(grupo.id, item.id, 'markup_mao_obra', parseFloat(v) || 1)}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <CelulaEditavel
                          valor={item.markup_material}
                          tipo="number"
                          className="text-right"
                          onSave={v => onUpdateItem(grupo.id, item.id, 'markup_material', parseFloat(v) || 1)}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <CelulaEditavel
                          valor={item.fee_mao_obra}
                          tipo="number"
                          className="text-right"
                          onSave={v => onUpdateItem(grupo.id, item.id, 'fee_mao_obra', v.trim() === '' ? null : parseFloat(v))}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <CelulaEditavel
                          valor={item.fee_material}
                          tipo="number"
                          className="text-right"
                          onSave={v => onUpdateItem(grupo.id, item.id, 'fee_material', v.trim() === '' ? null : parseFloat(v))}
                        />
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                        {fmt(item.fee_unit_mao_obra)}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                        {fmt(item.preco_unit_mao_obra_venda)}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                        {fmt(item.fee_unit_material)}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                        {fmt(item.preco_unit_material_venda)}
                      </td>
                      <td className="px-2 py-1 text-right font-mono">{fmt(item.subtotal_mao_obra_venda)}</td>
                      <td className="px-2 py-1 text-right font-mono">{fmt(item.subtotal_material_venda)}</td>
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
                    {sugestaoItemId === item.id && (
                      <tr>
                        <td colSpan={colsTecnica + 1} className="px-2 py-1">
                          <ListaSugestoesSemelhantes
                            titulo="Composições parecidas"
                            itens={sugestoesComposicoes}
                            renderItem={c => <span>{c.nome}</span>}
                            onSelecionar={c => {
                              onConverterParaComposicao(grupo.id, item.id, c.id, item.quantidade)
                              setSugestaoItemId(null)
                            }}
                            onDispensar={() => {
                              setItensComSugestaoDispensada(prev => new Set(prev).add(item.id))
                              setSugestaoItemId(null)
                            }}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                <tr>
                  <td colSpan={colsTecnica + 1} className="px-2 py-1 border-b border-border/50">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => onAddItem(grupo.id)}
                        className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                      >
                        + Adicionar item
                      </button>
                    </div>
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
          <tfoot className="bg-muted text-white font-semibold">
            <tr>
              <td colSpan={8} className="px-2 py-2 text-right uppercase text-xs tracking-wide">Total Geral</td>
              <td className="px-2 py-2 text-right font-mono">{fmt(totais.total_custo)}</td>
              <td colSpan={8} />
              <td className="px-2 py-2 text-right font-mono">{fmt(totais.total_mao_obra_venda)}</td>
              <td className="px-2 py-2 text-right font-mono">{fmt(totais.total_material_venda)}</td>
              <td className="px-2 py-2 text-right font-mono">{fmt(totais.total_venda)}</td>
              <td className="px-2 py-2 text-right font-mono">{fmt(totais.lucro)}</td>
              <td className="px-2 py-2 text-right font-mono">{fmtPct(totais.margem_efetiva_pct)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Adicionar disciplina */}
      <div className="flex items-center gap-2">
        {adicionandoDisciplina ? (
          <>
            <input
              list="lista-disciplinas"
              value={nomeDisciplina}
              onChange={e => setNomeDisciplina(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmarAdicionarDisciplina() }}
              placeholder="Digite ou escolha a disciplina..."
              autoFocus
              className="w-56 h-8 rounded border border-input bg-background px-2 text-sm"
            />
            <datalist id="lista-disciplinas">
              {disciplinas.map(d => (
                <option key={d.id} value={d.nome} />
              ))}
            </datalist>
            <button
              onClick={confirmarAdicionarDisciplina}
              className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Confirmar
            </button>
            <button
              onClick={() => { setAdicionandoDisciplina(false); setNomeDisciplina('') }}
              className="text-sm px-3 py-1 bg-muted text-muted-foreground rounded hover:bg-muted"
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            onClick={() => setAdicionandoDisciplina(true)}
            className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
          >
            + Adicionar disciplina
          </button>
        )}
      </div>
    </div>
  )
}
