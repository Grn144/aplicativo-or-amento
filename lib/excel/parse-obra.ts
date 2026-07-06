// Parser puro de planilha de orçamento (formato do export): separa linhas de
// disciplina das linhas de item. Recebe uma matriz de células (sem depender do
// exceljs) para ser testável isoladamente.

export type Celula = string | number | null | undefined

export interface ItemImportado {
  descricao: string
  local: string | null
  unidade: string | null // sigla
  quantidade: number
  custo_unit_mao_obra: number
  custo_unit_material: number
  margem_mao_obra_pct: number
  margem_material_pct: number
  observacao: string | null
}

export interface DisciplinaImportada {
  disciplina: string
  itens: ItemImportado[]
}

type Campo =
  | 'letra' | 'numero' | 'descricao' | 'local' | 'unidade' | 'quantidade'
  | 'custo_unit_mao_obra' | 'custo_unit_material'
  | 'margem_mao_obra_pct' | 'margem_material_pct' | 'observacao'

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
  'custo_unit_mao_obra': 'custo_unit_mao_obra', 'p unit mo': 'custo_unit_mao_obra',
  'custo mat': 'custo_unit_material', 'custo material': 'custo_unit_material',
  'material': 'custo_unit_material', 'mat': 'custo_unit_material',
  'custo_unit_material': 'custo_unit_material', 'p unit mat': 'custo_unit_material',
  'mg mo%': 'margem_mao_obra_pct', 'margem mo%': 'margem_mao_obra_pct',
  'margem mo': 'margem_mao_obra_pct', 'mg mo': 'margem_mao_obra_pct',
  'margem_mao_obra_pct': 'margem_mao_obra_pct',
  'mg mat%': 'margem_material_pct', 'margem mat%': 'margem_material_pct',
  'margem mat': 'margem_material_pct', 'mg mat': 'margem_material_pct',
  'margem_material_pct': 'margem_material_pct',
  'obs': 'observacao', 'observacao': 'observacao', 'observacoes': 'observacao',
}

function normalizar(v: Celula): string {
  return String(v ?? '')
    .toLowerCase()
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

export function parsePlanilhaObra(linhas: Celula[][]): DisciplinaImportada[] {
  // 1. Detecta a linha de cabeçalho (a que mapeia mais colunas conhecidas)
  let headerIdx = -1
  let melhorMapa: Record<number, Campo> = {}
  for (let i = 0; i < Math.min(linhas.length, 15); i++) {
    const mapa: Record<number, Campo> = {}
    linhas[i].forEach((cel, col) => {
      const campo = MAPA_COLUNAS[normalizar(cel)]
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
    atual.itens.push({
      descricao: desc,
      local: texto(val(linha, 'local')) || null,
      unidade: un || null,
      quantidade: numero(val(linha, 'quantidade')) || 1,
      custo_unit_mao_obra: numero(val(linha, 'custo_unit_mao_obra')),
      custo_unit_material: numero(val(linha, 'custo_unit_material')),
      margem_mao_obra_pct: numero(val(linha, 'margem_mao_obra_pct')),
      margem_material_pct: numero(val(linha, 'margem_material_pct')),
      observacao: texto(val(linha, 'observacao')) || null,
    })
  }

  return resultado.filter(d => d.itens.length > 0)
}
