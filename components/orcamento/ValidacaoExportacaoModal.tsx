'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type { ProblemaExportacao } from '@/lib/orcamento/validacao-exportacao'

interface Props {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  problemas: ProblemaExportacao[]
  onConfirmar: () => void
}

export default function ValidacaoExportacaoModal({ aberto, onOpenChange, problemas, onConfirmar }: Props) {
  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-full max-w-xl overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Problemas encontrados no orçamento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Foram encontrados {problemas.length} problema(s) antes de exportar. Revise ou exporte mesmo assim.
          </p>

          <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border">
            {problemas.map((p, i) => (
              <div key={`${p.itemId}-${p.tipo}-${i}`} className="border-b border-border/50 px-3 py-2 text-sm last:border-b-0">
                <span className="font-medium">Item {p.itemNumero}</span>
                {p.itemDescricao && <span className="text-muted-foreground"> — {p.itemDescricao}</span>}
                <span className="text-muted-foreground">: {p.mensagem}</span>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onConfirmar}>Exportar mesmo assim</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
