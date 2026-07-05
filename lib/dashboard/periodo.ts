export type PeriodoKey = 'hoje' | '7d' | '30d' | '90d' | 'ano'

export const PERIODO_LABELS: Record<PeriodoKey, string> = {
  hoje: 'Hoje',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
  ano: 'Este ano',
}

export interface Intervalo {
  inicio: Date
  fim: Date
  inicioAnterior: Date
  fimAnterior: Date
}

const CHAVES: PeriodoKey[] = ['hoje', '7d', '30d', '90d', 'ano']

export function parsePeriodo(raw: string | undefined): PeriodoKey {
  return CHAVES.includes(raw as PeriodoKey) ? (raw as PeriodoKey) : '30d'
}

function inicioDoDia(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function fimDoDia(d: Date): Date {
  const r = new Date(d)
  r.setHours(23, 59, 59, 999)
  return r
}

function menosDias(d: Date, dias: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() - dias)
  return r
}

export function intervaloDoPeriodo(key: PeriodoKey, agora: Date = new Date()): Intervalo {
  if (key === 'ano') {
    const ano = agora.getFullYear()
    return {
      inicio: new Date(ano, 0, 1),
      fim: fimDoDia(new Date(ano, 11, 31)),
      inicioAnterior: new Date(ano - 1, 0, 1),
      fimAnterior: fimDoDia(new Date(ano - 1, 11, 31)),
    }
  }
  const dias = key === 'hoje' ? 1 : key === '7d' ? 7 : key === '30d' ? 30 : 90
  const inicio = inicioDoDia(menosDias(agora, dias - 1))
  return {
    inicio,
    fim: fimDoDia(agora),
    inicioAnterior: inicioDoDia(menosDias(inicio, dias)),
    fimAnterior: fimDoDia(menosDias(inicio, 1)),
  }
}

export function dataReferenciaObra(obra: {
  data_orcamento: string | null
  criado_em: string
}): Date {
  return obra.data_orcamento
    ? new Date(obra.data_orcamento + 'T00:00:00')
    : new Date(obra.criado_em)
}
