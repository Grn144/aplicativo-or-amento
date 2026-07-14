import type { LucideIcon } from 'lucide-react'

const CORES = {
  azul: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  laranja: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  cinza: 'bg-gray-500/10 text-gray-600 dark:text-gray-300',
  vermelho: 'bg-red-500/10 text-red-600 dark:text-red-400',
} as const

interface Props {
  titulo: string
  valor: number
  icone: LucideIcon
  cor: keyof typeof CORES
}

export function CardKpiComposicoes({ titulo, valor, icone: Icone, cor }: Props) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{titulo}</p>
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${CORES[cor]}`}>
          <Icone className="size-5" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{valor}</p>
    </div>
  )
}
