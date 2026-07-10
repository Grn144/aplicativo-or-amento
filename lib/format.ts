export function round2(n: number): number {
  const fator = 100
  // Compensa erro de representação binária (ex.: 1.005 → 1.00499...)
  // antes de arredondar, para que .xx5 sempre suba.
  return Math.sign(n) * Math.round((Math.abs(n) * fator) + Number.EPSILON * fator) / fator
}

export function fmt(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtPct(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
}
