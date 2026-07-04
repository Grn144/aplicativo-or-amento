import { Building2 } from 'lucide-react'
import { MARCA } from './marca'

export function LogoEmpresa() {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/30">
        <Building2 className="size-7 text-white" aria-hidden="true" />
      </div>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          {MARCA.nome}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{MARCA.subtitulo}</p>
      </div>
    </div>
  )
}
