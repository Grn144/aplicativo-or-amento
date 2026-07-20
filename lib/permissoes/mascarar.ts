// lib/permissoes/mascarar.ts
import type { Permissao } from './matriz'

const CAMPOS_CUSTO = [
  'custo_unit_mao_obra', 'custo_unit_material',
  'subtotal_mao_obra_custo', 'subtotal_material_custo',
  'total_custo', 'total_mao_obra_custo', 'total_material_custo',
  'custo_direto', 'custo_total', 'custo_com_fee',
] as const

const CAMPOS_MARGEM = [
  'margem_mao_obra_pct', 'margem_material_pct', 'margem_efetiva_pct',
  'markup_mao_obra', 'markup_material', 'markup_sugerido',
] as const

const CAMPOS_LUCRO = ['lucro'] as const

function removerCampos(alvo: unknown, campos: readonly string[]): void {
  if (Array.isArray(alvo)) {
    for (const item of alvo) removerCampos(item, campos)
    return
  }
  if (alvo === null || typeof alvo !== 'object') return

  const objeto = alvo as Record<string, unknown>
  for (const campo of campos) delete objeto[campo]
  for (const valor of Object.values(objeto)) {
    if (valor !== null && typeof valor === 'object') removerCampos(valor, campos)
  }
}

/**
 * Remove por completo (nunca substitui por null) os campos financeiros
 * sensíveis de uma resposta de API, percorrendo arrays e objetos aninhados.
 * Age só na fronteira da API — os cálculos internos não são afetados.
 */
export function mascararCamposFinanceiros<T>(dados: T, permissoes: ReadonlySet<Permissao>): T {
  if (!permissoes.has('visualizar_custos')) removerCampos(dados, CAMPOS_CUSTO)
  if (!permissoes.has('visualizar_margem')) removerCampos(dados, CAMPOS_MARGEM)
  if (!permissoes.has('visualizar_lucro')) removerCampos(dados, CAMPOS_LUCRO)
  return dados
}
