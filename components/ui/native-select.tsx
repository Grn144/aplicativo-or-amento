import * as React from 'react'
import { cn } from '@/lib/utils'

// Select nativo estilizado com os tokens de tema. Diferente do Select (base-ui),
// o <select> nativo sempre exibe o TEXTO da opção selecionada (nunca o value/id).
export function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors',
        'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        'disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
        className
      )}
      {...props}
    />
  )
}
