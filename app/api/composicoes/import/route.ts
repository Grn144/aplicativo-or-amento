import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'
import { resolverCelula, type Celula } from '@/lib/excel/parse-obra'
import { parseComposicoesExcel, type ErroImportacao } from '@/lib/composicoes/parse-excel'
import { criarComposicao } from '@/lib/composicoes/criar'
import type { MaterialBody, MaoObraBody } from '@/lib/composicoes/normalizar'

function linhasDaAba(ws: ExcelJS.Worksheet): Celula[][] {
  const linhas: Celula[][] = []
  ws.eachRow({ includeEmpty: true }, row => {
    const vals = row.values as unknown[]
    linhas.push(vals.slice(1).map(resolverCelula))
  })
  return linhas
}

// Cria composições novas a partir de uma planilha no formato exportado por
// GET /api/composicoes/export. Nunca atualiza composições existentes — um
// código já cadastrado é erro só naquela linha. Import é parcial: linhas
// válidas são criadas mesmo que outras da planilha tenham erro.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0])
  } catch {
    return NextResponse.json(
      { error: 'Arquivo inválido. Envie uma planilha .xlsx exportada pelo sistema.' },
      { status: 400 }
    )
  }

  const wsComposicoes = wb.getWorksheet('Composições')
  const wsItens = wb.getWorksheet('Itens')
  if (!wsComposicoes || !wsItens) {
    return NextResponse.json(
      { error: 'Planilha inválida. Ela precisa ter as abas "Composições" e "Itens".' },
      { status: 400 }
    )
  }

  const { composicoes, erros: errosParse } = parseComposicoesExcel(
    linhasDaAba(wsComposicoes),
    linhasDaAba(wsItens)
  )

  const erros: ErroImportacao[] = [...errosParse]
  let criadas = 0

  if (composicoes.length > 0) {
    const [{ data: discExistentes }, { data: unidadesExistentes }, { data: codigosExistentesData }] = await Promise.all([
      supabase.from('disciplinas').select('id, nome'),
      supabase.from('unidades_medida').select('id, sigla'),
      supabase.from('composicoes').select('codigo').in('codigo', composicoes.map(c => c.codigo)),
    ])
    const discPorNome = new Map<string, string>()
    for (const d of discExistentes ?? []) discPorNome.set(d.nome.trim().toUpperCase(), d.id)
    const unidadePorSigla = new Map<string, string>()
    for (const u of unidadesExistentes ?? []) unidadePorSigla.set(u.sigla.trim().toUpperCase(), u.id)
    const codigosExistentes = new Set((codigosExistentesData ?? []).map(c => c.codigo))

    async function resolverDisciplina(nome: string | null): Promise<string | null> {
      if (!nome) return null
      const chave = nome.trim().toUpperCase()
      const existente = discPorNome.get(chave)
      if (existente) return existente
      const { data: nova, error } = await supabase.from('disciplinas').insert({ nome: nome.trim() }).select('id').single()
      if (error || !nova) return null
      discPorNome.set(chave, nova.id)
      return nova.id
    }

    async function resolverUnidade(sigla: string | null): Promise<string | null> {
      if (!sigla) return null
      const chave = sigla.trim().toUpperCase()
      const existente = unidadePorSigla.get(chave)
      if (existente) return existente
      const { data: nova, error } = await supabase.from('unidades_medida').insert({ sigla: sigla.trim() }).select('id').single()
      if (error || !nova) return null
      unidadePorSigla.set(chave, nova.id)
      return nova.id
    }

    for (const comp of composicoes) {
      if (codigosExistentes.has(comp.codigo)) {
        erros.push({ linha: comp.linha, codigo: comp.codigo, motivo: 'Já existe uma composição com este código' })
        continue
      }

      const disciplina_id = await resolverDisciplina(comp.disciplina)
      const unidade_id = await resolverUnidade(comp.unidade)

      const materiais: MaterialBody[] = []
      const maoObra: MaoObraBody[] = []
      for (const item of comp.itens) {
        if (item.tipo === 'material') {
          materiais.push({
            descricao: item.descricao,
            quantidade: item.quantidade,
            unidade_id: await resolverUnidade(item.unidade),
            fornecedor: item.fornecedor,
            preco_unitario: item.valor_unitario,
          })
        } else {
          maoObra.push({ cargo: item.descricao, horas: item.quantidade, custo_hora: item.valor_unitario })
        }
      }

      const resultado = await criarComposicao(supabase, user.id, {
        codigo: comp.codigo,
        nome: comp.nome,
        disciplina_id,
        descricao_tecnica: comp.descricao_tecnica,
        unidade_id,
        produtividade: comp.produtividade,
        markup_sugerido: comp.markup_sugerido,
        observacoes: comp.observacoes,
        tags: comp.tags,
        materiais,
        mao_obra: maoObra,
      })

      if (resultado.status === 201) {
        criadas++
      } else {
        const motivo = typeof resultado.body.error === 'string' ? resultado.body.error : 'Falha ao criar composição'
        erros.push({ linha: comp.linha, codigo: comp.codigo, motivo })
      }
    }
  }

  return NextResponse.json({ criadas, erros: erros.sort((a, b) => a.linha - b.linha) })
}
