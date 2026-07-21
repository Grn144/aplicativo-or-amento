import { notFound, redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { obterUsuarioComPermissoes, requirePermission } from '@/lib/permissoes/servidor'
import EditorOrcamento from '@/components/orcamento/EditorOrcamento'
import { calcularEstatisticasHistoricas, type EstatisticaComposicao } from '@/lib/orcamento/alertas'

type ObraCompleta = {
  id: string
  codigo: string
  nome: string
  status: import('@/types/database').StatusObra
  data_orcamento: string | null
  fee_fator: number
  comissao_valor: number
  imposto_valor: number
  clientes: { id: string; razao_social: string } | null
  grupos_orcamento: {
    id: string
    obra_id: string
    disciplina_id: string
    letra: string
    ordem: number
    disciplinas: { id: string; nome: string; ativo: boolean } | undefined
    itens_orcamento: {
      id: string
      grupo_id: string
      numero: number
      descricao: string
      local: string | null
      unidade_id: string | null
      quantidade: number
      custo_unit_mao_obra: number
      custo_unit_material: number
      markup_mao_obra: number
      markup_material: number
      fee_mao_obra: number | null
      fee_material: number | null
      observacao: string | null
      observacao_2: string | null
      ordem: number
      composicao_id: string | null
      composicao_versao: number | null
      composicoes: { versao: number; unidade_id: string | null } | null
      unidades_medida: { id: string; sigla: string; descricao: string | null } | null
    }[]
  }[]
}

export default async function ObraPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'visualizar_custos')) {
    // O editor é uma ferramenta de custo; quem não pode ver custos não entra.
    // (Comercial exporta a planilha comercial pela listagem de obras — Task 10.)
    redirect('/obras')
  }

  const admin = await createAdminClient()

  const [obraResult, clientesResult, disciplinasResult, unidadesResult] = await Promise.all([
    admin
      .from('obras')
      .select(`
        id, codigo, nome, status, data_orcamento,
        fee_fator, comissao_valor, imposto_valor,
        clientes (id, razao_social),
        grupos_orcamento (
          id, obra_id, disciplina_id, letra, ordem,
          disciplinas (id, nome, ativo),
          itens_orcamento (
            id, grupo_id, numero, descricao, local, unidade_id,
            quantidade, custo_unit_mao_obra, custo_unit_material,
            markup_mao_obra, markup_material,
            fee_mao_obra, fee_material,
            observacao, observacao_2, ordem,
            composicao_id, composicao_versao,
            composicoes (versao, unidade_id),
            unidades_medida (id, sigla, descricao)
          )
        )
      `)
      .eq('id', id)
      .single(),
    supabase.from('clientes').select('id, razao_social').order('razao_social'),
    supabase.from('disciplinas').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('unidades_medida').select('id, sigla').order('sigla'),
  ])

  if (obraResult.error) {
    if (obraResult.error.code === 'PGRST116') notFound()
    throw new Error(obraResult.error.message)
  }
  if (!obraResult.data) notFound()

  const obra = obraResult.data as unknown as ObraCompleta

  // Ordenar grupos e itens por ordem
  obra.grupos_orcamento?.sort((a, b) => a.ordem - b.ordem)
  obra.grupos_orcamento?.forEach(g => {
    g.itens_orcamento?.sort((a, b) => a.ordem - b.ordem)
  })

  const composicaoIds = [...new Set(
    (obra.grupos_orcamento ?? [])
      .flatMap(g => g.itens_orcamento ?? [])
      .map(i => i.composicao_id)
      .filter((id): id is string => id != null)
  )]

  let estatisticasHistoricas: Record<string, EstatisticaComposicao> = {}
  if (composicaoIds.length > 0) {
    const { data: itensHistorico } = await admin
      .from('itens_orcamento')
      .select('composicao_id, custo_unit_material, custo_unit_mao_obra, markup_material, markup_mao_obra, quantidade')
      .in('composicao_id', composicaoIds)

    if (itensHistorico) {
      const itensValidos = itensHistorico.filter(
        (i): i is typeof i & { composicao_id: string } => i.composicao_id != null
      )
      estatisticasHistoricas = calcularEstatisticasHistoricas(itensValidos)
    }
  }

  return (
    <EditorOrcamento
      obra={obra as unknown as Parameters<typeof EditorOrcamento>[0]['obra']}
      clientes={clientesResult.data ?? []}
      disciplinas={disciplinasResult.data ?? []}
      unidades={unidadesResult.data ?? []}
      estatisticasHistoricas={estatisticasHistoricas}
    />
  )
}
