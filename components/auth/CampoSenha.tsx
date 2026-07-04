'use client'

import { useId, useState } from 'react'
import { Eye, EyeOff, Lock } from 'lucide-react'
import { Input } from '@/components/ui/input'

type CampoSenhaProps = React.ComponentProps<'input'> & { erro?: string }

export function CampoSenha({ erro, id, className, ...props }: CampoSenhaProps) {
  const idGerado = useId()
  const inputId = id ?? idGerado
  const [visivel, setVisivel] = useState(false)

  return (
    <div>
      <div className="relative">
        <Lock
          aria-hidden="true"
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
        />
        <Input
          id={inputId}
          type={visivel ? 'text' : 'password'}
          className={`h-11 pr-10 pl-9 ${className ?? ''}`}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? `${inputId}-erro` : undefined}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisivel(v => !v)}
          aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
          className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
        >
          {visivel ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {erro && (
        <p id={`${inputId}-erro`} role="alert" className="mt-1.5 text-sm text-red-600">
          {erro}
        </p>
      )}
    </div>
  )
}
