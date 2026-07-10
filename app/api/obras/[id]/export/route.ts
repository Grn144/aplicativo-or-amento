import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { montarPlanilhaDescritivo, type GrupoComItens } from '@/lib/excel/export-template'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  // ambos os tipos usam o mesmo layout hoje — templates comercial/técnico são byte-idênticos; ver Trilha D no plano
  const tipo = request.nextUrl.searchParams.get('tipo') === 'tecnico' ? 'tecnico' : 'comercial'

  const { data: obra, error } = await supabase
    .from('obras')
    .select(`
      codigo, nome,
      clientes (razao_social, endereco, cnpj),
      grupos_orcamento (
        letra, ordem,
        disciplinas (nome),
        itens_orcamento (
          numero, descricao, local, ordem,
          quantidade, custo_unit_mao_obra, custo_unit_material,
          observacao, observacao_2,
          unidades_medida (sigla)
        )
      )
    `)
    .eq('id', id)
    .single()

  if (error || !obra) {
    return NextResponse.json({ error: 'Obra não encontrada' }, { status: 404 })
  }

  const cliente = obra.clientes as unknown as { razao_social: string; endereco: string | null; cnpj: string | null } | null

  const grupos: GrupoComItens[] = (obra.grupos_orcamento ?? [])
    .slice()
    .sort((a, b) => a.ordem - b.ordem)
    .map(g => ({
      letra: g.letra,
      ordem: g.ordem,
      disciplina_nome: (g.disciplinas as unknown as { nome: string } | null)?.nome ?? '—',
      itens: (g.itens_orcamento ?? [])
        .slice()
        .sort((a, b) => a.ordem - b.ordem)
        .map(item => ({
          numero: item.numero,
          descricao: item.descricao,
          local: item.local,
          unidade_sigla: (item.unidades_medida as unknown as { sigla: string } | null)?.sigla ?? '',
          quantidade: Number(item.quantidade),
          custo_unit_mao_obra: Number(item.custo_unit_mao_obra),
          custo_unit_material: Number(item.custo_unit_material),
          observacao: item.observacao,
          observacao_2: item.observacao_2,
        })),
    }))

  const wb = montarPlanilhaDescritivo(
    { codigo: obra.codigo, nome: obra.nome, cliente },
    grupos
  )

  const buffer = await wb.xlsx.writeBuffer()
  const nomeArquivo = `orcamento-${tipo}-${obra.codigo.replace(/\s+/g, '-')}.xlsx`

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
    },
  })
}
