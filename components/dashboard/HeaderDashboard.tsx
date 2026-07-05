'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FileDown, Plus, Printer, Search } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { PERIODO_LABELS, type PeriodoKey } from '@/lib/dashboard/periodo'
import { cn } from '@/lib/utils'

export function HeaderDashboard({ periodo, usuario }: { periodo: PeriodoKey; usuario: { nome: string } }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [busca, setBusca] = useState(searchParams.get('busca') ?? '')
  const primeiraRenderizacao = useRef(true)

  useEffect(() => {
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false
      return
    }
    const t = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (busca) params.set('busca', busca)
      else params.delete('busca')
      router.replace(`/dashboard?${params.toString()}`, { scroll: false })
    }, 300)
    return () => clearTimeout(t)
    // searchParams fora das deps de propósito: só reagimos à digitação
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca])

  function mudarPeriodo(novo: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('periodo', novo ?? '30d')
    router.push(`/dashboard?${params.toString()}`)
  }

  const iniciais = usuario.nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('')

  return (
    <header className="no-print flex flex-wrap items-center gap-3">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>

      <Select value={periodo} onValueChange={mudarPeriodo}>
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(PERIODO_LABELS) as PeriodoKey[]).map(k => (
            <SelectItem key={k} value={k}>{PERIODO_LABELS[k]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="relative min-w-48 flex-1 md:max-w-xs">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar orçamento..."
          className="pl-9"
          aria-label="Buscar orçamento"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <a
          href={`/api/dashboard/export?periodo=${periodo}`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          <FileDown className="mr-1 size-4" /> Excel
        </a>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-1 size-4" /> PDF
        </Button>
        <Button size="sm" onClick={() => router.push('/obras?novo=1')}>
          <Plus className="mr-1 size-4" /> Novo Orçamento
        </Button>
        <ThemeToggle />
        <div
          className="flex size-9 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white"
          title={usuario.nome}
        >
          {iniciais}
        </div>
      </div>
    </header>
  )
}
