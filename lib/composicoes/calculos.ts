export interface MaterialParaCalculo {
  quantidade: number
  preco_unitario: number
}

export interface MaoObraParaCalculo {
  horas: number
  custo_hora: number
}

export function calcularCustoDireto(
  materiais: MaterialParaCalculo[],
  maoDeObra: MaoObraParaCalculo[]
): number {
  const totalMateriais = materiais.reduce((acc, m) => acc + m.quantidade * m.preco_unitario, 0)
  const totalMaoDeObra = maoDeObra.reduce((acc, m) => acc + m.horas * m.custo_hora, 0)
  return totalMateriais + totalMaoDeObra
}

export interface ComposicaoParaMapear {
  descricao_tecnica: string
  unidade_id: string | null
  markup_sugerido: number
}

export interface CamposItemDeComposicao {
  descricao: string
  unidade_id: string | null
  custo_unit_material: number
  custo_unit_mao_obra: number
  markup_material: number
  markup_mao_obra: number
}

export function mapearComposicaoParaItem(
  composicao: ComposicaoParaMapear,
  materiais: MaterialParaCalculo[],
  maoDeObra: MaoObraParaCalculo[]
): CamposItemDeComposicao {
  const custo_unit_material = materiais.reduce((acc, m) => acc + m.quantidade * m.preco_unitario, 0)
  const custo_unit_mao_obra = maoDeObra.reduce((acc, m) => acc + m.horas * m.custo_hora, 0)
  return {
    descricao: composicao.descricao_tecnica,
    unidade_id: composicao.unidade_id,
    custo_unit_material,
    custo_unit_mao_obra,
    markup_material: composicao.markup_sugerido,
    markup_mao_obra: composicao.markup_sugerido,
  }
}

export interface SnapshotComparavel {
  campos: Record<string, unknown>
  materiais: Record<string, unknown>[]
  maoDeObra: Record<string, unknown>[]
}

/** Compara dois snapshots (campos simples + listas de materiais/mão de obra
 * normalizadas) para decidir se uma nova versão deve ser gravada ao salvar. */
export function composicaoMudou(antiga: SnapshotComparavel, nova: SnapshotComparavel): boolean {
  return (
    JSON.stringify(antiga.campos) !== JSON.stringify(nova.campos) ||
    JSON.stringify(antiga.materiais) !== JSON.stringify(nova.materiais) ||
    JSON.stringify(antiga.maoDeObra) !== JSON.stringify(nova.maoDeObra)
  )
}

/** Uma composição é "incompleta" quando tem materiais mas nenhuma mão de
 * obra, ou mão de obra mas nenhum material — nunca os dois vazios (isso já
 * é bloqueado ao salvar a composição desde a B1). */
export function composicaoIncompleta(temMateriais: boolean, temMaoObra: boolean): boolean {
  return temMateriais !== temMaoObra
}
