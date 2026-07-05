export interface Atividade {
  id: string
  usuario: string
  campo: string
  valorNovo: string | null
  obraCodigo: string
  obraNome: string
  quando: string // ISO timestamp
}

function descrever(a: Atividade): string {
  if (a.campo === 'status') return `alterou o status de ${a.obraCodigo} para "${a.valorNovo ?? '—'}"`
  return `alterou ${a.campo} em ${a.obraCodigo} — ${a.obraNome}`
}

export function AtividadesRecentes({ atividades }: { atividades: Atividade[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold">Atividades Recentes</h2>
      {atividades.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma atividade registrada.</p>
      ) : (
        <ol className="relative space-y-4 border-l border-border pl-4">
          {atividades.map(a => (
            <li key={a.id} className="relative">
              <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-blue-500" />
              <p className="text-sm">
                <span className="font-medium">{a.usuario}</span> {descrever(a)}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(a.quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
