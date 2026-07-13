// lib/composicoes/atualizar.ts
import { createClient } from '@/lib/supabase/server'
import { calcularCustoDireto, composicaoMudou } from './calculos'
import type { CamposEditaveisComposicao, MaterialNormalizado, MaoObraNormalizada } from './normalizar'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export async function carregarComposicaoCompleta(supabase: SupabaseClient, id: string) {
  const [composicaoRes, materiaisRes, maoObraRes] = await Promise.all([
    supabase.from('composicoes').select('*, disciplinas(id, nome), unidades_medida(id, sigla)').eq('id', id).single(),
    supabase.from('composicao_materiais').select('*, unidades_medida(id, sigla)').eq('composicao_id', id).order('ordem'),
    supabase.from('composicao_mao_obra').select('*').eq('composicao_id', id).order('ordem'),
  ])
  return { composicaoRes, materiaisRes, maoObraRes }
}

export interface ResultadoAtualizacao {
  status: number
  body: Record<string, unknown>
}

/** Atualiza uma composição só se algo realmente mudou (campos simples ou as
 * listas de materiais/mão de obra) em relação ao estado atual no banco — se
 * nada mudou, não grava nada e retorna o estado atual sem incrementar a
 * versão. Reaproveitada por PUT /api/composicoes/[id] (corpo vem da
 * requisição) e por restaurar versão (corpo vem de um snapshot arquivado). */
export async function atualizarComposicaoSeMudou(
  supabase: SupabaseClient,
  usuarioId: string,
  id: string,
  camposNovos: CamposEditaveisComposicao,
  materiaisNovos: MaterialNormalizado[],
  maoObraNova: MaoObraNormalizada[]
): Promise<ResultadoAtualizacao> {
  const { composicaoRes: atual, materiaisRes: materiaisAtuais, maoObraRes: maoObraAtual } =
    await carregarComposicaoCompleta(supabase, id)
  if (atual.error) {
    if (atual.error.code === 'PGRST116') return { status: 404, body: { error: 'Composição não encontrada' } }
    return { status: 500, body: { error: atual.error.message } }
  }

  const camposAntigos: CamposEditaveisComposicao = {
    codigo: atual.data.codigo,
    nome: atual.data.nome,
    disciplina_id: atual.data.disciplina_id,
    descricao_tecnica: atual.data.descricao_tecnica,
    unidade_id: atual.data.unidade_id,
    produtividade: atual.data.produtividade,
    markup_sugerido: atual.data.markup_sugerido,
    observacoes: atual.data.observacoes,
    tags: atual.data.tags,
    ativo: atual.data.ativo,
  }
  const materiaisAntigosNormalizados = (materiaisAtuais.data ?? []).map(m => ({
    descricao: m.descricao, quantidade: m.quantidade, unidade_id: m.unidade_id,
    fornecedor: m.fornecedor, preco_unitario: m.preco_unitario, ordem: m.ordem,
  }))
  const maoObraAntigaNormalizada = (maoObraAtual.data ?? []).map(m => ({
    cargo: m.cargo, horas: m.horas, custo_hora: m.custo_hora, ordem: m.ordem,
  }))

  const mudou = composicaoMudou(
    { campos: camposAntigos, materiais: materiaisAntigosNormalizados, maoDeObra: maoObraAntigaNormalizada },
    { campos: camposNovos, materiais: materiaisNovos, maoDeObra: maoObraNova }
  )

  if (!mudou) {
    return {
      status: 200,
      body: {
        ...atual.data,
        composicao_materiais: materiaisAtuais.data ?? [],
        composicao_mao_obra: maoObraAtual.data ?? [],
      },
    }
  }

  const custo_direto = calcularCustoDireto(
    materiaisNovos.map(m => ({ quantidade: m.quantidade, preco_unitario: m.preco_unitario })),
    maoObraNova.map(m => ({ horas: m.horas, custo_hora: m.custo_hora }))
  )
  const novaVersao = atual.data.versao + 1

  const { data: composicaoAtualizada, error: erroUpdate } = await supabase
    .from('composicoes')
    .update({ ...camposNovos, custo_direto, versao: novaVersao, atualizado_em: new Date().toISOString() })
    .eq('id', id)
    .select('*, disciplinas(id, nome), unidades_medida(id, sigla)')
    .single()
  if (erroUpdate) return { status: 500, body: { error: erroUpdate.message } }

  const { error: erroDeleteMateriais } = await supabase.from('composicao_materiais').delete().eq('composicao_id', id)
  if (erroDeleteMateriais) return { status: 500, body: { error: erroDeleteMateriais.message } }
  const { error: erroDeleteMaoObra } = await supabase.from('composicao_mao_obra').delete().eq('composicao_id', id)
  if (erroDeleteMaoObra) return { status: 500, body: { error: erroDeleteMaoObra.message } }

  const [resMateriais, resMaoObra] = await Promise.all([
    materiaisNovos.length > 0
      ? supabase.from('composicao_materiais')
          .insert(materiaisNovos.map(m => ({ ...m, composicao_id: id })))
          .select('*, unidades_medida(id, sigla)')
      : Promise.resolve({ data: [], error: null }),
    maoObraNova.length > 0
      ? supabase.from('composicao_mao_obra')
          .insert(maoObraNova.map(m => ({ ...m, composicao_id: id })))
          .select('*')
      : Promise.resolve({ data: [], error: null }),
  ])
  if (resMateriais.error) return { status: 500, body: { error: resMateriais.error.message } }
  if (resMaoObra.error) return { status: 500, body: { error: resMaoObra.error.message } }

  const { error: erroVersao } = await supabase.from('composicao_versoes').insert({
    composicao_id: id,
    versao: novaVersao,
    snapshot: { composicao: composicaoAtualizada, materiais: resMateriais.data, mao_obra: resMaoObra.data },
    usuario_id: usuarioId,
  })
  if (erroVersao) return { status: 500, body: { error: erroVersao.message } }

  return {
    status: 200,
    body: {
      ...composicaoAtualizada,
      composicao_materiais: resMateriais.data,
      composicao_mao_obra: resMaoObra.data,
    },
  }
}
