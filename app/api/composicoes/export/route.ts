import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { obterUsuarioComPermissoes, requirePermission } from '@/lib/permissoes/servidor'
import { montarPlanilhaComposicoes, type ComposicaoParaExportar } from '@/lib/excel/export-composicoes'

// Mesma lógica de filtros de GET /api/composicoes (busca/disciplina_id/tag/
// favoritos), mas sem paginação/ordenação/merge de favorito-usos-incompleta:
// o export inclui todas as composições ativas que passam pelos filtros.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'exportar_planilhas')) {
    return NextResponse.json({ error: 'Sem permissão para exportar planilhas' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const busca = searchParams.get('busca') ?? ''
  const buscaSanitizada = busca.replace(/[(),]/g, '')
  const disciplinaId = searchParams.get('disciplina_id') ?? ''
  const tag = searchParams.get('tag') ?? ''
  const somenteFavoritos = searchParams.get('favoritos') === 'true'

  function gerarArquivoVazio() {
    return montarPlanilhaComposicoes([])
  }

  let idsFavoritos: string[] = []
  if (somenteFavoritos) {
    const { data: favoritas, error: erroFavoritas } = await supabase
      .from('composicoes_favoritas')
      .select('composicao_id')
      .eq('usuario_id', user.id)
    if (erroFavoritas) return NextResponse.json({ error: erroFavoritas.message }, { status: 500 })
    idsFavoritos = (favoritas ?? []).map(f => f.composicao_id)
  }

  let wb: ReturnType<typeof montarPlanilhaComposicoes>
  if (somenteFavoritos && idsFavoritos.length === 0) {
    wb = gerarArquivoVazio()
  } else {
    let query = supabase
      .from('composicoes')
      .select(`
        codigo, nome, descricao_tecnica, produtividade, markup_sugerido, observacoes, tags,
        disciplinas (nome),
        unidades_medida (sigla),
        composicao_materiais (descricao, quantidade, fornecedor, preco_unitario, unidades_medida (sigla)),
        composicao_mao_obra (cargo, horas, custo_hora)
      `)
      .eq('ativo', true)
      .order('nome')

    if (buscaSanitizada) {
      query = query.or(
        `nome.ilike.%${buscaSanitizada}%,codigo.ilike.%${buscaSanitizada}%,descricao_tecnica.ilike.%${buscaSanitizada}%`
      )
    }
    if (disciplinaId) query = query.eq('disciplina_id', disciplinaId)
    if (tag) query = query.contains('tags', [tag])
    if (somenteFavoritos) query = query.in('id', idsFavoritos)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const composicoes: ComposicaoParaExportar[] = (data ?? []).map(c => ({
      codigo: c.codigo,
      nome: c.nome,
      disciplina_nome: (c.disciplinas as unknown as { nome: string } | null)?.nome ?? null,
      descricao_tecnica: c.descricao_tecnica,
      unidade_sigla: (c.unidades_medida as unknown as { sigla: string } | null)?.sigla ?? null,
      produtividade: c.produtividade,
      markup_sugerido: Number(c.markup_sugerido),
      observacoes: c.observacoes,
      tags: c.tags ?? [],
      materiais: (c.composicao_materiais ?? []).map(m => ({
        descricao: m.descricao,
        quantidade: Number(m.quantidade),
        unidade_sigla: (m.unidades_medida as unknown as { sigla: string } | null)?.sigla ?? null,
        fornecedor: m.fornecedor,
        preco_unitario: Number(m.preco_unitario),
      })),
      mao_obra: (c.composicao_mao_obra ?? []).map(mo => ({
        cargo: mo.cargo,
        horas: Number(mo.horas),
        custo_hora: Number(mo.custo_hora),
      })),
    }))

    wb = montarPlanilhaComposicoes(composicoes)
  }

  const buffer = await wb.xlsx.writeBuffer()
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="composicoes.xlsx"',
    },
  })
}
