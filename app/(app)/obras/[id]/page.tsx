import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EditorOrcamento from '@/components/orcamento/EditorOrcamento'

type ObraCompleta = {
  id: string
  codigo: string
  nome: string
  status: import('@/types/database').StatusObra
  data_orcamento: string | null
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
      margem_mao_obra_pct: number
      margem_material_pct: number
      observacao: string | null
      observacao_2: string | null
      ordem: number
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

  const [obraResult, clientesResult, disciplinasResult, unidadesResult] = await Promise.all([
    supabase
      .from('obras')
      .select(`
        id, codigo, nome, status, data_orcamento,
        clientes (id, razao_social),
        grupos_orcamento (
          id, obra_id, disciplina_id, letra, ordem,
          disciplinas (id, nome, ativo),
          itens_orcamento (
            id, grupo_id, numero, descricao, local, unidade_id,
            quantidade, custo_unit_mao_obra, custo_unit_material,
            margem_mao_obra_pct, margem_material_pct,
            observacao, observacao_2, ordem,
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

  if (obraResult.error || !obraResult.data) notFound()

  const obra = obraResult.data as unknown as ObraCompleta

  // Ordenar grupos e itens por ordem
  obra.grupos_orcamento?.sort((a, b) => a.ordem - b.ordem)
  obra.grupos_orcamento?.forEach(g => {
    g.itens_orcamento?.sort((a, b) => a.ordem - b.ordem)
  })

  return (
    <EditorOrcamento
      obra={obra as unknown as Parameters<typeof EditorOrcamento>[0]['obra']}
      clientes={clientesResult.data ?? []}
      disciplinas={disciplinasResult.data ?? []}
      unidades={unidadesResult.data ?? []}
    />
  )
}
