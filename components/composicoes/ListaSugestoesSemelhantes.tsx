'use client'

interface Props<T> {
  titulo: string
  itens: T[]
  renderItem: (item: T) => React.ReactNode
  onSelecionar: (item: T) => void
  onDispensar: () => void
}

/** Lista dispensável de sugestões por similaridade — reaproveitada pelas 3
 * funcionalidades de IA da B5b (composições semelhantes, materiais
 * equivalentes, sugestão de composição no orçamento). Genérico em T pra
 * cada chamador decidir a forma exata do item e como renderizá-lo. */
export function ListaSugestoesSemelhantes<T>({ titulo, itens, renderItem, onSelecionar, onDispensar }: Props<T>) {
  if (itens.length === 0) return null
  return (
    <div className="space-y-1.5 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-blue-700 dark:text-blue-400">{titulo}</p>
        <button type="button" onClick={onDispensar} className="text-xs text-muted-foreground hover:text-foreground">
          Dispensar
        </button>
      </div>
      <ul className="space-y-1">
        {itens.map((item, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => onSelecionar(item)}
              className="w-full rounded-md px-2 py-1 text-left text-xs hover:bg-blue-500/10"
            >
              {renderItem(item)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
