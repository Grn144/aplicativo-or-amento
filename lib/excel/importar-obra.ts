import type { DisciplinaImportada } from './parse-obra'

type SupabaseClient = import('@supabase/supabase-js').SupabaseClient

/**
 * Insere disciplinas/grupos/itens importados de uma planilha na obra indicada.
 * Para cada disciplina: reutiliza (por nome, case-insensitive) ou cria o
 * registro em `disciplinas`; reutiliza o grupo já existente na obra para essa
 * disciplina ou cria um novo (letra/ordem sequencial); insere os itens com o
 * markup vindo do parser, resolvendo `unidade_id` pela sigla.
 *
 * Lança `Error` em qualquer falha — o chamador converte em 500.
 */
export async function inserirConteudoObra(
  supabase: SupabaseClient,
  obra_id: string,
  disciplinas: DisciplinaImportada[]
): Promise<{ disciplinas: number; itens: number }> {
  if (disciplinas.length === 0) return { disciplinas: 0, itens: 0 }

  // Mapas de apoio: disciplinas e unidades existentes (por nome/sigla)
  const [{ data: discExistentes }, { data: unidades }] = await Promise.all([
    supabase.from('disciplinas').select('id, nome'),
    supabase.from('unidades_medida').select('id, sigla'),
  ])
  const discPorNome = new Map<string, string>()
  for (const d of discExistentes ?? []) discPorNome.set(d.nome.trim().toUpperCase(), d.id)
  const unidadePorSigla = new Map<string, string>()
  for (const u of unidades ?? []) unidadePorSigla.set(u.sigla.trim().toUpperCase(), u.id)

  // Grupos já existentes na obra, por disciplina (para reutilizar em vez de duplicar)
  const { data: gruposObra, count: totalGrupos } = await supabase
    .from('grupos_orcamento')
    .select('id, letra, ordem, disciplina_id', { count: 'exact' })
    .eq('obra_id', obra_id)
  const grupoPorDisciplina = new Map<string, { id: string }>()
  for (const g of gruposObra ?? []) {
    if (g.disciplina_id) grupoPorDisciplina.set(g.disciplina_id, { id: g.id })
  }

  let ordemGrupo = totalGrupos ?? 0
  let totalItens = 0

  for (const disc of disciplinas) {
    const chave = disc.disciplina.trim().toUpperCase()

    // 1. Disciplina: encontra ou cria
    let disciplina_id = discPorNome.get(chave)
    if (!disciplina_id) {
      const { data: nova, error: errDisc } = await supabase
        .from('disciplinas')
        .insert({ nome: disc.disciplina.trim() })
        .select('id')
        .single()
      if (errDisc || !nova) {
        // corrida: outra inserção criou a disciplina — busca de novo
        const { data: achada } = await supabase
          .from('disciplinas').select('id').ilike('nome', disc.disciplina.trim()).single()
        if (!achada) throw new Error('Falha ao criar disciplina')
        disciplina_id = achada.id
      } else {
        disciplina_id = nova.id
      }
      discPorNome.set(chave, disciplina_id!)
    }
    if (!disciplina_id) continue
    const disciplinaIdFinal: string = disciplina_id

    // 2. Grupo: reutiliza o da obra para essa disciplina ou cria um novo
    let grupo_id: string | undefined = grupoPorDisciplina.get(disciplinaIdFinal)?.id
    if (!grupo_id) {
      ordemGrupo++
      const letra = String.fromCharCode(64 + ordemGrupo)
      const { data: novoGrupo, error: errGrupo } = await supabase
        .from('grupos_orcamento')
        .insert({ obra_id, disciplina_id: disciplinaIdFinal, letra, ordem: ordemGrupo })
        .select('id')
        .single()
      if (errGrupo || !novoGrupo) throw new Error('Falha ao criar grupo da disciplina')
      const novoId: string = novoGrupo.id
      grupo_id = novoId
      grupoPorDisciplina.set(disciplinaIdFinal, { id: novoId })
    }
    if (!grupo_id) continue
    const grupoIdFinal: string = grupo_id

    // 3. Itens: numeração sequencial a partir do que já existe no grupo
    const { count: itensExistentes } = await supabase
      .from('itens_orcamento')
      .select('id', { count: 'exact', head: true })
      .eq('grupo_id', grupoIdFinal)
    let numero = (itensExistentes ?? 0)

    const itensParaInserir = disc.itens.map(it => {
      numero++
      return {
        grupo_id: grupoIdFinal,
        numero,
        ordem: numero,
        descricao: it.descricao,
        local: it.local,
        unidade_id: it.unidade ? unidadePorSigla.get(it.unidade.toUpperCase()) ?? null : null,
        quantidade: it.quantidade,
        custo_unit_mao_obra: it.custo_unit_mao_obra,
        custo_unit_material: it.custo_unit_material,
        markup_mao_obra: it.markup_mao_obra,
        markup_material: it.markup_material,
        observacao: it.observacao,
        observacao_2: null,
      }
    })

    if (itensParaInserir.length > 0) {
      const { error: errItens } = await supabase.from('itens_orcamento').insert(itensParaInserir)
      if (errItens) throw new Error(errItens.message)
      totalItens += itensParaInserir.length
    }
  }

  return { disciplinas: totalItens > 0 ? disciplinas.length : 0, itens: totalItens }
}
