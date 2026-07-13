// lib/composicoes/criar.ts
import { createClient } from '@/lib/supabase/server'
import { calcularCustoDireto } from './calculos'
import { normalizarMateriais, normalizarMaoObra, type MaterialBody, type MaoObraBody } from './normalizar'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export interface DadosNovaComposicao {
  codigo: string
  nome: string
  disciplina_id: string | null
  descricao_tecnica: string
  unidade_id: string | null
  produtividade: string | null
  markup_sugerido: number
  observacoes: string | null
  tags: string[]
  materiais: MaterialBody[]
  mao_obra: MaoObraBody[]
}

export interface ResultadoCriacao {
  status: number
  body: Record<string, unknown>
}

/** Cria uma composição nova: valida campos obrigatórios, calcula o custo
 * direto, insere a composição + materiais/mão de obra, e grava o snapshot da
 * versão 1. Reaproveitada por POST /api/composicoes (corpo vem da
 * requisição) e pelo import de planilha (corpo vem de uma linha parseada do
 * Excel, Task 5). */
export async function criarComposicao(
  supabase: SupabaseClient,
  usuarioId: string,
  dados: DadosNovaComposicao
): Promise<ResultadoCriacao> {
  if (!dados.codigo.trim() || !dados.nome.trim() || !dados.descricao_tecnica.trim()) {
    return { status: 400, body: { error: 'Código, nome e descrição técnica são obrigatórios' } }
  }
  if (dados.materiais.length === 0 && dados.mao_obra.length === 0) {
    return {
      status: 400,
      body: { error: 'A composição precisa ter ao menos um material ou item de mão de obra' },
    }
  }

  const custo_direto = calcularCustoDireto(
    dados.materiais.map(m => ({ quantidade: m.quantidade ?? 0, preco_unitario: m.preco_unitario ?? 0 })),
    dados.mao_obra.map(m => ({ horas: m.horas ?? 0, custo_hora: m.custo_hora ?? 0 }))
  )

  const { data: composicao, error: erroComposicao } = await supabase
    .from('composicoes')
    .insert({
      codigo: dados.codigo.trim(),
      nome: dados.nome.trim(),
      disciplina_id: dados.disciplina_id || null,
      descricao_tecnica: dados.descricao_tecnica.trim(),
      unidade_id: dados.unidade_id || null,
      produtividade: dados.produtividade?.trim() || null,
      custo_direto,
      markup_sugerido: dados.markup_sugerido ?? 1,
      observacoes: dados.observacoes?.trim() || null,
      tags: dados.tags ?? [],
      versao: 1,
      responsavel_id: usuarioId,
    })
    .select('*, disciplinas(id, nome), unidades_medida(id, sigla)')
    .single()

  if (erroComposicao) return { status: 500, body: { error: erroComposicao.message } }

  const materiaisParaInserir = normalizarMateriais(dados.materiais).map(m => ({
    ...m,
    composicao_id: composicao.id,
  }))
  const maoObraParaInserir = normalizarMaoObra(dados.mao_obra).map(m => ({
    ...m,
    composicao_id: composicao.id,
  }))

  const [resMateriais, resMaoObra] = await Promise.all([
    materiaisParaInserir.length > 0
      ? supabase.from('composicao_materiais').insert(materiaisParaInserir).select('*, unidades_medida(id, sigla)')
      : Promise.resolve({ data: [], error: null }),
    maoObraParaInserir.length > 0
      ? supabase.from('composicao_mao_obra').insert(maoObraParaInserir).select('*')
      : Promise.resolve({ data: [], error: null }),
  ])
  if (resMateriais.error) return { status: 500, body: { error: resMateriais.error.message } }
  if (resMaoObra.error) return { status: 500, body: { error: resMaoObra.error.message } }

  const { error: erroVersao } = await supabase.from('composicao_versoes').insert({
    composicao_id: composicao.id,
    versao: 1,
    snapshot: { composicao, materiais: resMateriais.data, mao_obra: resMaoObra.data },
    usuario_id: usuarioId,
  })
  if (erroVersao) return { status: 500, body: { error: erroVersao.message } }

  return {
    status: 201,
    body: { ...composicao, composicao_materiais: resMateriais.data, composicao_mao_obra: resMaoObra.data },
  }
}
