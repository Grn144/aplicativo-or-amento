'use client'

interface LinhaLista {
  id: string
  codigo: string
  nome: string
  detalhe: string
}

interface Props {
  titulo: string
  linhas: LinhaLista[]
  totalCount: number
  aoClicarComposicao: (id: string) => void
}

export function ListaComposicoes({ titulo, linhas, totalCount, aoClicarComposicao }: Props) {
  const restantes = totalCount - linhas.length
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold">{titulo}</h2>
      {linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma composição.</p>
      ) : (
        <ul className="space-y-1">
          {linhas.map(l => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => aoClicarComposicao(l.id)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <span className="truncate">
                  <span className="font-mono text-xs text-muted-foreground">{l.codigo}</span>{' '}
                  <span className="font-medium">{l.nome}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{l.detalhe}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {restantes > 0 && (
        <p className="mt-2 px-2 text-xs text-muted-foreground">+{restantes} mais</p>
      )}
    </div>
  )
}
