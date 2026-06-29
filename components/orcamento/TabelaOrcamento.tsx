'use client'

import { fmt, fmtPct } from '@/lib/format'
import type { GrupoCalculado, TotaisGerais, TipoVisao } from '@/types/orcamento'

interface Props {
  gruposCalculados: GrupoCalculado[]
  totais: TotaisGerais
  visao: TipoVisao
}

export default function TabelaOrcamento({ gruposCalculados, totais, visao }: Props) {
  if (visao === 'comercial') {
    return (
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-gray-100 text-gray-600">
            <tr>
              <th className="px-2 py-2 text-left font-medium border-b border-gray-200 w-10">Item</th>
              <th className="px-2 py-2 text-left font-medium border-b border-gray-200 w-8">Nº</th>
              <th className="px-2 py-2 text-left font-medium border-b border-gray-200">Descrição</th>
              <th className="px-2 py-2 text-left font-medium border-b border-gray-200">Local</th>
              <th className="px-2 py-2 text-center font-medium border-b border-gray-200 w-12">UN</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-14">QT</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">P. Unit. MO</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">P. Unit. Mat.</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">Sub. MO</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">Sub. Mat.</th>
              <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">Total</th>
            </tr>
          </thead>
          <tbody>
            {gruposCalculados.map(grupo => (
              <>
                {/* Linha de grupo */}
                <tr key={`grupo-${grupo.id}`} className="bg-gray-50 font-semibold text-gray-700">
                  <td className="px-2 py-1.5 border-b border-gray-200">{grupo.letra}</td>
                  <td className="px-2 py-1.5 border-b border-gray-200">{grupo.letra}</td>
                  <td className="px-2 py-1.5 border-b border-gray-200 uppercase text-xs">
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
                </tr>
                {/* Linhas de item */}
                {grupo.itens_calculados.map(item => (
                  <tr key={item.id} className="hover:bg-blue-50 border-b border-gray-100">
                    <td className="px-2 py-1.5 text-gray-400">{grupo.letra}</td>
                    <td className="px-2 py-1.5 text-gray-500">{item.numero}</td>
                    <td className="px-2 py-1.5">{item.descricao}</td>
                    <td className="px-2 py-1.5 text-gray-500">{item.local ?? '—'}</td>
                    <td className="px-2 py-1.5 text-center text-gray-500">
                      {item.unidades_medida?.sigla ?? '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">{fmt(item.quantidade)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{fmt(item.preco_unit_mao_obra_venda)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{fmt(item.preco_unit_material_venda)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{fmt(item.subtotal_mao_obra_venda)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{fmt(item.subtotal_material_venda)}</td>
                    <td className="px-2 py-1.5 text-right font-mono font-semibold">{fmt(item.total_venda)}</td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
          <tfoot className="bg-gray-800 text-white font-semibold">
            <tr>
              <td colSpan={8} className="px-2 py-2 text-right uppercase text-xs tracking-wide">Total Geral</td>
              <td className="px-2 py-2 text-right font-mono">{fmt(totais.total_mao_obra_venda)}</td>
              <td className="px-2 py-2 text-right font-mono">{fmt(totais.total_material_venda)}</td>
              <td className="px-2 py-2 text-right font-mono">{fmt(totais.total_venda)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

  // Visão Técnica
  return (
    <div className="overflow-x-auto rounded border border-gray-200">
      <table className="w-full text-xs border-collapse">
        <thead className="bg-gray-100 text-gray-600">
          <tr>
            <th className="px-2 py-2 text-left font-medium border-b border-gray-200 w-10">Item</th>
            <th className="px-2 py-2 text-left font-medium border-b border-gray-200 w-8">Nº</th>
            <th className="px-2 py-2 text-left font-medium border-b border-gray-200">Descrição</th>
            <th className="px-2 py-2 text-left font-medium border-b border-gray-200">Local</th>
            <th className="px-2 py-2 text-center font-medium border-b border-gray-200 w-12">UN</th>
            <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-14">QT</th>
            <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">Custo MO</th>
            <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">Custo Mat.</th>
            <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">Total Custo</th>
            <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-16">Mg. MO%</th>
            <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-16">Mg. Mat%</th>
            <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">Total Venda</th>
            <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-24">Lucro</th>
            <th className="px-2 py-2 text-right font-medium border-b border-gray-200 w-16">Mg. Ef%</th>
          </tr>
        </thead>
        <tbody>
          {gruposCalculados.map(grupo => (
            <>
              <tr key={`grupo-${grupo.id}`} className="bg-gray-50 font-semibold text-gray-700">
                <td className="px-2 py-1.5 border-b border-gray-200">{grupo.letra}</td>
                <td className="px-2 py-1.5 border-b border-gray-200">{grupo.letra}</td>
                <td className="px-2 py-1.5 border-b border-gray-200 uppercase text-xs">
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
              </tr>
              {grupo.itens_calculados.map(item => (
                <tr key={item.id} className="hover:bg-blue-50 border-b border-gray-100">
                  <td className="px-2 py-1.5 text-gray-400">{grupo.letra}</td>
                  <td className="px-2 py-1.5 text-gray-500">{item.numero}</td>
                  <td className="px-2 py-1.5">{item.descricao}</td>
                  <td className="px-2 py-1.5 text-gray-500">{item.local ?? '—'}</td>
                  <td className="px-2 py-1.5 text-center text-gray-500">
                    {item.unidades_medida?.sigla ?? '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmt(item.quantidade)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmt(item.custo_unit_mao_obra)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmt(item.custo_unit_material)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmt(item.total_custo)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmtPct(item.margem_mao_obra_pct)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmtPct(item.margem_material_pct)}</td>
                  <td className="px-2 py-1.5 text-right font-mono font-semibold">{fmt(item.total_venda)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmt(item.lucro)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmtPct(item.margem_efetiva_pct)}</td>
                </tr>
              ))}
            </>
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
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
