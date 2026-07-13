import ExcelJS from 'exceljs'

// Formato de planilha desenhado do zero para import/export de composições
// (não há template real da empresa para composições, diferente do orçamento).
// Ver docs/superpowers/specs/2026-07-13-banco-composicoes-b3-design.md.
// Os cabeçalhos abaixo são o contrato lido por lib/composicoes/parse-excel.ts.

export interface MaterialParaExportar {
  descricao: string
  quantidade: number
  unidade_sigla: string | null
  fornecedor: string | null
  preco_unitario: number
}

export interface MaoObraParaExportar {
  cargo: string
  horas: number
  custo_hora: number
}

export interface ComposicaoParaExportar {
  codigo: string
  nome: string
  disciplina_nome: string | null
  descricao_tecnica: string
  unidade_sigla: string | null
  produtividade: string | null
  markup_sugerido: number
  observacoes: string | null
  tags: string[]
  materiais: MaterialParaExportar[]
  mao_obra: MaoObraParaExportar[]
}

export function montarPlanilhaComposicoes(composicoes: ComposicaoParaExportar[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Sistema de Orçamentos'

  const wsComposicoes = wb.addWorksheet('Composições')
  wsComposicoes.columns = [
    { header: 'Código', key: 'codigo', width: 14 },
    { header: 'Nome', key: 'nome', width: 40 },
    { header: 'Disciplina', key: 'disciplina', width: 20 },
    { header: 'Descrição Técnica', key: 'descricao_tecnica', width: 50 },
    { header: 'Unidade', key: 'unidade', width: 10 },
    { header: 'Produtividade', key: 'produtividade', width: 20 },
    { header: 'Markup Sugerido', key: 'markup', width: 14 },
    { header: 'Observações', key: 'observacoes', width: 30 },
    { header: 'Tags', key: 'tags', width: 24 },
  ]
  for (const c of composicoes) {
    wsComposicoes.addRow({
      codigo: c.codigo,
      nome: c.nome,
      disciplina: c.disciplina_nome ?? '',
      descricao_tecnica: c.descricao_tecnica,
      unidade: c.unidade_sigla ?? '',
      produtividade: c.produtividade ?? '',
      markup: c.markup_sugerido,
      observacoes: c.observacoes ?? '',
      tags: c.tags.join(', '),
    })
  }

  const wsItens = wb.addWorksheet('Itens')
  wsItens.columns = [
    { header: 'Código Composição', key: 'codigo', width: 16 },
    { header: 'Tipo', key: 'tipo', width: 14 },
    { header: 'Descrição', key: 'descricao', width: 40 },
    { header: 'Quantidade', key: 'quantidade', width: 12 },
    { header: 'Unidade', key: 'unidade', width: 10 },
    { header: 'Fornecedor', key: 'fornecedor', width: 24 },
    { header: 'Valor Unitário', key: 'valor', width: 14 },
  ]
  for (const c of composicoes) {
    for (const m of c.materiais) {
      wsItens.addRow({
        codigo: c.codigo, tipo: 'Material', descricao: m.descricao, quantidade: m.quantidade,
        unidade: m.unidade_sigla ?? '', fornecedor: m.fornecedor ?? '', valor: m.preco_unitario,
      })
    }
    for (const mo of c.mao_obra) {
      wsItens.addRow({
        codigo: c.codigo, tipo: 'Mão de obra', descricao: mo.cargo, quantidade: mo.horas,
        unidade: '', fornecedor: '', valor: mo.custo_hora,
      })
    }
  }

  return wb
}
