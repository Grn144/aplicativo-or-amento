import { createClient } from '@/lib/supabase/server'
import {
  calcularDashboardComposicoes,
  type ComposicaoParaDashboard,
  type UsoParaDashboard,
  type ItemComComposicaoParaDashboard,
} from '@/lib/composicoes/dashboard-metricas'
import { ComposicoesDashboardClient } from '@/components/composicoes/dashboard/ComposicoesDashboardClient'

export default async function ComposicoesDashboardPage() {
  const supabase = await createClient()

  const [
    { data: composicoesData, error: erroComposicoes },
    { data: disciplinasData },
    { data: unidadesData },
  ] = await Promise.all([
    supabase.from('composicoes').select('id, codigo, nome, criado_em, disciplinas(nome)').eq('ativo', true),
    supabase.from('disciplinas').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('unidades_medida').select('id, sigla').order('sigla'),
  ])
  if (erroComposicoes) throw new Error(`Falha ao carregar o dashboard: ${erroComposicoes.message}`)

  const composicoes = composicoesData ?? []
  const idsComposicoes = composicoes.map(c => c.id)

  // Mesmo padrão "query separada + limite explícito" já usado em GET /api/composicoes
  // (B5a) — sem .limit(50000) o cap padrão do PostgREST poderia truncar a resposta
  // numa biblioteca grande, gerando contagens erradas.
  const [
    { data: usosData, error: erroUsos },
    { data: materiaisData, error: erroMateriais },
    { data: maoObraData, error: erroMaoObra },
    { data: itensData, error: erroItens },
  ] = await Promise.all([
    idsComposicoes.length > 0
      ? supabase.from('composicao_usos').select('composicao_id, criado_em').in('composicao_id', idsComposicoes).limit(50000)
      : Promise.resolve({ data: [], error: null }),
    idsComposicoes.length > 0
      ? supabase.from('composicao_materiais').select('composicao_id').in('composicao_id', idsComposicoes).limit(50000)
      : Promise.resolve({ data: [], error: null }),
    idsComposicoes.length > 0
      ? supabase.from('composicao_mao_obra').select('composicao_id').in('composicao_id', idsComposicoes).limit(50000)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('itens_orcamento').select('composicao_versao, composicoes(versao)').not('composicao_id', 'is', null).limit(50000),
  ])
  if (erroUsos) throw new Error(`Falha ao carregar o dashboard: ${erroUsos.message}`)
  if (erroMateriais) throw new Error(`Falha ao carregar o dashboard: ${erroMateriais.message}`)
  if (erroMaoObra) throw new Error(`Falha ao carregar o dashboard: ${erroMaoObra.message}`)
  if (erroItens) throw new Error(`Falha ao carregar o dashboard: ${erroItens.message}`)

  const idsComMateriais = new Set((materiaisData ?? []).map(m => m.composicao_id))
  const idsComMaoObra = new Set((maoObraData ?? []).map(m => m.composicao_id))

  const composicoesParaDashboard: ComposicaoParaDashboard[] = composicoes.map(c => ({
    id: c.id,
    codigo: c.codigo,
    nome: c.nome,
    disciplina_nome: (c.disciplinas as unknown as { nome: string } | null)?.nome ?? null,
    criado_em: c.criado_em,
    temMateriais: idsComMateriais.has(c.id),
    temMaoObra: idsComMaoObra.has(c.id),
  }))

  const usos: UsoParaDashboard[] = (usosData ?? []).map(u => ({
    composicao_id: u.composicao_id,
    criado_em: u.criado_em,
  }))

  const itensComComposicao: ItemComComposicaoParaDashboard[] = (itensData ?? [])
    .map(i => ({
      composicao_versao: i.composicao_versao,
      versao_atual: (i.composicoes as unknown as { versao: number } | null)?.versao ?? null,
    }))
    .filter((i): i is ItemComComposicaoParaDashboard => i.composicao_versao !== null && i.versao_atual !== null)

  const dados = calcularDashboardComposicoes(composicoesParaDashboard, usos, itensComComposicao)

  return (
    <ComposicoesDashboardClient
      dados={dados}
      disciplinas={disciplinasData ?? []}
      unidades={unidadesData ?? []}
    />
  )
}
