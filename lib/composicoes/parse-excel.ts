// lib/composicoes/parse-excel.ts
// Só o tipo Celula é usado aqui — resolverCelula (a função) é chamada pelo
// caller (Task 5) para converter as abas do exceljs em Celula[][] antes de
// invocar este parser.
import type { Celula } from '@/lib/excel/parse-obra'

const COLUNAS_COMPOSICOES = [
  'código', 'nome', 'disciplina', 'descrição técnica', 'unidade',
  'produtividade', 'markup sugerido', 'observações', 'tags',
] as const

const COLUNAS_ITENS = [
  'código composição', 'tipo', 'descrição', 'quantidade', 'unidade', 'fornecedor', 'valor unitário',
] as const

export interface ItemImportadoComposicao {
  tipo: 'material' | 'mao_obra'
  descricao: string
  quantidade: number
  unidade: string | null
  fornecedor: string | null
  valor_unitario: number
}

export interface ComposicaoImportada {
  linha: number
  codigo: string
  nome: string
  disciplina: string | null
  descricao_tecnica: string
  unidade: string | null
  produtividade: string | null
  markup_sugerido: number
  observacoes: string | null
  tags: string[]
  itens: ItemImportadoComposicao[]
}

export interface ErroImportacao {
  linha: number
  codigo: string | null
  motivo: string
}

export interface ResultadoParseExcel {
  composicoes: ComposicaoImportada[]
  erros: ErroImportacao[]
}

function texto(v: Celula): string {
  return String(v ?? '').trim()
}

function numero(v: Celula): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function linhaEmBranco(linha: Celula[] | undefined): boolean {
  return !linha || linha.every(c => c === null || c === undefined || c === '')
}

function indiceColunas(cabecalho: Celula[], colunas: readonly string[]): Map<string, number> {
  const indices = new Map<string, number>()
  cabecalho.forEach((valor, i) => {
    const chave = texto(valor).toLowerCase()
    if (colunas.includes(chave)) indices.set(chave, i)
  })
  return indices
}

/** Parser puro (sem Supabase) da planilha de import de composições: aba
 * "Composições" (1 linha por composição) + aba "Itens" (1 linha por
 * material ou cargo de mão de obra, ligada pela coluna "Código
 * Composição"). Cada linha vem como Celula[][] (linha 0 = cabeçalho),
 * mesmo formato já usado pelo import de orçamento (lib/excel/parse-obra.ts).
 * Nunca resolve disciplina/unidade por nome nem verifica duplicidade contra
 * o banco — isso é responsabilidade do chamador (rota de import, Task 5). */
export function parseComposicoesExcel(
  linhasComposicoes: Celula[][],
  linhasItens: Celula[][]
): ResultadoParseExcel {
  const erros: ErroImportacao[] = []

  const idxComp = indiceColunas(linhasComposicoes[0] ?? [], COLUNAS_COMPOSICOES)
  const idxItens = indiceColunas(linhasItens[0] ?? [], COLUNAS_ITENS)

  const composicoesPorCodigo = new Map<string, ComposicaoImportada>()
  const linhasPorCodigo = new Map<string, number[]>()
  const codigosDuplicados = new Set<string>()

  for (let i = 1; i < linhasComposicoes.length; i++) {
    const linha = linhasComposicoes[i]
    if (linhaEmBranco(linha)) continue
    const numeroLinha = i + 1

    const codigo = texto(linha[idxComp.get('código') ?? -1])
    if (!codigo) {
      erros.push({ linha: numeroLinha, codigo: null, motivo: 'Código é obrigatório' })
      continue
    }

    const nome = texto(linha[idxComp.get('nome') ?? -1])
    const descricao_tecnica = texto(linha[idxComp.get('descrição técnica') ?? -1])
    if (!nome || !descricao_tecnica) {
      erros.push({ linha: numeroLinha, codigo, motivo: 'Nome e descrição técnica são obrigatórios' })
      continue
    }

    const disciplina = texto(linha[idxComp.get('disciplina') ?? -1]) || null
    const unidade = texto(linha[idxComp.get('unidade') ?? -1]) || null
    const produtividade = texto(linha[idxComp.get('produtividade') ?? -1]) || null
    const markupCelula = linha[idxComp.get('markup sugerido') ?? -1]
    const markup_sugerido =
      markupCelula === null || markupCelula === undefined || markupCelula === ''
        ? 1
        : numero(markupCelula)
    const observacoes = texto(linha[idxComp.get('observações') ?? -1]) || null
    const tagsTexto = texto(linha[idxComp.get('tags') ?? -1])
    const tags = tagsTexto ? tagsTexto.split(',').map(t => t.trim()).filter(Boolean) : []

    const entrada: ComposicaoImportada = {
      linha: numeroLinha, codigo, nome, disciplina, descricao_tecnica, unidade,
      produtividade, markup_sugerido, observacoes, tags, itens: [],
    }
    composicoesPorCodigo.set(codigo, entrada)
    const linhasDoCodigo = linhasPorCodigo.get(codigo) ?? []
    linhasDoCodigo.push(numeroLinha)
    linhasPorCodigo.set(codigo, linhasDoCodigo)
  }

  // Código repetido dentro da própria planilha: ambíguo qual das duas
  // "ganharia" o código — rejeita todas as ocorrências.
  for (const [codigo, linhasDoCodigo] of linhasPorCodigo) {
    if (linhasDoCodigo.length > 1) {
      composicoesPorCodigo.delete(codigo)
      codigosDuplicados.add(codigo)
      for (const numeroLinha of linhasDoCodigo) {
        erros.push({ linha: numeroLinha, codigo, motivo: 'Código duplicado nesta planilha' })
      }
    }
  }

  const codigosInvalidos = new Set<string>()

  for (let i = 1; i < linhasItens.length; i++) {
    const linha = linhasItens[i]
    if (linhaEmBranco(linha)) continue
    const numeroLinha = i + 1

    const codigo = texto(linha[idxItens.get('código composição') ?? -1])
    // Skip items for duplicated codes - errors already reported
    if (codigosDuplicados.has(codigo)) continue
    const composicao = composicoesPorCodigo.get(codigo)
    if (!composicao) {
      erros.push({ linha: numeroLinha, codigo: codigo || null, motivo: 'Código de composição não encontrado na aba Composições' })
      continue
    }

    const tipoOriginal = texto(linha[idxItens.get('tipo') ?? -1])
    const tipoNormalizado = tipoOriginal.toLowerCase()
    let tipo: 'material' | 'mao_obra'
    if (tipoNormalizado === 'material') {
      tipo = 'material'
    } else if (tipoNormalizado === 'mão de obra' || tipoNormalizado === 'mao de obra') {
      tipo = 'mao_obra'
    } else {
      erros.push({ linha: numeroLinha, codigo, motivo: `Tipo não reconhecido: "${tipoOriginal}"` })
      codigosInvalidos.add(codigo)
      continue
    }

    composicao.itens.push({
      tipo,
      descricao: texto(linha[idxItens.get('descrição') ?? -1]),
      quantidade: numero(linha[idxItens.get('quantidade') ?? -1]),
      unidade: texto(linha[idxItens.get('unidade') ?? -1]) || null,
      fornecedor: texto(linha[idxItens.get('fornecedor') ?? -1]) || null,
      valor_unitario: numero(linha[idxItens.get('valor unitário') ?? -1]),
    })
  }

  for (const codigo of codigosInvalidos) composicoesPorCodigo.delete(codigo)

  const composicoes: ComposicaoImportada[] = []
  for (const composicao of composicoesPorCodigo.values()) {
    if (composicao.itens.length === 0) {
      erros.push({
        linha: composicao.linha,
        codigo: composicao.codigo,
        motivo: 'A composição precisa ter ao menos um material ou item de mão de obra',
      })
      continue
    }
    composicoes.push(composicao)
  }

  return { composicoes, erros: erros.sort((a, b) => a.linha - b.linha) }
}
