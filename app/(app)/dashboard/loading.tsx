function Bloco({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-muted ${className}`} />
}

export default function LoadingDashboard() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Bloco className="h-8 w-40" />
        <Bloco className="h-9 w-44" />
        <Bloco className="h-9 flex-1 md:max-w-xs" />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <Bloco key={i} className="h-32" />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => <Bloco key={i} className="h-80" />)}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Bloco className="h-96 xl:col-span-2" />
        <Bloco className="h-96" />
      </div>
    </div>
  )
}
