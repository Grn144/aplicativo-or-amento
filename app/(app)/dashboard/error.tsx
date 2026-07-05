'use client'

import { Button } from '@/components/ui/button'

export default function ErroDashboard({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-96 flex-col items-center justify-center gap-4 p-6">
      <p className="text-lg font-semibold">Não foi possível carregar o dashboard</p>
      <p className="text-sm text-muted-foreground">Verifique sua conexão e tente novamente.</p>
      <Button onClick={reset}>Tentar novamente</Button>
    </div>
  )
}
