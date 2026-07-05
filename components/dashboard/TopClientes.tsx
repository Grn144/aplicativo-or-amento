import { fmt } from '@/lib/format'

export function TopClientes({ clientes }: { clientes: { nome: string; obras: number; valor: number }[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold">Top Clientes</h2>
      {clientes.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhum cliente neste período.</p>
      ) : (
        <ul className="space-y-3">
          {clientes.map((c, i) => (
            <li key={c.nome} className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-xs font-semibold text-blue-600 dark:text-blue-400">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {c.obras} {c.obras === 1 ? 'obra' : 'obras'}
                </p>
              </div>
              <span className="font-mono text-sm">R$ {fmt(c.valor)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
