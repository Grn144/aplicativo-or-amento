// app/api/composicoes/[id]/versoes/[versaoId]/restaurar/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizarMateriais, normalizarMaoObra, extrairCamposDeSnapshot, type MaterialBody, type MaoObraBody } from '@/lib/composicoes/normalizar'
import { atualizarComposicaoSeMudou } from '@/lib/composicoes/atualizar'
import { obterUsuarioComPermissoes, requirePermission } from '@/lib/permissoes/servidor'

interface SnapshotArquivado {
  composicao: {
    codigo: string
    nome: string
    disciplina_id: string | null
    descricao_tecnica: string
    unidade_id: string | null
    produtividade: string | null
    markup_sugerido: number
    observacoes: string | null
    tags?: string[]
    ativo?: boolean
  }
  materiais: MaterialBody[]
  mao_obra: MaoObraBody[]
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; versaoId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'editar_composicoes')) {
    return NextResponse.json({ error: 'Sem permissão para restaurar versões de composições' }, { status: 403 })
  }

  const { id, versaoId } = await params

  const { data: versaoRes, error: erroBusca } = await supabase
    .from('composicao_versoes')
    .select('snapshot')
    .eq('id', versaoId)
    .eq('composicao_id', id)
    .maybeSingle()
  if (erroBusca) return NextResponse.json({ error: erroBusca.message }, { status: 500 })
  if (!versaoRes) return NextResponse.json({ error: 'Versão não encontrada' }, { status: 404 })

  const snapshot = versaoRes.snapshot as SnapshotArquivado
  const camposNovos = extrairCamposDeSnapshot(snapshot.composicao)
  const materiaisNovos = normalizarMateriais(snapshot.materiais ?? [])
  const maoObraNova = normalizarMaoObra(snapshot.mao_obra ?? [])

  const resultado = await atualizarComposicaoSeMudou(supabase, user.id, id, camposNovos, materiaisNovos, maoObraNova)
  return NextResponse.json(resultado.body, { status: resultado.status })
}
