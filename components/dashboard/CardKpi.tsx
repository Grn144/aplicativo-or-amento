import type { LucideIcon } from 'lucide-react'

const CORES = {
  azul: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  laranja: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  verde: 'bg-green-500/10 text-green-600 dark:text-green-400',
  vermelho: 'bg-red-500/10 text-red-600 dark:text-red-400',
  roxo: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
} as const

interface CardKpiProps {
  titulo: string
  valor: string
  variacaoPct: number | null
  icone: LucideIcon
  cor: keyof typeof CORES
}

function fmtVariacao(v: number): string {
  return `${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

export function CardKpi({ titulo, valor, variacaoPct, icone: Icone, cor }: CardKpiProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{titulo}</p>
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${CORES[cor]}`}>
          <Icone className="size-5" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-2 truncate text-2xl font-bold tracking-tight" title={valor}>{valor}</p>
      <p className="mt-1 text-xs">
        {variacaoPct === null ? (
          <span className="text-muted-foreground">—</span>
        ) : variacaoPct >= 0 ? (
          <span className="font-medium text-green-600 dark:text-green-400">↑ {fmtVariacao(variacaoPct)}</span>
        ) : (
          <span className="font-medium text-red-600 dark:text-red-400">↓ {fmtVariacao(variacaoPct)}</span>
        )}
        <span className="ml-1 text-muted-foreground">vs período anterior</span>
      </p>
    </div>
  )
}
