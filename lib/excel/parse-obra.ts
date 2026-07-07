// Parser puro de planilha de orçamento (formato real do descritivo técnico e
// comercial da empresa): separa linhas de disciplina das linhas de item, e
// deriva o markup (multiplicador) a partir das colunas de venda ($) e fee do
// bloco comercial. Recebe uma matriz de células (sem depender do exceljs)
// para ser testável isoladamente.

export type Celula = string | number | null | undefined

export interface ItemImportado {
  descricao: string
  local: string | null
  unidade: string | null // sigla
  quantidade: number
  custo_unit_mao_obra: number
  custo_unit_material: number
  markup_mao_obra: number
  markup_material: number
  observacao: string | null
}

export interface DisciplinaImportada {
  disciplina: string
  itens: ItemImportado[]
}

export interface CabecalhoObra {
  codigo: string | null
  nome: string | null
  cliente: string | null
  endereco: string | null
  cnpj: string | null
}

type Campo =
  | 'letra' | 'numero' | 'descricao' | 'local' | 'unidade' | 'quantidade'
  | 'custo_unit_mao_obra' | 'custo_unit_material'
  | 'fee_mao_obra' | 'venda_mao_obra' | 'fee_material' | 'venda_material'
  | 'observacao'

const MAPA_COLUNAS: Record<string, Campo> = {
  'item': 'letra',
  'no': 'numero', 'n': 'numero', 'num': 'numero', 'numero': 'numero',
  'descricao': 'descricao', 'desc': 'descricao', 'description': 'descricao',
  'local': 'local', 'localizacao': 'local', 'location': 'local',
  'un': 'unidade', 'und': 'unidade', 'unid': 'unidade', 'unidade': 'unidade',
  'unidades': 'unidade', 'unit': 'unidade', 'sigla': 'unidade',
  'qt': 'quantidade', 'qtd': 'quantidade', 'qtde': 'quantidade',
  'quantidade': 'quantidade', 'qty': 'quantidade', 'quant': 'quantidade',
  'custo mo': 'custo_unit_mao_obra', 'custo mao de obra': 'custo_unit_mao_obra',
  'mo': 'custo_unit_mao_obra', 'mao de obra': 'custo_unit_mao_obra',
  'm obra': 'custo_unit_mao_obra',
  'custo_unit_mao_obra': 'custo_unit_mao_obra', 'p unit mo': 'custo_unit_mao_obra',
  'custo mat': 'custo_unit_material', 'custo material': 'custo_unit_material',
  'material': 'custo_unit_material', 'mat': 'custo_unit_material',
  'custo_unit_material': 'custo_unit_material', 'p unit mat': 'custo_unit_material',
  'obs': 'observacao', 'observacao': 'observacao', 'observacoes': 'observacao',
}

// Regexes usadas para classificar as colunas do bloco de venda/fee, cujos
// headers têm variações com "$" e repetições (ex.: "FEE M.OBRA", "$ M.OBRA",
// "FEE MAT", "$ MAT"). Aplicadas sobre o texto normalizado (ver `normalizar`).
const RE_FEE_MO = /fee.*(obra|mo)\b/
const RE_VENDA_MO = /(\$|preco|venda).*(obra|mo)\b/
const RE_FEE_MAT = /fee.*mat/
const RE_VENDA_MAT = /(\$|preco|venda).*mat/

function normalizar(v: Celula): string {
  return String(v ?? '')
    .toLowerCase()
    .replace(/\$/g, ' $ ')                            // preserva "$" como token isolado
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/\./g, ' ')                              // pontos viram espaço (Custo Mat.)
    .replace(/[ºª°]/g, '')                            // remove ordinais (Nº)
    .replace(/\s+/g, ' ')
    .trim()
}

function texto(v: Celula): string {
  return String(v ?? '').trim()
}

function numero(v: Celula): number {
  if (typeof v === 'number') return v
  const s = texto(v).replace(/[^\d,.-]/g, '').replace(',', '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

function ehNumero(v: Celula): boolean {
  if (typeof v === 'number') return true
  const s = texto(v)
  return s !== '' && Number.isFinite(parseFloat(s.replace(',', '.')))
}

/** Classifica uma coluna do bloco de venda/fee pelo texto normalizado do header. */
function classificarColunaVendaFee(headerNormalizado: string): Campo | null {
  if (RE_FEE_MO.test(headerNormalizado)) return 'fee_mao_obra'
  if (RE_FEE_MAT.test(headerNormalizado)) return 'fee_material'
  if (RE_VENDA_MO.test(headerNormalizado)) return 'venda_mao_obra'
  if (RE_VENDA_MAT.test(headerNormalizado)) return 'venda_material'
  return null
}

export function parsePlanilhaObra(linhas: Celula[][]): DisciplinaImportada[] {
  // 1. Detecta a linha de cabeçalho (a que mapeia mais colunas conhecidas,
  // incluindo as colunas de venda/fee classificadas por regex).
  let headerIdx = -1
  let melhorMapa: Record<number, Campo> = {}
  for (let i = 0; i < Math.min(linhas.length, 15); i++) {
    const mapa: Record<number, Campo> = {}
    linhas[i].forEach((cel, col) => {
      const normalizado = normalizar(cel)
      const campo = MAPA_COLUNAS[normalizado] ?? classificarColunaVendaFee(normalizado)
      if (campo) mapa[col] = campo
    })
    if (Object.keys(mapa).length > Object.keys(melhorMapa).length) {
      melhorMapa = mapa
      headerIdx = i
    }
  }
  if (headerIdx === -1 || !Object.values(melhorMapa).includes('descricao')) return []

  const colDe = (campo: Campo): number =>
    Number(Object.keys(melhorMapa).find(k => melhorMapa[Number(k)] === campo) ?? -1)
  const cDesc = colDe('descricao')
  const cNum = colDe('numero')
  const cQt = colDe('quantidade')

  const val = (linha: Celula[], campo: Campo): Celula => {
    const c = colDe(campo)
    return c >= 0 ? linha[c] : undefined
  }

  const resultado: DisciplinaImportada[] = []
  let atual: DisciplinaImportada | null = null

  for (let i = headerIdx + 1; i < linhas.length; i++) {
    const linha = linhas[i]
    const desc = texto(linha[cDesc])
    if (!desc) continue
    if (normalizar(desc).includes('total geral')) continue

    const temNumero = cNum >= 0 && ehNumero(linha[cNum])
    const temQt = cQt >= 0 && ehNumero(linha[cQt])
    const ehItem = temNumero || temQt

    if (!ehItem) {
      // Linha de disciplina
      atual = { disciplina: desc, itens: [] }
      resultado.push(atual)
      continue
    }

    // Linha de item — cria disciplina "GERAL" se aparecer antes de qualquer título
    if (!atual) {
      atual = { disciplina: 'GERAL', itens: [] }
      resultado.push(atual)
    }
    const un = texto(val(linha, 'unidade'))
    const feeMO = numero(val(linha, 'fee_mao_obra'))
    const vendaMO = numero(val(linha, 'venda_mao_obra'))
    const feeMAT = numero(val(linha, 'fee_material'))
    const vendaMAT = numero(val(linha, 'venda_material'))
    atual.itens.push({
      descricao: desc,
      local: texto(val(linha, 'local')) || null,
      unidade: un || null,
      quantidade: numero(val(linha, 'quantidade')) || 1,
      custo_unit_mao_obra: numero(val(linha, 'custo_unit_mao_obra')),
      custo_unit_material: numero(val(linha, 'custo_unit_material')),
      markup_mao_obra: feeMO > 0 ? vendaMO / feeMO : 1,
      markup_material: feeMAT > 0 ? vendaMAT / feeMAT : 1,
      observacao: texto(val(linha, 'observacao')) || null,
    })
  }

  return resultado.filter(d => d.itens.length > 0)
}

/**
 * Extrai os metadados do cabeçalho do descritivo técnico e comercial:
 * código e nome da obra, cliente (razão social), endereço e CNPJ.
 * Varre apenas as primeiras linhas (antes do cabeçalho de colunas).
 */
export function parseCabecalhoObra(linhas: Celula[][]): CabecalhoObra {
  const resultado: CabecalhoObra = {
    codigo: null,
    nome: null,
    cliente: null,
    endereco: null,
    cnpj: null,
  }

  // Extrai o texto relevante de cada linha (primeira célula não vazia).
  const linhasTexto: string[] = linhas.map(linha => {
    for (const cel of linha) {
      const t = texto(cel)
      if (t) return t
    }
    return ''
  })

  let linhasDeTextoEncontradas = 0
  for (const t of linhasTexto) {
    if (!t) continue

    const matchEndereco = /^ENDERE[ÇC]O\s*:\s*(.+)$/i.exec(t)
    if (matchEndereco) {
      resultado.endereco = matchEndereco[1].trim() || null
      continue
    }

    const matchCnpj = /^CNPJ\s*:\s*(.+)$/i.exec(t)
    if (matchCnpj) {
      resultado.cnpj = matchCnpj[1].trim() || null
      continue
    }

    // Linha de código+nome: primeiro token começa com dígito (ex.: "08092.01 MAGALU - DEPOSITO")
    const matchCodigo = /^(\d[\d.\-/]*)\s+(.+)$/.exec(t)
    if (matchCodigo && resultado.codigo === null) {
      resultado.codigo = matchCodigo[1].trim()
      resultado.nome = matchCodigo[2].trim()
      continue
    }

    // Demais linhas de texto (título, cliente): a 2ª linha de texto é o cliente (razão social).
    linhasDeTextoEncontradas += 1
    if (linhasDeTextoEncontradas === 2 && resultado.cliente === null) {
      resultado.cliente = t
    }
  }

  return resultado
}
