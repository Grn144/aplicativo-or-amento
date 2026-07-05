export function CardGrafico({
  titulo, vazio, children,
}: { titulo: string; vazio: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold">{titulo}</h2>
      {vazio ? (
        <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
          Nenhum orçamento neste período
        </div>
      ) : (
        <div className="h-72">{children}</div>
      )}
    </div>
  )
}
